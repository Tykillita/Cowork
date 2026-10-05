import { TASK_STATUSES, type Task, type TaskPriority, type TaskStatus } from "../../types";
import { dueState } from "../milestones/milestoneModel";
import { formatDayKey } from "../schedule/scheduleTime";
import { comparable } from "../../lib/text";
import { isOpenUnassigned } from "./taskModel";

export type AssigneeFilter = "all" | "mine" | "unassigned" | "review" | `uid:${string}`;
export type DueFilter = "all" | "overdue" | "week" | "none";

export interface TaskFilterState {
  assignee: AssigneeFilter;
  status: "all" | TaskStatus;
  milestone: string;
  priority: "all" | TaskPriority;
  due: DueFilter;
  query: string;
}

export const NO_FILTERS: TaskFilterState = { assignee: "all", status: "all", milestone: "all", priority: "all", due: "all", query: "" };

export function activeFilterCount(filters: TaskFilterState) {
  return (Object.keys(NO_FILTERS) as (keyof TaskFilterState)[]).filter((key) => filters[key] !== NO_FILTERS[key]).length;
}

const WEEK = 7 * 86_400_000;

/** Open and past its due instant. */
export function isOverdue(task: Task, now: number) {
  return Boolean(task.dueAt) && task.status !== "Hecha" && Date.parse(task.dueAt) <= now;
}

export function filterTasks(tasks: Task[], filters: TaskFilterState, uid: string, now: number) {
  const query = comparable(filters.query.trim());
  return tasks.filter((task) => {
    const assignee = filters.assignee;
    if (assignee === "mine" && task.assigneeUid !== uid) return false;
    if (assignee === "unassigned" && !isOpenUnassigned(task)) return false;
    if (assignee === "review" && (task.assigneeUid || !task.assignee)) return false;
    if (assignee.startsWith("uid:") && task.assigneeUid !== assignee.slice(4)) return false;
    if (filters.status !== "all" && task.status !== filters.status) return false;
    if (filters.milestone === "none" && task.milestoneId) return false;
    if (filters.milestone !== "all" && filters.milestone !== "none" && task.milestoneId !== filters.milestone) return false;
    if (filters.priority !== "all" && task.priority !== filters.priority) return false;
    if (filters.due === "overdue" && !isOverdue(task, now)) return false;
    if (filters.due === "week" && !(task.dueAt && task.status !== "Hecha" && Date.parse(task.dueAt) - now <= WEEK)) return false;
    if (filters.due === "none" && task.dueAt) return false;
    if (query && !comparable(`${task.title} ${task.phase} ${task.description} ${task.branch}`).includes(query)) return false;
    return true;
  });
}

export type DueInfo = { label: string; tone: "error" | "warning" | "muted" };

/** Due chip text and tone; finished tasks keep their date without urgency. */
export function dueInfo(task: Pick<Task, "dueDate" | "dueAt" | "status">, now: number): DueInfo | null {
  if (!task.dueAt || !task.dueDate) return null;
  const day = formatDayKey(task.dueDate, { day: "numeric", month: "short" });
  if (task.status === "Hecha") return { label: day, tone: "muted" };
  const state = dueState(task.dueAt, now);
  if (state === "overdue") return { label: `Venció ${day}`, tone: "error" };
  if (state === "soon") return { label: "Vence en menos de 24 h", tone: "warning" };
  return { label: `Vence ${day}`, tone: "muted" };
}

/** Tasks per status, each list in the plan's order. */
export function columnsOf(tasks: Task[]) {
  const sorted = [...tasks].sort((a, b) => a.order - b.order);
  return Object.fromEntries(TASK_STATUSES.map((status) => [status, sorted.filter((task) => task.status === status)])) as Record<TaskStatus, Task[]>;
}

// ─── Keyboard moves on the board ────────────────────────────────────────────

export type BoardPosition = { column: number; index: number };

/**
 * Where a lifted card goes for an arrow key. `sizes` are the column lengths
 * without the lifted card; the index may point one past the end (append).
 */
export function moveCard(position: BoardPosition, key: string, sizes: number[]): BoardPosition {
  const clampIndex = (column: number, index: number) => Math.max(0, Math.min(index, sizes[column]));
  if (key === "ArrowLeft" && position.column > 0) return { column: position.column - 1, index: clampIndex(position.column - 1, position.index) };
  if (key === "ArrowRight" && position.column < sizes.length - 1) return { column: position.column + 1, index: clampIndex(position.column + 1, position.index) };
  if (key === "ArrowUp") return { column: position.column, index: clampIndex(position.column, position.index - 1) };
  if (key === "ArrowDown") return { column: position.column, index: clampIndex(position.column, position.index + 1) };
  if (key === "Home") return { column: position.column, index: 0 };
  if (key === "End") return { column: position.column, index: sizes[position.column] };
  return position;
}
