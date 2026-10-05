import { useCallback, useEffect, useRef, useState } from "react";
import type { BranchEntry, Milestone, PanelUser, Project, Task, TeamDirectoryEntry, WorkboardMode } from "../../types";
import type { MilestoneDraft, SavedEvent } from "./firestoreWorkboard";

/** How long a save started while connecting waits for Firestore before giving up. */
const CONNECT_WAIT_MS = 10_000;

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "";
}

/** Friendly message for a failed save; the caller keeps whatever the person typed. */
export function saveErrorMessage(error: unknown, subject = "el cambio") {
  const code = errorCode(error);
  if (code === "cowork/conflict") return error instanceof Error ? error.message : "Otra persona modificó este elemento.";
  if (code === "permission-denied") return `No tienes permiso para guardar ${subject} en este proyecto.`;
  if (code === "unavailable" || code === "deadline-exceeded" || code === "cowork/offline") return `No hay conexión con Firebase. ${subject[0].toUpperCase()}${subject.slice(1)} no se guardó; vuelve a intentarlo.`;
  return error instanceof Error && error.message ? error.message : `No se pudo guardar ${subject}.`;
}

export type WorkboardReady = { tasks: boolean; branches: boolean; milestones: boolean; directory: boolean };
const NOTHING_READY: WorkboardReady = { tasks: false, branches: false, milestones: false, directory: false };
const ALL_READY: WorkboardReady = { tasks: true, branches: true, milestones: true, directory: true };

export function useWorkboard(user: PanelUser | null, project: Project | null, notify: (message: string) => void, onAccessRevoked: () => void, onWork: (saved: SavedEvent | null) => void) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [branches, setBranches] = useState<BranchEntry[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [directory, setDirectory] = useState<TeamDirectoryEntry[]>([]);
  const [mode, setMode] = useState<WorkboardMode>("connecting");
  // Which collections have delivered their first snapshot, so the pages can tell "loading" from "empty".
  const [ready, setReady] = useState<WorkboardReady>(NOTHING_READY);
  const projectId = project?.id ?? "";
  const userId = user?.id ?? "";
  const projectRef = useRef(projectId);
  projectRef.current = projectId;

  useEffect(() => {
    setTasks([]);
    setBranches([]);
    setMilestones([]);
    setDirectory([]);
    setReady(NOTHING_READY);
    if (!user || !project) {
      setMode("connecting");
      return;
    }

    let active = true;
    let tasksReady = false;
    let branchesReady = false;
    let tasksFromCache = false;
    let branchesFromCache = false;
    let accessRejected = false;
    const stops: (() => void)[] = [];
    setMode("connecting");

    const markReady = (key: keyof WorkboardReady) => setReady((value) => value[key] ? value : { ...value, [key]: true });

    const reportError = (error: Error) => {
      if (!active) return;
      setMode("offline");
      setReady(ALL_READY);
      if (errorCode(error) === "permission-denied") {
        if (accessRejected) return;
        accessRejected = true;
        setTasks([]);
        setBranches([]);
        setMilestones([]);
        setDirectory([]);
        notify("Este proyecto ya no está disponible para tu cuenta. El acceso se limita a sus miembros activos.");
        onAccessRevoked();
        return;
      }
      notify("Sin conexión con Firebase. Los cambios nuevos requieren conexión y no se guardarán como datos locales.");
    };

    const refreshConnection = () => {
      if (tasksReady && branchesReady) setMode(tasksFromCache || branchesFromCache ? "offline" : "remote");
    };

    const keep = (stop: () => void) => {
      if (active) stops.push(stop);
      else stop();
    };

    void Promise.all([import("./firestoreWorkboard"), import("../team/teamDirectory")]).then(async ([workboard, team]) => {
      await workboard.initializeProject(project);
      if (!active) return;
      keep(await workboard.listenForTasks(project.id, (next, fromCache) => {
        if (!active) return;
        setTasks(next);
        markReady("tasks");
        tasksReady = true;
        tasksFromCache = fromCache;
        refreshConnection();
      }, reportError));
      keep(await workboard.listenForBranches(project.id, (next, fromCache) => {
        if (!active) return;
        setBranches(next);
        markReady("branches");
        branchesReady = true;
        branchesFromCache = fromCache;
        refreshConnection();
      }, reportError));
      keep(await workboard.listenForMilestones(project.id, (next) => { if (active) { setMilestones(next); markReady("milestones"); } }, reportError));
      keep(await team.watchDirectory(project.id, (next) => { if (active) { setDirectory(next); markReady("directory"); } }, reportError));
      // Keep this person's name and avatar visible to the team.
      void team.ensureOwnDirectoryEntry(project.id, user).catch(() => undefined);
    }).catch(reportError);

    return () => {
      active = false;
      stops.forEach((stop) => stop());
    };
    // `user` changes identity when the profile refreshes; only the account matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify, onAccessRevoked, projectId, userId]);

  // A save started while the listeners are still connecting waits for them instead of failing:
  // right after opening a project, typing a task and pressing Enter should just work.
  const modeRef = useRef(mode);
  const modeWaiters = useRef(new Set<() => void>());
  useEffect(() => {
    modeRef.current = mode;
    if (mode !== "connecting") modeWaiters.current.forEach((wake) => wake());
  }, [mode]);

  const requireConnection = useCallback(async () => {
    if (modeRef.current === "connecting") {
      await new Promise<void>((resolve) => {
        const wake = () => { window.clearTimeout(timer); modeWaiters.current.delete(wake); resolve(); };
        const timer = window.setTimeout(wake, CONNECT_WAIT_MS);
        modeWaiters.current.add(wake);
      });
    }
    if (modeRef.current === "remote") return;
    throw Object.assign(new Error(modeRef.current === "connecting" ? "Firebase está tardando en conectar. El cambio no se guardó; vuelve a intentarlo en unos segundos." : "No hay conexión con Firebase. El cambio no se guardó; vuelve a intentarlo."), { code: "cowork/offline" });
  }, []);

  const run = useCallback(async <T,>(subject: string, action: (api: typeof import("./firestoreWorkboard")) => Promise<T>) => {
    if (!user || !project) throw new Error("Abre un proyecto para guardar cambios.");
    const target = projectId;
    await requireConnection();
    if (target !== projectRef.current) throw new Error("Cambiaste de proyecto antes de que se guardara. El cambio no se guardó.");
    try {
      const api = await import("./firestoreWorkboard");
      return await action(api);
    } catch (error) {
      if (errorCode(error) === "unavailable") setMode("offline");
      throw Object.assign(new Error(saveErrorMessage(error, subject)), { code: errorCode(error) });
    }
  }, [project, projectId, requireConnection, user]);

  const createTask = useCallback(async (draft: Task) => {
    const saved = await run("la tarea", (api) => api.createTask(projectId, draft, user!));
    onWork(saved);
  }, [onWork, projectId, run, user]);

  const updateTask = useCallback(async (base: Task, next: Task) => {
    const saved = await run("la tarea", (api) => api.updateTask(projectId, base, next, user!));
    onWork(saved);
  }, [onWork, projectId, run, user]);

  const removeTask = useCallback(async (task: Task) => {
    await run("la eliminación", (api) => api.deleteTask(projectId, task, user!));
  }, [projectId, run, user]);

  const createBranch = useCallback(async (branch: BranchEntry) => {
    const saved = await run("la rama", (api) => api.createBranch(projectId, branch, user!));
    onWork(saved);
  }, [onWork, projectId, run, user]);

  const removeBranch = useCallback(async (entry: BranchEntry) => {
    await run("la eliminación", (api) => api.deleteBranch(projectId, entry, user!));
  }, [projectId, run]);

  const createMilestone = useCallback(async (draft: MilestoneDraft) => {
    await run("el hito", (api) => api.createMilestone(projectId, draft, user!));
  }, [projectId, run, user]);

  const updateMilestone = useCallback(async (base: Milestone, draft: MilestoneDraft) => {
    await run("el hito", (api) => api.updateMilestone(projectId, base, draft, user!));
  }, [projectId, run, user]);

  return { tasks, branches, milestones, directory, mode, ready, createTask, updateTask, removeTask, createBranch, removeBranch, createMilestone, updateMilestone };
}

export type Workboard = ReturnType<typeof useWorkboard>;
