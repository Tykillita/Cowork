import { useMemo, useState, type FormEvent } from "react";
import { DEFAULT_TASK_PHASE, TASK_STATUSES, type Milestone, type PanelUser, type Project, type Task, type TaskStatus, type TeamDirectoryEntry, type WorkboardMode } from "../../types";
import { PageHeading } from "../../components/PageHeading";
import { assigneeView } from "../milestones/milestoneModel";
import { MilestonesPanel } from "../milestones/MilestonesPanel";
import type { MilestoneDraft } from "./firestoreWorkboard";
import { AssigneeMenu } from "./AssigneeMenu";
import { Sk } from "../../components/Skeleton";
import { TaskRowsSkeleton } from "../../components/PageSkeletons";
import type { WorkboardReady } from "./useWorkboard";

type AssigneeFilter = "all" | "mine" | "unassigned" | "review" | `uid:${string}`;
type Filters = { assignee: AssigneeFilter; status: "all" | TaskStatus; milestone: string };
const NO_FILTERS: Filters = { assignee: "all", status: "all", milestone: "all" };

export function TaskBoard({
  project, user, tasks, milestones, directory, mode, ready, isOwner, now,
  onCreate, onUpdate, onRemove, onCreateMilestone, onUpdateMilestone,
}: {
  project: Project;
  user: PanelUser;
  tasks: Task[];
  milestones: Milestone[];
  directory: TeamDirectoryEntry[];
  mode: WorkboardMode;
  ready: WorkboardReady;
  isOwner: boolean;
  now: number;
  onCreate: (task: Task) => Promise<void>;
  onUpdate: (base: Task, next: Task) => Promise<void>;
  onRemove: (task: Task) => Promise<void>;
  onCreateMilestone: (draft: MilestoneDraft) => Promise<void>;
  onUpdateMilestone: (base: Milestone, draft: MilestoneDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<string>(DEFAULT_TASK_PHASE);
  const [newMilestone, setNewMilestone] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const activeMilestones = milestones.filter((milestone) => !milestone.archived);
  const milestoneTitle = (id: string) => milestones.find((milestone) => milestone.id === id)?.title ?? "Hito no disponible";
  const activeMembers = directory.filter((entry) => entry.active);
  const done = tasks.filter((task) => task.status === "Hecha").length;
  const unassigned = tasks.filter((task) => !task.assigneeUid && !task.assignee && task.status !== "Hecha").length;
  const sorted = useMemo(() => [...tasks].sort((a, b) => (a.order || 0) - (b.order || 0)), [tasks]);
  const phaseOptions = [...new Set([DEFAULT_TASK_PHASE, ...sorted.map((task) => task.phase)])];

  const filtered = sorted.filter((task) => {
    const assignee = filters.assignee;
    if (assignee === "mine" && task.assigneeUid !== user.id) return false;
    if (assignee === "unassigned" && (task.assigneeUid || task.assignee)) return false;
    if (assignee === "review" && (task.assigneeUid || !task.assignee)) return false;
    if (assignee.startsWith("uid:") && task.assigneeUid !== assignee.slice(4)) return false;
    if (filters.status !== "all" && task.status !== filters.status) return false;
    if (filters.milestone === "none" && task.milestoneId) return false;
    if (filters.milestone !== "all" && filters.milestone !== "none" && task.milestoneId !== filters.milestone) return false;
    return true;
  });
  const phases = [...new Set(filtered.map((task) => task.phase))];
  const filtering = filters.assignee !== "all" || filters.status !== "all" || filters.milestone !== "all";
  const formerAssignees = [...new Map(tasks
    .filter((task) => task.assigneeUid && !activeMembers.some((member) => member.uid === task.assigneeUid))
    .map((task) => [task.assigneeUid, assigneeView(task, directory).label])).entries()];

  const hint = mode === "remote"
    ? "Cualquier miembro puede crear, asignar y reasignar tareas. Los cambios se sincronizan en unos segundos."
    : mode === "connecting"
      ? "Conectando con Firebase… Puedes escribir: lo que agregues se guardará en cuanto termine de conectar."
      : "Sin conexión con Firebase. Los cambios nuevos requieren conexión para guardarse.";

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      await onCreate({
        id: `t${Date.now()}`,
        order: Math.max(0, ...tasks.map((task) => task.order || 0)) + 1,
        phase,
        title: cleanTitle,
        status: "Pendiente",
        assignee: "",
        assigneeUid: "",
        milestoneId: newMilestone,
        revision: 0,
      });
      // Only clear what was typed once the save is confirmed.
      setTitle("");
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : "No se pudo crear la tarea.");
    } finally {
      setCreating(false);
    }
  }

  async function change(task: Task, next: Task) {
    setBusy((current) => ({ ...current, [task.id]: true }));
    setRowErrors((current) => ({ ...current, [task.id]: "" }));
    try {
      await onUpdate(task, next);
    } catch (reason) {
      setRowErrors((current) => ({ ...current, [task.id]: reason instanceof Error ? reason.message : "No se pudo guardar el cambio." }));
    } finally {
      setBusy((current) => ({ ...current, [task.id]: false }));
    }
  }

  async function remove(task: Task) {
    if (!window.confirm(`¿Eliminar la tarea «${task.title}»?`)) return;
    setBusy((current) => ({ ...current, [task.id]: true }));
    try { await onRemove(task); }
    catch (reason) { setRowErrors((current) => ({ ...current, [task.id]: reason instanceof Error ? reason.message : "No se pudo eliminar." })); }
    finally { setBusy((current) => ({ ...current, [task.id]: false })); }
  }

  const assign = (task: Task, member: { uid: string; name: string } | null) => change(task, {
    ...task,
    assigneeUid: member?.uid ?? "",
    assignee: member?.name ?? "",
  });

  return (
    <section className="page-view" id="work" data-page="work">
      <PageHeading eyebrow="EJECUCIÓN DEL PROYECTO" title="Plan de trabajo" description="Divide el proyecto en hitos y fases, toma una tarea y mantén al equipo sincronizado." />
      <section className="panel taskPanel" id="task-board">
        <div className="panelHead"><div><p className="eyebrow">AVANCE</p><h2>Objetivos y tareas</h2></div></div>
        <p className="panelIntro" id="taskHint">{hint}</p>
        <div className="progressBox">
          <div className="progressLine"><span className="eyebrow">AVANCE DEL PROYECTO</span><p className="tag" id="prog">{ready.tasks ? `${done} de ${tasks.length} tareas hechas · ${unassigned} sin asignar` : <Sk inline w="22ch" />}</p></div>
          <div className="bar" aria-hidden="true"><i style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} /></div>
        </div>

        <div className="taskFilters" role="group" aria-label="Filtrar tareas">
          <label className="controlField"><span>Responsable</span>
            <select value={filters.assignee} onChange={(event) => setFilters({ ...filters, assignee: event.target.value as AssigneeFilter })}>
              <option value="all">Todas las personas</option>
              <option value="mine">Mis tareas</option>
              <option value="unassigned">Sin asignar</option>
              <option value="review">Asignación anterior por revisar</option>
              {activeMembers.map((member) => <option key={member.uid} value={`uid:${member.uid}`}>{member.name}</option>)}
              {formerAssignees.map(([uid, name]) => <option key={uid} value={`uid:${uid}`}>{name} (sin acceso)</option>)}
            </select>
          </label>
          <label className="controlField"><span>Estado</span>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as Filters["status"] })}>
              <option value="all">Todos los estados</option>
              {TASK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="controlField"><span>Hito</span>
            <select value={filters.milestone} onChange={(event) => setFilters({ ...filters, milestone: event.target.value })}>
              <option value="all">Todos los hitos</option>
              <option value="none">Sin hito</option>
              {milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}{milestone.archived ? " (archivado)" : ""}</option>)}
            </select>
          </label>
          <div className="taskFilterShortcuts">
            <button type="button" className={`plain${filters.assignee === "mine" ? " isActive" : ""}`} aria-pressed={filters.assignee === "mine"} onClick={() => setFilters({ ...filters, assignee: filters.assignee === "mine" ? "all" : "mine" })}>Mis tareas</button>
            <button type="button" className={`plain${filters.assignee === "unassigned" ? " isActive" : ""}`} aria-pressed={filters.assignee === "unassigned"} onClick={() => setFilters({ ...filters, assignee: filters.assignee === "unassigned" ? "all" : "unassigned" })}>Sin asignar</button>
            {filtering && <button type="button" className="plain" onClick={() => setFilters(NO_FILTERS)}>Quitar filtros</button>}
          </div>
        </div>
        <p className="visuallyHidden" role="status">{filtering ? `${filtered.length} de ${tasks.length} tareas con los filtros actuales.` : ""}</p>

        <div id="tasks">
          {!ready.tasks ? <TaskRowsSkeleton /> : phases.length ? phases.map((phaseName) => (
            <section className="phase" key={phaseName} aria-labelledby={`phase-${phaseName.replace(/\W/g, "-")}`}>
              <h3 id={`phase-${phaseName.replace(/\W/g, "-")}`}>{phaseName}</h3>
              {filtered.filter((task) => task.phase === phaseName).map((task) => {
                const view = assigneeView(task, directory);
                const mine = task.assigneeUid === user.id;
                const isBusy = Boolean(busy[task.id]);
                return (
                  <article className={`row taskRow${task.status === "Hecha" ? " done" : ""}`} key={task.id} aria-busy={isBusy}>
                    <div className="taskRowMain">
                      <div className="t">{task.title}</div>
                      <div className="meta">
                        <AssigneeMenu current={view} members={activeMembers} disabled={isBusy || mode !== "remote"} label={`Responsable de ${task.title}`} onChoose={(member) => void assign(task, member)} />
                        {!task.assigneeUid && <button className="ghost" type="button" disabled={isBusy || mode !== "remote"} onClick={() => void change(task, { ...task, assigneeUid: user.id, assignee: user.name, status: task.status === "Pendiente" ? "En curso" : task.status })}>Asignarme</button>}
                        {mine && <button className="plain" type="button" disabled={isBusy || mode !== "remote"} onClick={() => void assign(task, null)}>Soltar</button>}
                        {task.milestoneId && <span className="tag milestoneTag">◆ {milestoneTitle(task.milestoneId)}</span>}
                      </div>
                      {rowErrors[task.id] && <p className="projectSettingsError taskRowError" role="alert">{rowErrors[task.id]}</p>}
                    </div>
                    <div className="meta taskRowControls">
                      <select value={task.milestoneId} disabled={isBusy || mode !== "remote"} onChange={(event) => void change(task, { ...task, milestoneId: event.target.value })} aria-label={`Hito de ${task.title}`}>
                        <option value="">Sin hito</option>
                        {activeMilestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
                        {task.milestoneId && !activeMilestones.some((milestone) => milestone.id === task.milestoneId) && <option value={task.milestoneId}>{milestoneTitle(task.milestoneId)} (archivado)</option>}
                      </select>
                      <select value={task.status} disabled={isBusy || mode !== "remote"} onChange={(event) => void change(task, { ...task, status: event.target.value as TaskStatus })} aria-label={`Estado: ${task.title}`}>
                        {TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}
                      </select>
                      <button className="plain" type="button" disabled={isBusy || mode !== "remote"} onClick={() => void remove(task)} aria-label={`Eliminar tarea: ${task.title}`}>Eliminar</button>
                    </div>
                  </article>
                );
              })}
            </section>
          )) : <p className="empty">{tasks.length ? "Ninguna tarea coincide con los filtros." : "No hay tareas todavía."}</p>}
        </div>
        <form className="add taskCreate" onSubmit={createTask}>
          <input value={title} onChange={(event) => { setTitle(event.target.value); setCreateError(""); }} placeholder="Añadir una tarea" aria-label="Título de la nueva tarea" maxLength={300} disabled={creating} />
          <select value={phase} onChange={(event) => setPhase(event.target.value)} aria-label="Fase" disabled={creating}>
            {phaseOptions.map((name) => <option key={name}>{name}</option>)}
          </select>
          <select value={newMilestone} onChange={(event) => setNewMilestone(event.target.value)} aria-label="Hito de la nueva tarea" disabled={creating}>
            <option value="">Sin hito</option>
            {activeMilestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
          </select>
          <button type="submit" disabled={creating || !title.trim()}>{creating ? "Guardando…" : "Agregar tarea"}</button>
        </form>
        {createError && <p className="projectSettingsError" role="alert">{createError}</p>}
      </section>
      <MilestonesPanel project={project} milestones={milestones} ready={ready.milestones && ready.tasks} tasks={tasks} isOwner={isOwner} now={now} onCreate={onCreateMilestone} onUpdate={onUpdateMilestone} />
    </section>
  );
}
