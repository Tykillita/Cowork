import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityEvent, FileDraft, Milestone, OwnAccessRequest, PanelUser, Project, ProjectAccessRequest, Task } from "../../types";
import type { ReadState } from "../personal/personalStore";
import { dueState, milestoneProgress } from "../milestones/milestoneModel";
import { isFeedEvent, readEvent } from "./activityEvents";
import { dueInfo } from "../workboard/taskFilters";
import { buildHash } from "../../lib/hashRoute";

export const ACTIVITY_PAGE = 15;

type ProjectFeed = {
  events: ActivityEvent[];
  milestones: Milestone[];
  /** Every task, so milestone completion is known for every project. */
  tasks: Task[] | null;
  pendingRequests: ProjectAccessRequest[];
  /** Files proposed in Cowork and waiting for review (or rejected). */
  drafts: FileDraft[];
  exhausted: boolean;
};

export type ForYouItem = {
  id: string;
  projectId: string;
  kind: "request" | "decision" | "task" | "notice" | "review";
  title: string;
  detail: string;
  tone: "info" | "success" | "warning" | "error";
  /** Section to open, e.g. "#settings-page". Empty when the project cannot be opened. */
  target: string;
  unreadable: boolean;
};

const EMPTY_FEED: ProjectFeed = { events: [], milestones: [], tasks: null, pendingRequests: [], drafts: [], exhausted: false };

/**
 * Proposed files: reviewers see what waits for them (one line per project),
 * authors see their rejected files until they open or discard them.
 */
export function draftItems(project: Project, drafts: FileDraft[], uid: string): ForYouItem[] {
  const items: ForYouItem[] = [];
  const reviewer = project.ownerUid === uid || project.githubPolicy?.branchWrite === "members";
  const link = (draft: FileDraft) => buildHash("code", { ref: draft.ref, path: draft.path });
  const name = (draft: FileDraft) => draft.path.slice(draft.path.lastIndexOf("/") + 1);
  const waiting = reviewer ? drafts.filter((draft) => draft.status === "pending" && draft.authorUid !== uid) : [];
  if (waiting.length) {
    const authors = [...new Set(waiting.map((draft) => draft.authorName))];
    items.push({
      id: `review:${project.id}`,
      projectId: project.id,
      kind: "review",
      title: waiting.length === 1 ? `${name(waiting[0])} espera revisión` : `${waiting.length} archivos esperan revisión`,
      detail: `${project.name} · ${authors.length === 1 ? `propuesto por ${authors[0]}` : `de ${authors.length} personas`}`,
      tone: "info",
      target: waiting.length === 1 ? link(waiting[0]) : "#code",
      unreadable: false,
    });
  }
  for (const draft of drafts.filter((entry) => entry.status === "rejected" && entry.authorUid === uid)) {
    items.push({
      id: `review:${project.id}:${draft.id}:rejected`,
      projectId: project.id,
      kind: "review",
      title: `Rechazaron tu archivo ${name(draft)}`,
      detail: `${project.name}${draft.reviewNote ? ` · ${draft.reviewNote}` : ""}`,
      tone: "warning",
      target: link(draft),
      unreadable: true,
    });
  }
  return items;
}

/**
 * Delivery notices for the next 24 hours and overdue ones. The id includes the
 * target, its due instant and the notice type, so it never repeats, and a new
 * date produces a new notice.
 */
export function deadlineNotices(project: Project, milestones: Milestone[], tasks: Task[] | null, now: number, uid = ""): ForYouItem[] {
  const notices: ForYouItem[] = [];
  const push = (targetId: string, title: string, dueAt: string, kind: "project" | "milestone" | "task") => {
    const state = dueState(dueAt, now);
    if (state === "later") return;
    notices.push({
      id: `notice:${project.id}:${kind}:${targetId}:${dueAt}:${state}`,
      projectId: project.id,
      kind: "notice",
      title: state === "overdue" ? `Vencido: ${title}` : `Vence en menos de 24 h: ${title}`,
      detail: project.name,
      tone: state === "overdue" ? "error" : "warning",
      target: kind === "milestone" ? "#work?focus=milestones" : kind === "task" ? buildHash("work", { task: targetId }) : "#home",
      unreadable: true,
    });
  };
  if (project.schedule) push(project.id, "entrega del proyecto", project.schedule.endsAt, "project");
  for (const milestone of milestones) {
    if (milestone.archived) continue;
    // Wait for the tasks: a complete milestone must never produce a notice.
    if (!tasks || milestoneProgress(milestone, tasks).complete) continue;
    push(milestone.id, `hito «${milestone.title}»`, milestone.dueAt, "milestone");
  }
  // Due dates of my own open tasks.
  for (const task of tasks ?? []) {
    if (!uid || task.assigneeUid !== uid || task.status === "Hecha" || !task.dueAt) continue;
    push(task.id, `tarea «${task.title}»`, task.dueAt, "task");
  }
  return notices;
}

export function useActivityCenter(user: PanelUser | null, projects: Project[], currentTasks: { projectId: string; tasks: Task[] } | null) {
  const [feeds, setFeeds] = useState<Map<string, ProjectFeed>>(new Map());
  const [limits, setLimits] = useState<Map<string, number>>(new Map());
  const [readStates, setReadStates] = useState<Map<string, ReadState> | null>(null);
  const [ownRequests, setOwnRequests] = useState<OwnAccessRequest[]>([]);
  // Projects whose first page of events has answered (or failed). Kept across "load more",
  // so only the first load of the account's projects shows placeholders.
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const baselined = useRef(new Set<string>());
  const eventListeners = useRef(new Map<string, { key: string; stop: () => void }>());
  const eventGeneration = useRef(0);
  const uid = user?.id ?? "";
  const projectKey = projects.map((project) => `${project.id}:${project.ownerUid === uid ? "o" : "m"}`).join("|");
  const limitKey = [...limits.entries()].map(([id, value]) => `${id}:${value}`).join("|");

  // Notices are recomputed when the app starts, the tray opens and the window regains focus.
  const refreshNow = useCallback(() => setNow(Date.now()), []);
  useEffect(() => {
    window.addEventListener("focus", refreshNow);
    return () => window.removeEventListener("focus", refreshNow);
  }, [refreshNow]);

  // Personal read state and own requests.
  useEffect(() => {
    setReadStates(null);
    setOwnRequests([]);
    baselined.current.clear();
    if (!uid) return;
    let active = true;
    const stops: (() => void)[] = [];
    const keep = (stop: () => void) => { if (active) stops.push(stop); else stop(); };
    void Promise.all([import("../personal/personalStore"), import("../projects/projectAccess")]).then(async ([personal, access]) => {
      keep(await personal.watchReadStates(uid, (states) => { if (active) setReadStates(states); }, () => { if (active) setReadStates(new Map()); }));
      keep(await access.watchOwnAccessRequests(uid, (requests) => { if (active) setOwnRequests(requests); }, () => undefined));
    }).catch(() => undefined);
    return () => { active = false; stops.forEach((stop) => stop()); };
  }, [uid]);

  useEffect(() => { setSettled(new Set()); }, [projectKey, uid]);

  // Task, milestone and request feeds stay subscribed while an event page grows.
  useEffect(() => {
    setFeeds(new Map());
    if (!uid || !projects.length) return;
    let active = true;
    const stops: (() => void)[] = [];
    const keep = (stop: () => void) => { if (active) stops.push(stop); else stop(); };
    const update = (projectId: string, patch: Partial<ProjectFeed>) => {
      if (!active) return;
      setFeeds((current) => {
        const next = new Map(current);
        next.set(projectId, { ...(current.get(projectId) ?? EMPTY_FEED), ...patch });
        return next;
      });
    };
    const settle = (projectId: string) => {
      if (!active) return;
      setSettled((current) => current.has(projectId) ? current : new Set(current).add(projectId));
    };
    const drop = (projectId: string) => {
      if (!active) return;
      settle(projectId);
      setFeeds((current) => { const next = new Map(current); next.delete(projectId); return next; });
    };

    void Promise.all([import("../../lib/firebase"), import("firebase/firestore"), import("../workboard/firestoreWorkboard"), import("../projects/projectAccess"), import("../code/fileDrafts")]).then(async ([{ getCoworkFirestore }, api, workboard, access, { readFileDraft }]) => {
      const db = await getCoworkFirestore();
      if (!db || !active) return;
      for (const project of projects) {
        const onError = () => drop(project.id);
        keep(api.onSnapshot(api.collection(db, "projects", project.id, "milestones"), (snapshot) => {
          update(project.id, { milestones: snapshot.docs.map((entry) => workboard.readMilestone(entry.id, entry.data())) });
        }, onError));
        keep(api.onSnapshot(workboard.tasksQuery(api, db, project.id), (snapshot) => {
          update(project.id, { tasks: snapshot.docs.map((entry) => workboard.readTask(entry.id, entry.data())) });
        }, onError));
        // Older rules may not allow drafts yet: that only hides them, not the project's feed.
        keep(api.onSnapshot(api.query(api.collection(db, "projects", project.id, "fileDrafts"), api.orderBy("createdAt", "desc")), (snapshot) => {
          update(project.id, { drafts: snapshot.docs.map((entry) => readFileDraft(entry.id, entry.data())) });
        }, () => update(project.id, { drafts: [] })));
        if (project.ownerUid === uid) {
          keep(await access.watchAccessRequests(project.id, (requests) => update(project.id, { pendingRequests: requests }), onError, true));
        }
      }
    }).catch(() => undefined);
    return () => { active = false; stops.forEach((stop) => stop()); };
    // Only the list of projects/roles matters, not project object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey, uid]);

  // Reconcile event listeners individually: loading more in one project must not
  // re-read every other project's events, tasks, milestones and requests.
  useEffect(() => {
    const generation = ++eventGeneration.current;
    const desired = new Map(projects.map((project) => [project.id, `${uid}:${projectKey}:${limits.get(project.id) ?? ACTIVITY_PAGE}`]));
    for (const [id, listener] of eventListeners.current) {
      if (desired.get(id) === listener.key) continue;
      listener.stop();
      eventListeners.current.delete(id);
    }
    if (!uid || !projects.length) return;
    void Promise.all([import("../../lib/firebase"), import("firebase/firestore")]).then(async ([{ getCoworkFirestore }, api]) => {
      const db = await getCoworkFirestore();
      if (!db || generation !== eventGeneration.current) return;
      for (const project of projects) {
        if (eventListeners.current.has(project.id)) continue;
        const pageSize = limits.get(project.id) ?? ACTIVITY_PAGE;
        let active = true;
        const stop = api.onSnapshot(
          api.query(api.collection(db, "projects", project.id, "events"), api.orderBy("createdAt", "desc"), api.limit(pageSize)),
          (snapshot) => {
            if (!active) return;
            setFeeds((current) => {
              const next = new Map(current);
              next.set(project.id, { ...(current.get(project.id) ?? EMPTY_FEED), events: snapshot.docs.map((entry) => readEvent(entry.id, entry.data())), exhausted: snapshot.docs.length < pageSize });
              return next;
            });
            setSettled((current) => current.has(project.id) ? current : new Set(current).add(project.id));
          },
          () => {
            if (!active) return;
            setSettled((current) => current.has(project.id) ? current : new Set(current).add(project.id));
            setFeeds((current) => { const next = new Map(current); next.delete(project.id); return next; });
          },
        );
        eventListeners.current.set(project.id, { key: desired.get(project.id)!, stop: () => { active = false; stop(); } });
      }
    }).catch(() => {
      if (generation === eventGeneration.current) setSettled(new Set(projects.map((project) => project.id)));
    });
    // Only project IDs, roles and page sizes define these listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey, uid, limitKey]);

  useEffect(() => () => {
    eventGeneration.current += 1;
    eventListeners.current.forEach((listener) => listener.stop());
    eventListeners.current.clear();
  }, []);

  // First sight of a project: everything before now counts as read.
  useEffect(() => {
    if (!uid || !readStates) return;
    for (const project of projects) {
      if (readStates.has(project.id) || baselined.current.has(project.id)) continue;
      baselined.current.add(project.id);
      void import("../personal/personalStore").then(({ markAllRead }) => markAllRead(uid, project.id, [])).catch(() => undefined);
    }
  }, [projects, readStates, uid]);

  const projectName = useCallback((id: string) => projects.find((project) => project.id === id)?.name ?? "Proyecto", [projects]);

  const events = useMemo(() => [...feeds.values()]
    .flatMap((feed) => feed.events)
    .filter(isFeedEvent)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [feeds]);

  const isUnreadEvent = useCallback((event: ActivityEvent) => {
    if (event.actorUid === uid) return false;
    const state = readStates?.get(event.projectId);
    if (!state) return false;
    return Date.parse(event.createdAt) > state.lastReadAt && !state.readIds.includes(event.id);
  }, [readStates, uid]);

  const forYou = useMemo<ForYouItem[]>(() => {
    const items: ForYouItem[] = [];
    for (const project of projects) {
      const feed = feeds.get(project.id);
      if (!feed) continue;
      for (const request of feed.pendingRequests) {
        items.push({
          id: `request:${project.id}:${request.uid}:${request.attempt}`,
          projectId: project.id,
          kind: "request",
          title: `${request.name} solicita acceso`,
          detail: request.attempt > 1 ? `${project.name} · intento ${request.attempt}` : project.name,
          tone: "info",
          target: "#settings-page",
          unreadable: false,
        });
      }
      // The open project's tasks may be fresher than this listener after a local save.
      const tasks = currentTasks?.projectId === project.id ? currentTasks.tasks : feed.tasks;
      const notices = deadlineNotices(project, feed.milestones, tasks, now, uid);
      items.push(...notices);
      for (const task of (tasks ?? []).filter((entry) => entry.assigneeUid === uid && entry.status !== "Hecha")) {
        // A task with a due notice is already listed once.
        if (notices.some((notice) => notice.id.startsWith(`notice:${project.id}:task:${task.id}:`))) continue;
        const due = dueInfo(task, now);
        items.push({ id: `task:${project.id}:${task.id}`, projectId: project.id, kind: "task", title: task.title, detail: `${project.name} · ${task.status}${due ? ` · ${due.label}` : ""}`, tone: "info", target: buildHash("work", { task: task.id }), unreadable: false });
      }
      items.push(...draftItems(project, feed.drafts, uid));
    }
    for (const request of ownRequests) {
      if (request.status === "pending" || request.status === "unknown") continue;
      const member = projects.some((project) => project.id === request.projectId);
      const retry = request.status === "rejected" && request.retryAllowed;
      items.push({
        id: `decision:${request.projectId}:${request.status}:${retry ? "retry" : "final"}:${request.createdAt}`,
        projectId: request.projectId,
        kind: "decision",
        title: request.status === "approved" ? `Te aprobaron en ${request.projectName}` : retry ? `Puedes volver a solicitar acceso a ${request.projectName}` : `Rechazaron tu solicitud a ${request.projectName}`,
        detail: request.status === "approved" ? (member ? "Ya puedes abrir el proyecto." : "El proyecto aparecerá en tu lista.") : retry ? "El propietario habilitó un nuevo intento." : "El propietario decidió no darte acceso.",
        tone: request.status === "approved" ? "success" : retry ? "warning" : "error",
        target: request.status === "approved" && member ? "#home" : "",
        unreadable: true,
      });
    }
    return items;
  }, [currentTasks, feeds, now, ownRequests, projects, uid]);

  const isUnreadItem = useCallback((item: ForYouItem) => {
    if (!item.unreadable) return false;
    const state = readStates?.get(item.projectId);
    return !state?.readIds.includes(item.id);
  }, [readStates]);

  const pendingRequestCount = forYou.filter((item) => item.kind === "request").length;
  const unreadCount = events.filter(isUnreadEvent).length + forYou.filter(isUnreadItem).length;

  const markRead = useCallback(async (projectId: string, entryId: string) => {
    if (!uid) return;
    const { markRead: save } = await import("../personal/personalStore");
    await save(uid, projectId, entryId, readStates?.get(projectId));
  }, [readStates, uid]);

  const markAllRead = useCallback(async (projectId: string | null) => {
    if (!uid) return;
    const { markAllRead: save } = await import("../personal/personalStore");
    const targets = projectId ? [projectId] : [...new Set([...projects.map((project) => project.id), ...forYou.map((item) => item.projectId)])];
    await Promise.all(targets.map((id) => save(uid, id, forYou.filter((item) => item.projectId === id && item.unreadable).map((item) => item.id))));
  }, [forYou, projects, uid]);

  const loadMore = useCallback((projectId: string | null) => {
    setLimits((current) => {
      const next = new Map(current);
      for (const project of projects) {
        if (projectId && project.id !== projectId) continue;
        next.set(project.id, (current.get(project.id) ?? ACTIVITY_PAGE) + ACTIVITY_PAGE);
      }
      return next;
    });
  }, [projects]);

  const canLoadMore = useCallback((projectId: string | null) => [...feeds.entries()]
    .some(([id, feed]) => (!projectId || id === projectId) && !feed.exhausted), [feeds]);

  const milestoneTitle = useCallback((id: string) => {
    for (const feed of feeds.values()) {
      const found = feed.milestones.find((milestone) => milestone.id === id);
      if (found) return found.title;
    }
    return "";
  }, [feeds]);

  const ready = readStates !== null && projects.every((project) => settled.has(project.id));
  /** One project's first page of events has answered; the summary card waits only for its own project. */
  const projectReady = useCallback((projectId: string) => readStates !== null && settled.has(projectId), [readStates, settled]);

  return { ready, projectReady, events, forYou, pendingRequestCount, unreadCount, isUnreadEvent, isUnreadItem, markRead, markAllRead, loadMore, canLoadMore, refreshNow, projectName, milestoneTitle };
}

export type ActivityCenterState = ReturnType<typeof useActivityCenter>;
