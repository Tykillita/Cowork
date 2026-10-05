import type { ActivityChanges, BranchEntry, Milestone, PanelUser, Project, Task, TaskStatus } from "../../types";
import { getCoworkFirestore } from "../../lib/firebase";
import { branchDeletedEventId, branchEventId, eventDocument, milestoneEventId, taskChanges, taskEventId } from "../activity/activityEvents";
import { EMPTY_TASK_DETAILS, encodeChecklist, normalizeTask, readChecklist, readPriority, sameTaskContent } from "./taskModel";

async function database() {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw Object.assign(new Error("Firebase no está configurado."), { code: "cowork/firebase-not-configured" });
  return { db, api };
}

function validDocumentId(id: string) {
  if (!id || id.length > 60 || id.includes("/")) throw new Error("El identificador del elemento no es válido.");
  return id;
}

/** Someone else saved the same item first; the caller keeps the draft and shows the latest data. */
export class ConflictError extends Error {
  readonly code = "cowork/conflict";
  constructor(message = "Otra persona modificó este elemento mientras lo editabas. Revisa los cambios y vuelve a intentarlo.") {
    super(message);
  }
}

/** Reference to the event of a successful write, used to record the active day. */
export type SavedEvent = { projectId: string; eventId: string; countsAsWork: boolean };

const STATUSES: TaskStatus[] = ["Pendiente", "En curso", "Hecha"];

export function readTask(id: string, value: Record<string, unknown>): Task {
  return {
    id,
    order: typeof value.order === "number" ? value.order : 0,
    phase: typeof value.phase === "string" && value.phase ? value.phase : "General",
    title: typeof value.title === "string" ? value.title : "",
    status: STATUSES.includes(value.status as TaskStatus) ? value.status as TaskStatus : "Pendiente",
    assignee: typeof value.assignee === "string" ? value.assignee : "",
    assigneeUid: typeof value.assigneeUid === "string" ? value.assigneeUid : "",
    milestoneId: typeof value.milestoneId === "string" ? value.milestoneId : "",
    revision: typeof value.revision === "number" ? value.revision : 0,
    // Tasks written before these fields existed read as empty; the defaults match firestore.rules.
    description: typeof value.description === "string" ? value.description : EMPTY_TASK_DETAILS.description,
    priority: readPriority(value.priority),
    dueDate: typeof value.dueDate === "string" ? value.dueDate : "",
    timeZone: typeof value.timeZone === "string" ? value.timeZone : "",
    dueAt: typeof value.dueAt === "string" ? value.dueAt : "",
    checklist: readChecklist(value.checklist),
    branch: typeof value.branch === "string" ? value.branch : "",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    createdByUid: typeof value.createdByUid === "string" ? value.createdByUid : "",
  };
}

export function readMilestone(id: string, value: Record<string, unknown>): Milestone {
  return {
    id,
    title: typeof value.title === "string" ? value.title : "Hito",
    description: typeof value.description === "string" ? value.description : "",
    dueDate: typeof value.dueDate === "string" ? value.dueDate : "",
    timeZone: typeof value.timeZone === "string" ? value.timeZone : "UTC",
    dueAt: typeof value.dueAt === "string" ? value.dueAt : "",
    archived: value.archived === true,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    revision: typeof value.revision === "number" ? value.revision : 0,
  };
}

/**
 * Every key is always written, so a tab running an older version (which only
 * knows the first fields) cannot erase the rest: the rules require that an
 * update keeps every existing key. `created` comes from the stored document.
 */
function taskDocument(task: Task, revision: number, user: PanelUser, created: { createdAt: string; createdByUid: string }) {
  const clean = normalizeTask(task);
  return {
    id: clean.id,
    order: clean.order,
    phase: clean.phase,
    title: clean.title,
    status: clean.status,
    assignee: clean.assignee,
    assigneeUid: clean.assigneeUid,
    milestoneId: clean.milestoneId,
    revision,
    updatedByUid: user.id,
    description: clean.description,
    priority: clean.priority,
    dueDate: clean.dueDate,
    timeZone: clean.timeZone,
    dueAt: clean.dueAt,
    checklist: encodeChecklist(clean.checklist),
    branch: clean.branch,
    createdAt: created.createdAt,
    createdByUid: created.createdByUid,
  };
}

// ─── Listeners ──────────────────────────────────────────────────────────────

export async function initializeProject(project: Project) {
  const { db, api } = await database();
  const projectSnapshot = await api.getDoc(api.doc(db, "projects", project.id));
  if (!projectSnapshot.exists()) throw new Error("No encontramos este proyecto o tu acceso fue revocado.");
}

/**
 * The one query for a project's tasks. The activity centre listens with this
 * same query, so Firestore shares a single watch for the open project.
 */
export function tasksQuery(api: typeof import("firebase/firestore"), db: import("firebase/firestore").Firestore, projectId: string) {
  return api.query(api.collection(db, "projects", projectId, "tasks"), api.orderBy("order", "asc"));
}

export function listenForTasks(projectId: string, onValue: (tasks: Task[], fromCache: boolean) => void, onError: (error: Error) => void) {
  return database().then(({ db, api }) => {
    return api.onSnapshot(tasksQuery(api, db, projectId), { includeMetadataChanges: true }, (snapshot) => {
      onValue(snapshot.docs.map((entry) => readTask(entry.id, entry.data())), snapshot.metadata.fromCache);
    }, onError);
  });
}

export function listenForBranches(projectId: string, onValue: (branches: BranchEntry[], fromCache: boolean) => void, onError: (error: Error) => void) {
  return database().then(({ db, api }) => {
    const branchesQuery = api.query(api.collection(db, "projects", projectId, "branches"), api.orderBy("createdAt", "desc"));
    return api.onSnapshot(branchesQuery, { includeMetadataChanges: true }, (snapshot) => {
      onValue(snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }) as BranchEntry), snapshot.metadata.fromCache);
    }, onError);
  });
}

export function listenForMilestones(projectId: string, onValue: (milestones: Milestone[]) => void, onError: (error: Error) => void) {
  return database().then(({ db, api }) => api.onSnapshot(api.collection(db, "projects", projectId, "milestones"), (snapshot) => {
    onValue(snapshot.docs.map((entry) => readMilestone(entry.id, entry.data())).sort((a, b) => a.dueAt.localeCompare(b.dueAt)));
  }, onError));
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

export async function createTask(projectId: string, draft: Task, user: PanelUser): Promise<SavedEvent> {
  const id = validDocumentId(draft.id);
  if (!draft.title.trim()) throw new Error("Escribe el título de la tarea.");
  const { db, api } = await database();
  const taskRef = api.doc(db, "projects", projectId, "tasks", id);
  const eventId = taskEventId(id, 1);
  await api.runTransaction(db, async (transaction) => {
    const current = await transaction.get(taskRef);
    if (current.exists()) {
      // A retry of our own creation that already reached the server.
      if (readTask(id, current.data()).revision === 1 && current.data().updatedByUid === user.id) return;
      throw new ConflictError("Ya existe una tarea con ese identificador.");
    }
    transaction.set(taskRef, taskDocument(draft, 1, user, { createdAt: new Date().toISOString(), createdByUid: user.id }));
    transaction.set(api.doc(db, "projects", projectId, "events", eventId), eventDocument({
      id: eventId, projectId, kind: "created", targetType: "task", targetId: id, targetTitle: draft.title.trim(), revision: 1, actor: user, changes: {}, serverTime: api.serverTimestamp(),
    }));
  });
  return { projectId, eventId, countsAsWork: true };
}

/**
 * Saves `next` on top of `base` (the version the person was looking at). If the
 * task changed meanwhile, nothing is overwritten and a ConflictError is thrown.
 * Returns null when there was nothing to save.
 */
export async function updateTask(projectId: string, base: Task, next: Task, user: PanelUser, options: { migration?: boolean } = {}): Promise<SavedEvent | null> {
  const id = validDocumentId(base.id);
  const { db, api } = await database();
  const taskRef = api.doc(db, "projects", projectId, "tasks", id);
  let saved: SavedEvent | null = null;
  await api.runTransaction(db, async (transaction) => {
    saved = null;
    const snapshot = await transaction.get(taskRef);
    if (!snapshot.exists()) throw new ConflictError("Esta tarea ya no existe.");
    const current = readTask(id, snapshot.data());
    if (current.revision !== base.revision) {
      // Our own earlier attempt may have been applied before the connection dropped.
      if (current.revision === base.revision + 1 && snapshot.data().updatedByUid === user.id && sameTaskContent(current, { ...next, id })) {
        saved = { projectId, eventId: taskEventId(id, current.revision), countsAsWork: current.status !== base.status };
        return;
      }
      throw new ConflictError();
    }
    const target = { ...next, id };
    const changes: ActivityChanges = taskChanges(current, target);
    if (options.migration) changes.migration = true;
    const contentChanged = !sameTaskContent(current, target) || current.revision === 0;
    if (!contentChanged && !options.migration) return;
    const revision = current.revision + 1;
    const eventId = taskEventId(id, revision);
    transaction.set(taskRef, taskDocument(target, revision, user, { createdAt: current.createdAt, createdByUid: current.createdByUid }));
    transaction.set(api.doc(db, "projects", projectId, "events", eventId), eventDocument({
      id: eventId, projectId, kind: "updated", targetType: "task", targetId: id, targetTitle: target.title, revision, actor: user, changes, serverTime: api.serverTimestamp(),
    }));
    saved = { projectId, eventId, countsAsWork: Boolean(changes.status) };
  });
  return saved;
}

export async function deleteTask(projectId: string, base: Task, user: PanelUser) {
  const id = validDocumentId(base.id);
  const { db, api } = await database();
  const taskRef = api.doc(db, "projects", projectId, "tasks", id);
  await api.runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(taskRef);
    if (!snapshot.exists()) return;
    const current = readTask(id, snapshot.data());
    if (current.revision !== base.revision) throw new ConflictError("Otra persona modificó esta tarea. Revisa los cambios antes de eliminarla.");
    const revision = current.revision + 1;
    const eventId = taskEventId(id, revision);
    transaction.delete(taskRef);
    transaction.set(api.doc(db, "projects", projectId, "events", eventId), eventDocument({
      id: eventId, projectId, kind: "deleted", targetType: "task", targetId: id, targetTitle: current.title, revision, actor: user, changes: {}, serverTime: api.serverTimestamp(),
    }));
  });
}

// ─── Branches ───────────────────────────────────────────────────────────────

export async function createBranch(projectId: string, branch: BranchEntry, user: PanelUser): Promise<SavedEvent> {
  const id = validDocumentId(branch.id);
  const { db, api } = await database();
  const eventId = branchEventId(id);
  const batch = api.writeBatch(db);
  const name = String(branch.name ?? "").trim().slice(0, 120);
  batch.set(api.doc(db, "projects", projectId, "branches", id), {
    id,
    name,
    reason: String(branch.reason ?? "").trim().slice(0, 600),
    by: user.name.slice(0, 100),
    createdByUid: user.id,
    createdAt: String(branch.createdAt ?? "").slice(0, 40) || new Date().toISOString(),
    ...(branch.githubCreated ? { githubCreated: true } : {}),
  });
  batch.set(api.doc(db, "projects", projectId, "events", eventId), eventDocument({
    id: eventId, projectId, kind: "created", targetType: "branch", targetId: id, targetTitle: name, revision: 1, actor: user, changes: {}, serverTime: api.serverTimestamp(),
  }));
  await batch.commit();
  return { projectId, eventId, countsAsWork: true };
}

/** Removes a register entry together with its "deleted" event, so the team sees who did it. */
export async function deleteBranch(projectId: string, entry: BranchEntry, user: PanelUser) {
  const id = validDocumentId(entry.id);
  const { db, api } = await database();
  const eventId = branchDeletedEventId(id);
  const batch = api.writeBatch(db);
  batch.delete(api.doc(db, "projects", projectId, "branches", id));
  batch.set(api.doc(db, "projects", projectId, "events", eventId), eventDocument({
    id: eventId, projectId, kind: "deleted", targetType: "branch", targetId: id, targetTitle: entry.name, revision: 2, actor: user, changes: {}, serverTime: api.serverTimestamp(),
  }));
  await batch.commit();
}

// ─── Milestones (owner) ─────────────────────────────────────────────────────

export type MilestoneDraft = Pick<Milestone, "title" | "description" | "dueDate" | "timeZone" | "dueAt" | "archived">;

function milestoneDocument(id: string, draft: MilestoneDraft, revision: number, createdAt: string, createdByUid: string, user: PanelUser) {
  return {
    id,
    title: draft.title.trim().slice(0, 120),
    description: draft.description.trim().slice(0, 600),
    dueDate: draft.dueDate,
    timeZone: draft.timeZone,
    dueAt: draft.dueAt,
    archived: draft.archived,
    createdAt,
    createdByUid,
    revision,
    updatedByUid: user.id,
  };
}

export async function createMilestone(projectId: string, draft: MilestoneDraft, user: PanelUser) {
  if (!draft.title.trim()) throw new Error("Escribe el título del hito.");
  const { db, api } = await database();
  const id = `m${Date.now().toString(36)}${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`.slice(0, 40);
  const eventId = milestoneEventId(id, 1);
  const batch = api.writeBatch(db);
  batch.set(api.doc(db, "projects", projectId, "milestones", id), milestoneDocument(id, { ...draft, archived: false }, 1, new Date().toISOString(), user.id, user));
  batch.set(api.doc(db, "projects", projectId, "events", eventId), eventDocument({
    id: eventId, projectId, kind: "created", targetType: "milestone", targetId: id, targetTitle: draft.title.trim(), revision: 1, actor: user, changes: {}, serverTime: api.serverTimestamp(),
  }));
  await batch.commit();
  return id;
}

export async function updateMilestone(projectId: string, base: Milestone, draft: MilestoneDraft, user: PanelUser) {
  const { db, api } = await database();
  const ref = api.doc(db, "projects", projectId, "milestones", validDocumentId(base.id));
  await api.runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new ConflictError("Este hito ya no existe.");
    const current = readMilestone(base.id, snapshot.data());
    if (current.revision !== base.revision) throw new ConflictError();
    const changes: ActivityChanges = {};
    if (current.title !== draft.title.trim()) changes.title = { from: current.title, to: draft.title.trim() };
    if (current.dueAt !== draft.dueAt) changes.dueAt = { from: current.dueAt, to: draft.dueAt };
    if (current.archived !== draft.archived) changes.archived = { from: current.archived, to: draft.archived };
    const unchanged = !Object.keys(changes).length && current.description === draft.description.trim() && current.timeZone === draft.timeZone && current.dueDate === draft.dueDate;
    if (unchanged) return;
    const revision = current.revision + 1;
    const eventId = milestoneEventId(base.id, revision);
    const data = snapshot.data();
    transaction.set(ref, milestoneDocument(base.id, draft, revision, String(data.createdAt ?? ""), String(data.createdByUid ?? user.id), user));
    transaction.set(api.doc(db, "projects", projectId, "events", eventId), eventDocument({
      id: eventId, projectId, kind: "updated", targetType: "milestone", targetId: base.id, targetTitle: draft.title.trim(), revision, actor: user, changes, serverTime: api.serverTimestamp(),
    }));
  });
}
