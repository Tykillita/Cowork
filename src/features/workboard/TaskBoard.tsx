import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { DEFAULT_TASK_PHASE, TASK_LIMITS, TASK_PRIORITIES, TASK_STATUSES, type BranchEntry, type Milestone, type PanelUser, type Project, type Task, type TaskStatus, type TeamDirectoryEntry, type WorkboardMode } from "../../types";
import { PageHeading } from "../../components/PageHeading";
import { assigneeView } from "../milestones/milestoneModel";
import { MilestonesPanel } from "../milestones/MilestonesPanel";
import type { MilestoneDraft } from "./firestoreWorkboard";
import { Sk } from "../../components/Skeleton";
import { KanbanSkeleton, TaskDrawerSkeleton, TaskRowsSkeleton } from "../../components/PageSkeletons";
import type { WorkboardReady } from "./useWorkboard";
import { EMPTY_TASK_DETAILS, isOpenUnassigned, nextOrder, orderAt } from "./taskModel";
import { activeFilterCount, columnsOf, filterTasks, isOverdue, NO_FILTERS, type AssigneeFilter, type DueFilter, type TaskFilterState } from "./taskFilters";
import { readTaskView, writeTaskView, type TaskView } from "./taskView";
import { KanbanView } from "./KanbanView";
import { TaskListView } from "./TaskListView";
import type { TaskItemActions } from "./TaskItemParts";
import { newId } from "../../lib/ids";
import { useHashParams } from "../../lib/useHashRoute";
import { ReleaseSyncPanel } from "../changelog-sync/ReleaseSyncPanel";

const TaskDrawer = lazy(() => import("./TaskDrawer").then(({ TaskDrawer }) => ({ default: TaskDrawer })));

const PRIORITY_LABEL = { alta: "Alta", media: "Media", baja: "Baja" } as const;

/** A move shown right away; dropped once the live task has a newer revision or the save fails. */
type Override = { patch: Partial<Task>; revision: number };

export function TaskBoard({
  project, user, tasks, milestones, directory, branches, mode, ready, isOwner, now,
  onCreate, onUpdate, onRemove, onCreateMilestone, onUpdateMilestone,
}: {
  project: Project;
  user: PanelUser;
  tasks: Task[];
  milestones: Milestone[];
  directory: TeamDirectoryEntry[];
  /** The team's branch register, offered when linking a task to a branch. */
  branches: BranchEntry[];
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
  // One id per typed task: a retry after a dropped connection reuses it instead of duplicating the task.
  const [draftId, setDraftId] = useState(() => newId("t"));
  const [filters, setFilters] = useState<TaskFilterState>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<TaskView>(readTaskView);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const { params, setParams } = useHashParams();
  const assigneeParam = params.get("assignee");
  const dueParam = params.get("due");
  const focusParam = params.get("focus");
  const taskParam = params.get("task");

  // Links from the summary and notices: "#work?assignee=mine", "?due=overdue", "?focus=milestones", "?task=<id>".
  useEffect(() => {
    if (assigneeParam === "mine" || assigneeParam === "unassigned") setFilters((current) => ({ ...current, assignee: assigneeParam }));
  }, [assigneeParam]);
  useEffect(() => {
    if (dueParam === "overdue" || dueParam === "week") setFilters((current) => ({ ...current, due: dueParam }));
  }, [dueParam]);
  useEffect(() => {
    if (focusParam === "milestones" && ready.milestones) document.getElementById("milestones")?.scrollIntoView({ block: "start" });
  }, [focusParam, ready.milestones]);

  // Moves are shown at once; the live data takes over when it catches up.
  const shown = useMemo(() => tasks.map((task) => {
    const override = overrides[task.id];
    return override && task.revision <= override.revision ? { ...task, ...override.patch } : task;
  }), [overrides, tasks]);
  useEffect(() => {
    setOverrides((current) => {
      const stale = Object.keys(current).filter((id) => (tasks.find((task) => task.id === id)?.revision ?? Infinity) > current[id].revision);
      if (!stale.length) return current;
      const next = { ...current };
      stale.forEach((id) => delete next[id]);
      return next;
    });
  }, [tasks]);

  const activeMilestones = milestones.filter((milestone) => !milestone.archived);
  const milestoneTitle = (id: string) => milestones.find((milestone) => milestone.id === id)?.title ?? "Hito no disponible";
  const activeMembers = directory.filter((entry) => entry.active);
  const done = shown.filter((task) => task.status === "Hecha").length;
  const unassigned = shown.filter(isOpenUnassigned).length;
  const overdue = shown.filter((task) => isOverdue(task, now)).length;
  const phaseOptions = [...new Set([DEFAULT_TASK_PHASE, ...[...shown].sort((a, b) => a.order - b.order).map((task) => task.phase)])];
  const filtered = filterTasks(shown, filters, user.id, now);
  const filterCount = activeFilterCount(filters);
  const formerAssignees = [...new Map(shown
    .filter((task) => task.assigneeUid && !activeMembers.some((member) => member.uid === task.assigneeUid))
    .map((task) => [task.assigneeUid, assigneeView(task, directory).label])).entries()];
  const drawerTask = taskParam ? shown.find((task) => task.id === taskParam) ?? null : null;

  // A link to a task that no longer exists just shows the plan.
  useEffect(() => {
    if (taskParam && ready.tasks && !tasks.some((task) => task.id === taskParam)) setParams(withoutTask(), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskParam, ready.tasks, tasks]);
  useEffect(() => {
    if (taskParam && ready.tasks && view === "list") document.getElementById(`task-${taskParam}`)?.scrollIntoView({ block: "center" });
  }, [taskParam, ready.tasks, view]);

  function withoutTask() {
    const next = Object.fromEntries(params.entries());
    delete next.task;
    return next;
  }

  const hint = mode === "remote"
    ? "Cualquier miembro puede crear, asignar y mover tareas. Los cambios se sincronizan en unos segundos."
    : mode === "connecting"
      ? "Conectando con Firebase… Puedes escribir: lo que agregues se guardará en cuanto termine de conectar."
      : "Sin conexión con Firebase. Los cambios nuevos requieren conexión para guardarse.";

  function chooseView(next: TaskView) {
    setView(next);
    writeTaskView(next);
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      await onCreate({
        id: draftId,
        order: nextOrder(tasks),
        phase: phase.trim() || DEFAULT_TASK_PHASE,
        title: cleanTitle,
        status: "Pendiente",
        assignee: "",
        assigneeUid: "",
        milestoneId: newMilestone,
        revision: 0,
        ...EMPTY_TASK_DETAILS,
      });
      // Only clear what was typed once the save is confirmed.
      setTitle("");
      setDraftId(newId("t"));
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
      throw reason;
    } finally {
      setBusy((current) => ({ ...current, [task.id]: false }));
    }
  }

  /** Board move: a new status and a place among the visible cards of that column. */
  async function move(task: Task, status: TaskStatus, index: number) {
    const live = tasks.find((entry) => entry.id === task.id);
    if (!live) return;
    const siblings = columnsOf(filtered)[status].filter((entry) => entry.id !== task.id);
    const { order, respace } = orderAt(siblings, index, task.id);
    const next = { ...live, status, order };
    setOverrides((current) => ({ ...current, [task.id]: { patch: { status, order }, revision: live.revision } }));
    try {
      await change(live, next);
      // Rarely, there is no whole number left between two cards: renumber that column.
      for (const entry of respace) {
        const sibling = tasks.find((candidate) => candidate.id === entry.id);
        if (sibling && sibling.order !== entry.order) await onUpdate(sibling, { ...sibling, order: entry.order });
      }
    } catch {
      setOverrides((current) => { const copy = { ...current }; delete copy[task.id]; return copy; });
    }
  }

  const actions: TaskItemActions = {
    user,
    directory,
    activeMembers,
    canEdit: mode === "remote",
    now,
    isBusy: (id) => Boolean(busy[id]),
    errorOf: (id) => rowErrors[id] ?? "",
    change: (task, next) => change(task, next).catch(() => undefined),
    assign: (task, member) => change(task, { ...task, assigneeUid: member?.uid ?? "", assignee: member?.name ?? "" }).catch(() => undefined),
    open: (task) => setParams({ ...Object.fromEntries(params.entries()), task: task.id }),
    milestoneTitle,
  };

  const toggle = (key: "assignee" | "due", value: AssigneeFilter | DueFilter) => setFilters((current) => ({ ...current, [key]: current[key] === value ? "all" : value }));

  return (
    <section className="page-view workPlanStack" id="work" data-page="work">
      <PageHeading eyebrow="EJECUCIÓN DEL PROYECTO" title="Plan de trabajo" description="Divide el proyecto en hitos y fases, toma una tarea y mantén al equipo sincronizado." />
      <section className="panel taskPanel" id="task-board" data-view={view}>
        <div className="panelHead">
          <div><p className="eyebrow">AVANCE</p><h2>Objetivos y tareas</h2></div>
          <div className="segmented taskViewSwitch" role="group" aria-label="Vista de las tareas">
            <button type="button" aria-pressed={view === "board"} className={view === "board" ? "isActive" : ""} onClick={() => chooseView("board")}>Tablero</button>
            <button type="button" aria-pressed={view === "list"} className={view === "list" ? "isActive" : ""} onClick={() => chooseView("list")}>Lista</button>
          </div>
        </div>
        <p className="panelIntro" id="taskHint">{hint}</p>
        <div className="progressBox">
          <div className="progressLine"><span className="eyebrow">AVANCE DEL PROYECTO</span><p className="tag" id="prog">{ready.tasks ? `${done} de ${shown.length} tareas hechas · ${unassigned} sin asignar${overdue ? ` · ${overdue} ${overdue === 1 ? "vencida" : "vencidas"}` : ""}` : <Sk inline w="22ch" />}</p></div>
          <div className="bar" aria-hidden="true"><i style={{ width: `${shown.length ? (done / shown.length) * 100 : 0}%` }} /></div>
        </div>

        <div className="taskToolbar">
          <label className="taskSearch"><span className="visuallyHidden">Buscar tareas</span>
            <input type="search" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Buscar por título, fase, rama…" />
          </label>
          <div className="taskFilterShortcuts">
            <button type="button" className={`plain${filters.assignee === "mine" ? " isActive" : ""}`} aria-pressed={filters.assignee === "mine"} onClick={() => toggle("assignee", "mine")}>Mis tareas</button>
            <button type="button" className={`plain${filters.assignee === "unassigned" ? " isActive" : ""}`} aria-pressed={filters.assignee === "unassigned"} onClick={() => toggle("assignee", "unassigned")}>Sin asignar</button>
            <button type="button" className={`plain${filters.due === "overdue" ? " isActive" : ""}`} aria-pressed={filters.due === "overdue"} onClick={() => toggle("due", "overdue")}>Vencidas</button>
            <button type="button" className="plain taskFiltersToggle" aria-expanded={filtersOpen} aria-controls="task-filters" onClick={() => setFiltersOpen((open) => !open)}>Filtros{filterCount ? ` (${filterCount})` : ""}</button>
            {filterCount > 0 && <button type="button" className="plain" onClick={() => setFilters(NO_FILTERS)}>Quitar filtros</button>}
          </div>
        </div>
        <div className="taskFilters" id="task-filters" role="group" aria-label="Filtrar tareas" data-open={filtersOpen}>
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
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as TaskFilterState["status"] })}>
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
          <label className="controlField"><span>Prioridad</span>
            <select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value as TaskFilterState["priority"] })}>
              <option value="all">Todas</option>
              {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>)}
            </select>
          </label>
          <label className="controlField"><span>Fecha límite</span>
            <select value={filters.due} onChange={(event) => setFilters({ ...filters, due: event.target.value as DueFilter })}>
              <option value="all">Cualquier fecha</option>
              <option value="overdue">Vencidas</option>
              <option value="week">Próximos 7 días</option>
              <option value="none">Sin fecha</option>
            </select>
          </label>
        </div>
        <p className="visuallyHidden" role="status">{filterCount ? `${filtered.length} de ${shown.length} tareas con los filtros actuales.` : ""}</p>

        <div id="tasks">
          {!ready.tasks ? (view === "board" ? <KanbanSkeleton /> : <TaskRowsSkeleton />)
            : !shown.length ? <p className="empty">No hay tareas todavía. Escribe la primera abajo.</p>
            : view === "board" ? <>
              <KanbanView columns={columnsOf(filtered)} actions={actions} onMove={(task, status, index) => void move(task, status, index)} />
              {!filtered.length && <p className="empty">Ninguna tarea coincide con los filtros.</p>}
            </>
            : filtered.length ? <TaskListView tasks={filtered} milestones={milestones} actions={actions} focusedId={taskParam} />
            : <p className="empty">Ninguna tarea coincide con los filtros.</p>}
        </div>
        <form className="add taskCreate" onSubmit={createTask}>
          <input value={title} onChange={(event) => { setTitle(event.target.value); setCreateError(""); }} placeholder="Añadir una tarea" aria-label="Título de la nueva tarea" maxLength={TASK_LIMITS.title} disabled={creating} />
          <input className="taskCreatePhase" value={phase} onChange={(event) => setPhase(event.target.value)} list="task-phase-options" aria-label="Fase" placeholder="Fase" maxLength={TASK_LIMITS.phase} disabled={creating} />
          <datalist id="task-phase-options">{phaseOptions.map((name) => <option key={name} value={name} />)}</datalist>
          <select value={newMilestone} onChange={(event) => setNewMilestone(event.target.value)} aria-label="Hito de la nueva tarea" disabled={creating}>
            <option value="">Sin hito</option>
            {activeMilestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
          </select>
          <button type="submit" disabled={creating || !title.trim()}>{creating ? "Guardando…" : "Agregar tarea"}</button>
        </form>
        {createError && <p className="projectSettingsError" role="alert">{createError}</p>}
      </section>
      <ReleaseSyncPanel project={project} userId={user.id} tasks={shown} mode={mode} onCreate={onCreate} onUpdate={onUpdate} />
      <MilestonesPanel project={project} milestones={milestones} ready={ready.milestones && ready.tasks} tasks={tasks} isOwner={isOwner} now={now} onCreate={onCreateMilestone} onUpdate={onUpdateMilestone} />
      {drawerTask && <Suspense fallback={<TaskDrawerSkeleton onClose={() => setParams(withoutTask(), { replace: true })} />}>
        <TaskDrawer
          project={project}
          user={user}
          task={drawerTask}
          tasks={shown}
          milestones={milestones}
          directory={directory}
          register={branches}
          canEdit={mode === "remote"}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onClose={() => setParams(withoutTask(), { replace: true })}
        />
      </Suspense>}
    </section>
  );
}
