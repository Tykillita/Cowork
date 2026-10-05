import type { PanelUser, Task, TaskStatus, TeamDirectoryEntry } from "../../types";
import { TASK_STATUSES } from "../../types";
import { assigneeView } from "../milestones/milestoneModel";
import { AssigneeMenu } from "./AssigneeMenu";

/** What every task item (board card or list row) can do. */
export interface TaskItemActions {
  user: PanelUser;
  directory: TeamDirectoryEntry[];
  activeMembers: TeamDirectoryEntry[];
  canEdit: boolean;
  now: number;
  isBusy: (id: string) => boolean;
  errorOf: (id: string) => string;
  change: (task: Task, next: Task) => Promise<void>;
  assign: (task: Task, member: { uid: string; name: string } | null) => Promise<void>;
  open: (task: Task) => void;
  milestoneTitle: (id: string) => string;
}

/** Responsible person, plus the one-click "take it" and "release it". */
export function TaskAssignee({ task, actions }: { task: Task; actions: TaskItemActions }) {
  const disabled = actions.isBusy(task.id) || !actions.canEdit;
  const mine = task.assigneeUid === actions.user.id;
  return <>
    <AssigneeMenu current={assigneeView(task, actions.directory)} members={actions.activeMembers} disabled={disabled} label={`Responsable de ${task.title}`} onChoose={(member) => void actions.assign(task, member)} />
    {!task.assigneeUid && task.status !== "Hecha" && <button className="ghost" type="button" disabled={disabled} onClick={() => void actions.change(task, { ...task, assigneeUid: actions.user.id, assignee: actions.user.name, status: task.status === "Pendiente" ? "En curso" : task.status })}>Asignarme</button>}
    {mine && <button className="plain" type="button" disabled={disabled} onClick={() => void actions.assign(task, null)}>Soltar</button>}
  </>;
}

/** Status as a select: the way to move a task without dragging (a modal on phones). */
export function TaskStatusSelect({ task, actions, onMove }: { task: Task; actions: TaskItemActions; onMove?: (task: Task, status: TaskStatus) => void }) {
  return <select
    className="taskStatusSelect"
    value={task.status}
    disabled={actions.isBusy(task.id) || !actions.canEdit}
    onChange={(event) => {
      const status = event.target.value as TaskStatus;
      if (onMove) onMove(task, status);
      else void actions.change(task, { ...task, status });
    }}
    aria-label={`Estado: ${task.title}`}
  >
    {TASK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
  </select>;
}

export function TaskItemError({ task, actions }: { task: Task; actions: TaskItemActions }) {
  const error = actions.errorOf(task.id);
  return error ? <p className="projectSettingsError taskRowError" role="alert">{error}</p> : null;
}
