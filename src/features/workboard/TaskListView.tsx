import { useState } from "react";
import type { Milestone, Task } from "../../types";
import { TASK_LIMITS } from "../../types";
import { phaseDomId } from "./taskModel";
import { TaskChips } from "./TaskChips";
import { TaskAssignee, TaskItemError, TaskStatusSelect, type TaskItemActions } from "./TaskItemParts";

/** Tasks grouped by phase, in the plan's order, with inline title editing. */
export function TaskListView({ tasks, milestones, actions, focusedId }: {
  tasks: Task[];
  milestones: Milestone[];
  actions: TaskItemActions;
  focusedId: string | null;
}) {
  const sorted = [...tasks].sort((a, b) => a.order - b.order);
  const phases = [...new Set(sorted.map((task) => task.phase))];
  const activeMilestones = milestones.filter((milestone) => !milestone.archived);

  return <>{phases.map((phaseName, phaseIndex) => (
    <section className="phase" key={phaseName} aria-labelledby={phaseDomId(phaseIndex)}>
      <h3 id={phaseDomId(phaseIndex)}>{phaseName}</h3>
      {sorted.filter((task) => task.phase === phaseName).map((task) => {
        const busy = actions.isBusy(task.id);
        const disabled = busy || !actions.canEdit;
        return <article className={`row taskRow taskItem${task.status === "Hecha" ? " done" : ""}${task.id === focusedId ? " isFocused" : ""}`} key={task.id} id={`task-${task.id}`} data-task-id={task.id} aria-busy={busy}>
          <div className="taskRowMain">
            <EditableTitle task={task} disabled={disabled} onSave={(title) => actions.change(task, { ...task, title })} />
            <TaskChips task={task} now={actions.now} milestoneTitle={actions.milestoneTitle} showMilestone={false} />
            <div className="meta"><TaskAssignee task={task} actions={actions} /></div>
            <TaskItemError task={task} actions={actions} />
          </div>
          <div className="meta taskRowControls">
            <select value={task.milestoneId} disabled={disabled} onChange={(event) => void actions.change(task, { ...task, milestoneId: event.target.value })} aria-label={`Hito de ${task.title}`}>
              <option value="">Sin hito</option>
              {activeMilestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
              {task.milestoneId && !activeMilestones.some((milestone) => milestone.id === task.milestoneId) && <option value={task.milestoneId}>{actions.milestoneTitle(task.milestoneId)} (archivado)</option>}
            </select>
            <TaskStatusSelect task={task} actions={actions} />
            <button className="ghost taskOpenButton" type="button" onClick={() => actions.open(task)} aria-label={`Abrir la tarea ${task.title}`}>Abrir</button>
          </div>
        </article>;
      })}
    </section>
  ))}</>;
}

/** Click (or F2 on the title) to edit; Enter saves, Escape cancels, leaving the field saves. */
function EditableTitle({ task, disabled, onSave }: { task: Task; disabled: boolean; onSave: (title: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  function finish(save: boolean) {
    setEditing(false);
    const title = draft.trim();
    if (save && title && title !== task.title) void onSave(title);
    else setDraft(task.title);
  }

  if (editing) {
    return <input
      className="taskTitleInput"
      autoFocus
      value={draft}
      maxLength={TASK_LIMITS.title}
      aria-label={`Título de la tarea ${task.title}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); finish(true); }
        else if (event.key === "Escape") { event.preventDefault(); finish(false); }
      }}
    />;
  }
  return <button
    className="t taskTitleButton"
    type="button"
    disabled={disabled}
    title="Editar el título"
    aria-label={`Editar el título: ${task.title}`}
    onClick={() => { setDraft(task.title); setEditing(true); }}
    onKeyDown={(event) => { if (event.key === "F2") { setDraft(task.title); setEditing(true); } }}
  >{task.title}</button>;
}
