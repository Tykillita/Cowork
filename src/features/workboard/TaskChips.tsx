import type { ReactNode } from "react";
import type { Task } from "../../types";
import { buildHash } from "../../lib/hashRoute";
import { checklistCounts } from "./taskModel";
import { dueInfo } from "./taskFilters";

/** 12px line icons for the task chips, drawn in the chip's own colour. */
const ICONS: Record<string, ReactNode> = {
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  steps: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="m8 12 3 3 5-6" /></>,
  milestone: <path d="M12 3.5 20.5 12 12 20.5 3.5 12z" />,
  branch: <><circle cx="6.5" cy="5.5" r="2" /><circle cx="6.5" cy="18.5" r="2" /><circle cx="17.5" cy="8.5" r="2" /><path d="M6.5 7.5v9M17.5 10.5c0 4-4 4.5-9.5 6" /></>,
  notes: <path d="M5 6.5h14M5 11.5h14M5 16.5h9" />,
  flag: <path d="M6 20.5V4.5m0 0h11l-2 4 2 4H6" />,
};

export function ChipIcon({ name }: { name: keyof typeof ICONS }) {
  return <svg className="taskChipIcon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>;
}

/**
 * Small facts of a task, shared by the board cards and the list rows:
 * priority, due date, checklist progress, milestone, branch and notes.
 * Colour is only for urgency (overdue, due soon, high priority).
 */
export function TaskChips({ task, now, milestoneTitle, showMilestone = true }: { task: Task; now: number; milestoneTitle: (id: string) => string; showMilestone?: boolean }) {
  const due = dueInfo(task, now);
  const checks = checklistCounts(task);
  return <div className="taskChips">
    {task.priority === "alta" && <span className="taskChip" data-tone="warning"><ChipIcon name="flag" />Prioridad alta</span>}
    {task.priority === "baja" && <span className="taskChip"><ChipIcon name="flag" />Prioridad baja</span>}
    {due && <span className="taskChip" data-tone={due.tone}><ChipIcon name="calendar" /><time dateTime={task.dueAt}>{due.label}</time></span>}
    {checks.total > 0 && <span className="taskChip" data-tone={checks.done === checks.total ? "done" : undefined} aria-label={`${checks.done} de ${checks.total} pasos hechos`}><ChipIcon name="steps" /><span aria-hidden="true">{checks.done}/{checks.total}</span></span>}
    {showMilestone && task.milestoneId && <span className="taskChip"><ChipIcon name="milestone" />{milestoneTitle(task.milestoneId)}</span>}
    {task.branch && <a className="taskChip taskBranchChip" href={buildHash("branches-page", { branch: task.branch })} title={`Rama ${task.branch}`}><ChipIcon name="branch" /><code>{task.branch}</code></a>}
    {task.description && <span className="taskChip taskChipIconOnly" aria-label="Tiene descripción" title="Tiene descripción"><ChipIcon name="notes" /></span>}
  </div>;
}
