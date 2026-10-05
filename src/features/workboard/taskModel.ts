import { DEFAULT_TASK_PHASE, DEFAULT_TASK_PRIORITY, TASK_LIMITS, TASK_PRIORITIES, type Task, type TaskCheckItem, type TaskPriority } from "../../types";

/** The detail fields of a task with nothing set; legacy documents read as this. */
export const EMPTY_TASK_DETAILS = {
  description: "",
  priority: DEFAULT_TASK_PRIORITY,
  dueDate: "",
  timeZone: "",
  dueAt: "",
  checklist: [] as TaskCheckItem[],
  branch: "",
  createdAt: "",
  createdByUid: "",
} satisfies Partial<Task>;

export function readPriority(value: unknown): TaskPriority {
  return TASK_PRIORITIES.includes(value as TaskPriority) ? value as TaskPriority : DEFAULT_TASK_PRIORITY;
}

/**
 * Keeps well-formed items only, within the limits. Stored as a JSON string
 * (see `encodeChecklist`); an array is accepted too.
 */
export function readChecklist(value: unknown): TaskCheckItem[] {
  let list = value;
  if (typeof value === "string") {
    try { list = value ? JSON.parse(value) : []; } catch { list = []; }
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is TaskCheckItem => Boolean(item) && typeof item === "object"
      && typeof item.id === "string" && item.id.length > 0 && item.id.length <= TASK_LIMITS.checkId
      && typeof item.text === "string" && typeof item.done === "boolean")
    .slice(0, TASK_LIMITS.checklist)
    .map((item) => ({ id: item.id, text: item.text.slice(0, TASK_LIMITS.checkText), done: item.done }));
}

/** The values a task is stored with: trimmed, clipped and with a positive whole order. */
export function normalizeTask(task: Task): Task {
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) ? task.dueDate : "";
  return {
    ...task,
    order: Math.max(1, Math.round(Number(task.order) || 1)),
    phase: (task.phase.trim() || DEFAULT_TASK_PHASE).slice(0, TASK_LIMITS.phase),
    title: task.title.trim().slice(0, TASK_LIMITS.title),
    assignee: task.assignee.slice(0, 100),
    description: task.description.trim().slice(0, TASK_LIMITS.description),
    priority: readPriority(task.priority),
    dueDate,
    timeZone: dueDate ? task.timeZone.slice(0, 64) : "",
    dueAt: dueDate ? task.dueAt : "",
    checklist: readChecklist(task.checklist.map((item) => ({ ...item, text: item.text.trim() })).filter((item) => item.text)),
    branch: task.branch.trim().slice(0, TASK_LIMITS.branch),
  };
}

/** What Firestore stores: "" for no items, otherwise the JSON of the clean list. */
export function encodeChecklist(items: TaskCheckItem[]) {
  const clean = readChecklist(items);
  const encoded = clean.length ? JSON.stringify(clean.map(({ id, text, done }) => ({ id, text, done }))) : "";
  if (encoded.length > CHECKLIST_STORAGE_LIMIT) throw new Error("La lista de pasos es demasiado larga. Acorta algunos pasos.");
  return encoded;
}

/** Same limit as firestore.rules for the stored JSON. */
export const CHECKLIST_STORAGE_LIMIT = 8000;

function sameChecklist(a: TaskCheckItem[], b: TaskCheckItem[]) {
  return a.length === b.length && a.every((item, index) => item.id === b[index].id && item.text === b[index].text && item.done === b[index].done);
}

/** Same stored content, comparing what would be written rather than the raw draft. */
export function sameTaskContent(a: Task, b: Task) {
  const x = normalizeTask(a);
  const y = normalizeTask(b);
  return x.title === y.title && x.status === y.status && x.assigneeUid === y.assigneeUid && x.milestoneId === y.milestoneId
    && x.phase === y.phase && x.order === y.order && x.assignee === y.assignee
    && x.description === y.description && x.priority === y.priority && x.dueDate === y.dueDate && x.timeZone === y.timeZone
    && x.dueAt === y.dueAt && x.branch === y.branch && sameChecklist(x.checklist, y.checklist);
}

/** Open work nobody has taken: the "sin asignar" counter and filter use this same rule. */
export function isOpenUnassigned(task: Task) {
  return !task.assigneeUid && !task.assignee && task.status !== "Hecha";
}

/** Heading id for the phase at `index`; names like "Diseño" and "Diseno" no longer collide. */
export function phaseDomId(index: number) {
  return `phase-${index}`;
}

export function checklistCounts(task: Pick<Task, "checklist">) {
  return { done: task.checklist.filter((item) => item.done).length, total: task.checklist.length };
}

// ─── Order ──────────────────────────────────────────────────────────────────
// Whole numbers with wide gaps: a task moves between two others by taking the
// midpoint, and only a crowded stretch needs renumbering. The board and the
// list share the same order; only the relative order within a column or a
// phase matters.

export const ORDER_GAP = 1 << 20;

/** Order for a new task at the end of the plan. */
export function nextOrder(tasks: Pick<Task, "order">[]) {
  const last = tasks.reduce((max, task) => Math.max(max, task.order || 0), 0);
  return Math.ceil(last / ORDER_GAP) * ORDER_GAP + ORDER_GAP;
}

/**
 * Order between two neighbours (either may be missing). `null` means there is
 * no whole number left between them and the stretch must be renumbered.
 */
export function between(previous: number | null, next: number | null): number | null {
  if (previous === null && next === null) return ORDER_GAP;
  if (previous === null) {
    // First place: a full gap before the next one if there is room, otherwise half way to 1.
    if (next! < 2) return null;
    return next! - ORDER_GAP >= 1 ? next! - ORDER_GAP : Math.floor(next! / 2);
  }
  if (next === null) return previous + ORDER_GAP;
  if (next - previous < 2) return null;
  return previous + Math.floor((next - previous) / 2);
}

/** New evenly spaced orders for `tasks` (already sorted), starting after `start`. */
export function respaced(tasks: Pick<Task, "id">[], start = 0) {
  return tasks.map((task, index) => ({ id: task.id, order: start + (index + 1) * ORDER_GAP }));
}

/**
 * Order for a task dropped at `index` among `siblings` (the column or phase in
 * order, without the moved task). When there is no room, `respace` lists the
 * new orders of the other siblings to save as well.
 */
export function orderAt(siblings: Pick<Task, "id" | "order">[], index: number, movingId: string) {
  const order = between(siblings[index - 1]?.order ?? null, siblings[index]?.order ?? null);
  if (order !== null) return { order, respace: [] as { id: string; order: number }[] };
  const spaced = respaced([...siblings.slice(0, index), { id: movingId }, ...siblings.slice(index)]);
  return { order: spaced.find((entry) => entry.id === movingId)!.order, respace: spaced.filter((entry) => entry.id !== movingId) };
}
