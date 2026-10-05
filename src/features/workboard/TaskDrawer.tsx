import { useEffect, useId, useRef, useState } from "react";
import { TASK_LIMITS, TASK_PRIORITIES, TASK_STATUSES, type BranchEntry, type Milestone, type PanelUser, type Project, type Task, type TaskCheckItem, type TaskPriority, type TaskStatus, type TeamDirectoryEntry } from "../../types";
import { Drawer } from "../../components/Drawer";
import { assigneeView, milestoneDueAt } from "../milestones/milestoneModel";
import { browserTimeZone, formatDayKey } from "../schedule/scheduleTime";
import { branchNameProblem } from "../github/githubRefs";
import { useGitHubSession } from "../github/githubSession";
import { useRepository } from "../repository/useRepository";
import { buildHash } from "../../lib/hashRoute";
import { newId } from "../../lib/ids";
import { AssigneeMenu } from "./AssigneeMenu";
import { checklistCounts, sameTaskContent } from "./taskModel";
import { dueInfo } from "./taskFilters";

const PRIORITY_LABEL: Record<TaskPriority, string> = { alta: "Alta", media: "Media", baja: "Baja" };

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/**
 * Saves one field at a time, in order. Each save waits until the previous one
 * is back in the live task (its revision went up), so quick edits in a row are
 * not mistaken for someone else's change.
 */
function useTaskSaver(task: Task, onUpdate: (base: Task, next: Task) => Promise<void>) {
  const latest = useRef(task);
  latest.current = task;
  const expected = useRef(task.revision);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const waiters = useRef<{ revision: number; resolve: () => void }[]>([]);
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    waiters.current = waiters.current.filter((waiter) => {
      if (task.revision < waiter.revision) return true;
      waiter.resolve();
      return false;
    });
  }, [task.revision]);

  function caughtUp(revision: number) {
    if (latest.current.revision >= revision) return Promise.resolve();
    return new Promise<void>((resolve) => {
      waiters.current.push({ revision, resolve });
      window.setTimeout(resolve, 4000);
    });
  }

  function save(patch: Partial<Task>) {
    setError("");
    setSaving((count) => count + 1);
    const run = queue.current.then(async () => {
      await caughtUp(expected.current);
      const base = latest.current;
      const next = { ...base, ...patch };
      if (sameTaskContent(base, next)) return;
      await onUpdate(base, next);
      expected.current = base.revision + 1;
    });
    queue.current = run.catch(() => undefined);
    return run.catch((reason) => {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el cambio.");
      throw reason;
    }).finally(() => setSaving((count) => count - 1));
  }

  return { save: (patch: Partial<Task>) => save(patch).catch(() => undefined), saveStrict: save, saving: saving > 0, error };
}

export function TaskDrawer({ project, user, task, tasks, milestones, directory, register, canEdit, onUpdate, onRemove, onClose }: {
  project: Project;
  user: PanelUser;
  task: Task;
  tasks: Task[];
  milestones: Milestone[];
  directory: TeamDirectoryEntry[];
  /** Branches in the team register, offered for the branch field. */
  register: BranchEntry[];
  canEdit: boolean;
  onUpdate: (base: Task, next: Task) => Promise<void>;
  onRemove: (task: Task) => Promise<void>;
  onClose: () => void;
}) {
  const { save, saveStrict, saving, error } = useTaskSaver(task, onUpdate);
  const github = useGitHubSession(user);
  const repository = useRepository(project.repositoryUrl, github.status === "checking" ? null : github.token);
  const ids = useId();
  const [title, setTitle] = useState(task.title);
  const [phase, setPhase] = useState(task.phase);
  const [description, setDescription] = useState(task.description);
  const [branch, setBranch] = useState(task.branch);
  const [branchError, setBranchError] = useState("");
  const [newStep, setNewStep] = useState("");
  // The list as just edited, shown until the saved task comes back (or the save fails).
  const [pendingSteps, setPendingSteps] = useState<TaskCheckItem[] | null>(null);
  const steps = pendingSteps ?? task.checklist;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Someone else's edit shows up unless that field is being typed in.
  const editing = useRef<string | null>(null);
  useEffect(() => { if (editing.current !== "title") setTitle(task.title); }, [task.title]);
  useEffect(() => { if (editing.current !== "phase") setPhase(task.phase); }, [task.phase]);
  useEffect(() => { if (editing.current !== "branch") setBranch(task.branch); }, [task.branch]);
  const descriptionDirty = description.trim() !== task.description;
  useEffect(() => { if (editing.current !== "description") setDescription(task.description); }, [task.description]);

  const disabled = !canEdit;
  const activeMembers = directory.filter((entry) => entry.active);
  const activeMilestones = milestones.filter((milestone) => !milestone.archived);
  const phases = [...new Set(tasks.map((entry) => entry.phase))];
  const branchOptions = [...new Set([...register.map((entry) => entry.name), ...repository.branches.map((entry) => entry.name)])].sort((a, b) => a.localeCompare(b, "es"));
  const timeZone = task.timeZone || project.schedule?.timeZone || browserTimeZone();
  const due = dueInfo(task, Date.now());
  const checks = checklistCounts({ checklist: pendingSteps ?? task.checklist });
  const creator = directory.find((entry) => entry.uid === task.createdByUid)?.name;

  function commitTitle() {
    editing.current = null;
    const clean = title.trim();
    if (!clean) { setTitle(task.title); return; }
    if (clean !== task.title) void save({ title: clean });
  }

  function commitPhase() {
    editing.current = null;
    const clean = phase.trim();
    if (!clean) { setPhase(task.phase); return; }
    if (clean !== task.phase) void save({ phase: clean });
  }

  function commitBranch() {
    editing.current = null;
    const clean = branch.trim();
    if (clean === task.branch) { setBranchError(""); return; }
    const problem = clean ? branchNameProblem(clean) : "";
    if (problem) { setBranchError(problem); return; }
    setBranchError("");
    void save({ branch: clean });
  }

  // A list too long to store is refused while saving, and the error is shown above.
  function saveChecklist(checklist: TaskCheckItem[]) {
    setPendingSteps(checklist);
    void saveStrict({ checklist }).catch(() => setPendingSteps(null));
  }
  // Done once the live task shows exactly what was saved last.
  const savedSteps = JSON.stringify(task.checklist);
  useEffect(() => { setPendingSteps((pending) => pending && JSON.stringify(pending) === savedSteps ? null : pending); }, [savedSteps]);

  function addStep() {
    const text = newStep.trim();
    if (!text || steps.length >= TASK_LIMITS.checklist) return;
    saveChecklist([...steps, { id: newId("c", 12), text: text.slice(0, TASK_LIMITS.checkText), done: false }]);
    setNewStep("");
  }

  function moveStep(index: number, offset: number) {
    const next = [...steps];
    const [item] = next.splice(index, 1);
    next.splice(index + offset, 0, item);
    saveChecklist(next);
  }

  async function remove() {
    setDeleting(true);
    setDeleteError("");
    try { await onRemove(task); onClose(); }
    catch (reason) { setDeleteError(reason instanceof Error ? reason.message : "No se pudo eliminar la tarea."); setDeleting(false); }
  }

  return <Drawer label={`Tarea ${task.title}`} onClose={onClose} className="taskDrawer">
    <header className="drawerHead">
      <div>
        <p className="eyebrow">TAREA · {task.phase.toUpperCase()}</p>
        <span className="drawerSaveState" role="status">{saving ? "Guardando…" : error ? "" : "Cambios guardados"}</span>
      </div>
      <button className="drawerClose" type="button" onClick={onClose} aria-label="Cerrar la tarea">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>
    </header>

    <label className="drawerTitleField">
      <span className="visuallyHidden">Título</span>
      <textarea
        rows={1}
        value={title}
        maxLength={TASK_LIMITS.title}
        disabled={disabled}
        onFocus={() => { editing.current = "title"; }}
        onChange={(event) => setTitle(event.target.value.replace(/\n/g, " "))}
        onBlur={commitTitle}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
      />
    </label>
    {error && <p className="projectSettingsError" role="alert">{error}</p>}

    <dl className="drawerFields">
      <div><dt><label htmlFor={`${ids}-status`}>Estado</label></dt><dd>
        <select id={`${ids}-status`} value={task.status} disabled={disabled} onChange={(event) => void save({ status: event.target.value as TaskStatus })}>
          {TASK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </dd></div>
      <div><dt>Responsable</dt><dd>
        <AssigneeMenu current={assigneeView(task, directory)} members={activeMembers} disabled={disabled} label="Responsable" onChoose={(member) => void save({ assigneeUid: member?.uid ?? "", assignee: member?.name ?? "" })} />
        {!task.assigneeUid && canEdit && <button className="ghost" type="button" onClick={() => void save({ assigneeUid: user.id, assignee: user.name, status: task.status === "Pendiente" ? "En curso" : task.status })}>Asignarme</button>}
      </dd></div>
      <div><dt><label htmlFor={`${ids}-priority`}>Prioridad</label></dt><dd>
        <select id={`${ids}-priority`} value={task.priority} disabled={disabled} onChange={(event) => void save({ priority: event.target.value as TaskPriority })}>
          {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>)}
        </select>
      </dd></div>
      <div><dt><label htmlFor={`${ids}-due`}>Fecha límite</label></dt><dd className="drawerDue">
        <input
          id={`${ids}-due`}
          type="date"
          value={task.dueDate}
          disabled={disabled}
          onChange={(event) => {
            const dueDate = event.target.value;
            if (!dueDate) { void save({ dueDate: "", timeZone: "", dueAt: "" }); return; }
            void save({ dueDate, timeZone, dueAt: milestoneDueAt(dueDate, timeZone) });
          }}
        />
        {task.dueDate && <button className="plain" type="button" disabled={disabled} onClick={() => void save({ dueDate: "", timeZone: "", dueAt: "" })}>Quitar</button>}
        {due && <small data-tone={due.tone}>{due.label} · al terminar el {formatDayKey(task.dueDate, { weekday: "short", day: "numeric", month: "short" })} ({timeZone.replace(/_/g, " ")})</small>}
      </dd></div>
      <div><dt><label htmlFor={`${ids}-phase`}>Fase</label></dt><dd>
        <input
          id={`${ids}-phase`}
          list={`${ids}-phases`}
          value={phase}
          maxLength={TASK_LIMITS.phase}
          disabled={disabled}
          onFocus={() => { editing.current = "phase"; }}
          onChange={(event) => setPhase(event.target.value)}
          onBlur={commitPhase}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
        />
        <datalist id={`${ids}-phases`}>{phases.map((name) => <option key={name} value={name} />)}</datalist>
      </dd></div>
      <div><dt><label htmlFor={`${ids}-milestone`}>Hito</label></dt><dd>
        <select id={`${ids}-milestone`} value={task.milestoneId} disabled={disabled} onChange={(event) => void save({ milestoneId: event.target.value })}>
          <option value="">Sin hito</option>
          {activeMilestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
          {task.milestoneId && !activeMilestones.some((milestone) => milestone.id === task.milestoneId) && <option value={task.milestoneId}>{milestones.find((milestone) => milestone.id === task.milestoneId)?.title ?? "Hito no disponible"} (archivado)</option>}
        </select>
      </dd></div>
      <div><dt><label htmlFor={`${ids}-branch`}>Rama</label></dt><dd className="drawerBranch">
        <input
          id={`${ids}-branch`}
          list={`${ids}-branches`}
          value={branch}
          maxLength={TASK_LIMITS.branch}
          placeholder="feature/nombre"
          disabled={disabled}
          spellCheck={false}
          onFocus={() => { editing.current = "branch"; }}
          onChange={(event) => { setBranch(event.target.value); setBranchError(""); }}
          onBlur={commitBranch}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
        />
        <datalist id={`${ids}-branches`}>{branchOptions.map((name) => <option key={name} value={name} />)}</datalist>
        {task.branch && <a className="plain" href={buildHash("branches-page", { branch: task.branch })}>Ver rama <span aria-hidden="true">↗</span></a>}
        {task.branch && project.repositoryUrl && repository.branches.some((entry) => entry.name === task.branch) && <a className="plain" href={buildHash("code", { ref: task.branch })}>Ver código <span aria-hidden="true">↗</span></a>}
        {branchError && <small className="drawerFieldError" role="alert">{branchError}</small>}
      </dd></div>
    </dl>

    <section className="drawerSection" aria-labelledby={`${ids}-description-title`}>
      <div className="drawerSectionHead"><h3 id={`${ids}-description-title`}>Descripción</h3><small>{description.length}/{TASK_LIMITS.description}</small></div>
      <textarea
        className="drawerDescription"
        rows={5}
        value={description}
        maxLength={TASK_LIMITS.description}
        disabled={disabled}
        placeholder="Contexto, criterios de aceptación, enlaces…"
        aria-labelledby={`${ids}-description-title`}
        onFocus={() => { editing.current = "description"; }}
        onBlur={() => { editing.current = null; }}
        onChange={(event) => setDescription(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && descriptionDirty) void saveStrict({ description: description.trim() }).catch(() => undefined); }}
      />
      {canEdit && descriptionDirty && <div className="drawerActions">
        <button className="plain" type="button" onClick={() => setDescription(task.description)}>Descartar</button>
        <button type="button" onClick={() => void saveStrict({ description: description.trim() }).catch(() => undefined)}>Guardar descripción</button>
      </div>}
    </section>

    <section className="drawerSection" aria-labelledby={`${ids}-steps-title`}>
      <div className="drawerSectionHead"><h3 id={`${ids}-steps-title`}>Lista de pasos</h3><small>{checks.total ? `${checks.done}/${checks.total}` : `Hasta ${TASK_LIMITS.checklist}`}</small></div>
      {checks.total > 0 && <span className="bar" aria-hidden="true"><i style={{ width: `${(checks.done / checks.total) * 100}%` }} /></span>}
      <ul className="drawerSteps">
        {steps.map((item, index) => <li key={item.id} className={item.done ? "isDone" : ""}>
          <input type="checkbox" checked={item.done} disabled={disabled} aria-label={`Hecho: ${item.text}`} onChange={() => saveChecklist(steps.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry))} />
          <StepText item={item} disabled={disabled} onSave={(text) => saveChecklist(steps.map((entry) => entry.id === item.id ? { ...entry, text } : entry))} />
          <span className="drawerStepActions">
            <button className="plain" type="button" disabled={disabled || index === 0} onClick={() => moveStep(index, -1)} aria-label={`Subir «${item.text}»`}>↑</button>
            <button className="plain" type="button" disabled={disabled || index === steps.length - 1} onClick={() => moveStep(index, 1)} aria-label={`Bajar «${item.text}»`}>↓</button>
            <button className="plain" type="button" disabled={disabled} onClick={() => saveChecklist(steps.filter((entry) => entry.id !== item.id))} aria-label={`Quitar «${item.text}»`}>×</button>
          </span>
        </li>)}
      </ul>
      {canEdit && steps.length < TASK_LIMITS.checklist && <form className="add drawerStepAdd" onSubmit={(event) => { event.preventDefault(); addStep(); }}>
        <input value={newStep} maxLength={TASK_LIMITS.checkText} onChange={(event) => setNewStep(event.target.value)} placeholder="Añadir un paso" aria-label="Nuevo paso" />
        <button type="submit" disabled={!newStep.trim()}>Añadir</button>
      </form>}
    </section>

    <footer className="drawerFoot">
      <p className="drawerMeta">{task.createdAt ? `Creada${creator ? ` por ${creator}` : ""} el ${dateLabel(task.createdAt)}` : "Creada antes del registro de autoría"} · revisión {task.revision}</p>
      {canEdit && (confirmDelete
        ? <div className="drawerDelete" role="group" aria-label="Confirmar eliminación">
          <p>Se elimina para todo el equipo. La actividad conserva el registro.</p>
          <div>
            <button className="plain" type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancelar</button>
            <button className="ghost drawerDeleteConfirm" type="button" onClick={() => void remove()} disabled={deleting}>{deleting ? "Eliminando…" : "Eliminar tarea"}</button>
          </div>
          {deleteError && <p className="projectSettingsError" role="alert">{deleteError}</p>}
        </div>
        : <button className="plain drawerDeleteButton" type="button" onClick={() => setConfirmDelete(true)}>Eliminar tarea</button>)}
    </footer>
  </Drawer>;
}

function StepText({ item, disabled, onSave }: { item: TaskCheckItem; disabled: boolean; onSave: (text: string) => void }) {
  const [text, setText] = useState(item.text);
  useEffect(() => setText(item.text), [item.text]);
  return <input
    className="drawerStepText"
    value={text}
    maxLength={TASK_LIMITS.checkText}
    disabled={disabled}
    aria-label="Texto del paso"
    onChange={(event) => setText(event.target.value)}
    onBlur={() => { const clean = text.trim(); if (!clean) setText(item.text); else if (clean !== item.text) onSave(clean); }}
    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
  />;
}
