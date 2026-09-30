import type { Milestone, Project, Task, TeamDirectoryEntry } from "../../types";
import { browserTimeZone, buildSchedule } from "../schedule/scheduleTime";

export type MilestoneProgress = { total: number; done: number; percent: number; complete: boolean };

/** Completed linked tasks over all linked tasks; an empty milestone stays pending. */
export function milestoneProgress(milestone: Milestone, tasks: Task[]): MilestoneProgress {
  const linked = tasks.filter((task) => task.milestoneId === milestone.id);
  const done = linked.filter((task) => task.status === "Hecha").length;
  return { total: linked.length, done, percent: linked.length ? Math.round((done / linked.length) * 100) : 0, complete: linked.length > 0 && done === linked.length };
}

/** Milestone due when `dueDate` ends in `timeZone`, reusing the project schedule rules. */
export function milestoneDueAt(dueDate: string, timeZone: string) {
  return buildSchedule(dueDate, dueDate, timeZone).endsAt;
}

export function defaultMilestoneTimeZone(project: Project) {
  return project.schedule?.timeZone ?? browserTimeZone();
}

/** True when the milestone ends outside the project's delivery window (saving is still allowed). */
export function outsideProjectWindow(project: Project, dueDate: string, timeZone: string) {
  if (!project.schedule || !dueDate) return false;
  const dueAt = Date.parse(milestoneDueAt(dueDate, timeZone));
  return dueAt > Date.parse(project.schedule.endsAt) || dueAt <= Date.parse(project.schedule.startsAt);
}

/** Next milestone to show on the summary: overdue incomplete ones first, then the nearest. */
export function nextMilestone(milestones: Milestone[], tasks: Task[]) {
  return milestones
    .filter((milestone) => !milestone.archived && !milestoneProgress(milestone, tasks).complete)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0] ?? null;
}

export type DueState = "overdue" | "soon" | "later";

export function dueState(dueAt: string, now = Date.now()): DueState {
  const time = Date.parse(dueAt);
  if (time <= now) return "overdue";
  return time - now <= 86_400_000 ? "soon" : "later";
}

// ─── Assignee view ──────────────────────────────────────────────────────────

export type AssigneeView =
  | { kind: "none"; label: string }
  | { kind: "member"; uid: string; label: string; photoURL: string }
  | { kind: "left"; uid: string; label: string }
  | { kind: "review"; label: string };

export function assigneeView(task: Task, directory: TeamDirectoryEntry[]): AssigneeView {
  if (task.assigneeUid) {
    const entry = directory.find((candidate) => candidate.uid === task.assigneeUid);
    if (entry?.active) return { kind: "member", uid: entry.uid, label: entry.name, photoURL: entry.photoURL };
    // Unknown to the directory while it is still being prepared: show the stored name.
    if (!entry && directory.length === 0) return { kind: "member", uid: task.assigneeUid, label: task.assignee || "Miembro del equipo", photoURL: "" };
    return { kind: "left", uid: task.assigneeUid, label: entry?.name || task.assignee || "Miembro sin acceso" };
  }
  if (task.assignee.trim()) return { kind: "review", label: task.assignee };
  return { kind: "none", label: "Sin asignar" };
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "·";
}
