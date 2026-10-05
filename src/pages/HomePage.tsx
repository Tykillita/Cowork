import { TASK_STATUSES, type ActivityEvent, type BranchEntry, type Milestone, type PanelUser, type Project, type Task, type TaskStatus, type TeamDirectoryEntry } from "../types";
import { repositoryLabel } from "../features/repository/githubRepository";
import { DeadlineCountdown } from "../features/schedule/DeadlineCountdown";
import { AmbientScene } from "../features/ambient/AmbientScene";
import { dueState, milestoneProgress, nextMilestone } from "../features/milestones/milestoneModel";
import { milestoneDueLabel } from "../features/milestones/MilestonesPanel";
import { describeEvent, eventTarget } from "../features/activity/activityEvents";
import { RepositorySummaryCard } from "../features/repository/RepositorySummaryCard";
import { isOpenUnassigned } from "../features/workboard/taskModel";
import type { WorkboardReady } from "../features/workboard/useWorkboard";
import { Avatar } from "../components/Avatar";
import { HomeListSkeleton } from "../components/PageSkeletons";
import { Sk, SkText } from "../components/Skeleton";
import { buildHash } from "../lib/hashRoute";
import { relativeTime } from "../lib/relativeTime";

function GitHubMark() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>;
}

/** What the summary needs from the activity centre: this project's events and how to read them. */
export type HomeActivity = {
  events: ActivityEvent[];
  ready: boolean;
  isUnreadEvent: (event: ActivityEvent) => boolean;
  milestoneTitle: (id: string) => string;
};

const STATUS_TONE: Record<TaskStatus, string> = { Pendiente: "muted", "En curso": "info", Hecha: "success" };
const MY_TASKS_SHOWN = 4;
const EVENTS_SHOWN = 6;

/** My open tasks: work in progress first, then the plan's order. */
function myOpenTasks(tasks: Task[], uid: string) {
  return tasks
    .filter((task) => task.assigneeUid === uid && task.status !== "Hecha")
    .sort((a, b) => Number(b.status === "En curso") - Number(a.status === "En curso") || a.order - b.order);
}

export function HomePage({ project, user, isOwner, tasks, branches, milestones, directory, now, ready, activity }: {
  project: Project;
  user: PanelUser;
  isOwner: boolean;
  tasks: Task[];
  branches: BranchEntry[];
  milestones: Milestone[];
  directory: TeamDirectoryEntry[];
  now: number;
  ready: WorkboardReady;
  activity: HomeActivity;
}) {
  const mine = myOpenTasks(tasks, user.id);
  const unassigned = tasks.filter(isOpenUnassigned).length;
  const counts = Object.fromEntries(TASK_STATUSES.map((status) => [status, tasks.filter((task) => task.status === status).length])) as Record<TaskStatus, number>;
  const percent = tasks.length ? Math.round((counts.Hecha / tasks.length) * 100) : 0;
  const upcoming = nextMilestone(milestones, tasks);
  const upcomingProgress = upcoming ? milestoneProgress(upcoming, tasks) : null;
  const upcomingState = upcoming ? dueState(upcoming.dueAt, now) : null;
  const team = directory.filter((entry) => entry.active).length;
  const events = activity.events.filter((event) => event.projectId === project.id).slice(0, EVENTS_SHOWN);
  const setup = [
    { section: "github", label: "Vincular el repositorio de GitHub", done: Boolean(project.repositoryUrl) },
    { section: "schedule", label: "Definir el plazo de entrega", done: Boolean(project.schedule) },
    { section: "preview", label: "Configurar la vista previa", done: Boolean(project.previewUrl) },
    { section: "access", label: "Invitar al equipo", done: team > 1 },
  ];
  const showSetup = isOwner && ready.directory && setup.some((item) => !item.done);

  return (
    <section className="page-view" id="overview" data-page="home">
      <div className="hero">
        <div className="heroCopy">
          <p className="eyebrow">ESPACIO PRIVADO · PROYECTO</p>
          <h1>{project.name}</h1>
          <div className="heroDescriptorRow">
            <p className="heroDescriptor">{project.description || "Un espacio compartido para organizar el trabajo del equipo."}</p>
            {project.repositoryUrl && <a className="heroRepoLink" href={project.repositoryUrl} target="_blank" rel="noreferrer" aria-label={`Abrir el repositorio ${repositoryLabel(project.repositoryUrl)} en GitHub`} title={repositoryLabel(project.repositoryUrl)}>
              <GitHubMark /><span>GitHub</span><span aria-hidden="true">↗</span>
            </a>}
          </div>
          <ul className="heroFacts" aria-label="Datos del proyecto">
            <li>{ready.directory ? `${team} ${team === 1 ? "persona" : "personas"} en el equipo` : <Sk inline w="17ch" />}</li>
            <li>{ready.tasks ? `${tasks.length - counts.Hecha} ${tasks.length - counts.Hecha === 1 ? "tarea abierta" : "tareas abiertas"}` : <Sk inline w="13ch" />}</li>
            {project.previewUrl && <li><a href={project.previewUrl} target="_blank" rel="noreferrer">Sitio publicado <span aria-hidden="true">↗</span></a></li>}
          </ul>
        </div>
        {project.schedule ? <DeadlineCountdown schedule={project.schedule} /> : <AmbientScene />}
      </div>

      <div className={`homeGrid${project.repositoryUrl ? " hasCode" : ""}`} aria-busy={!ready.tasks || !ready.milestones || !activity.ready}>
        <article className="panel homeCard homeYou" aria-labelledby="home-you-title">
          <div className="homeCardHead"><p className="homeEyebrow">PARA TI</p><span className="homeCount">{ready.tasks ? mine.length : <Sk inline w="2ch" />}</span></div>
          <h2 className="homeCardTitle" id="home-you-title">Tus tareas abiertas</h2>
          {!ready.tasks ? <HomeListSkeleton rows={3} kind="task" /> : mine.length ? <ul className="homeList">
            {mine.slice(0, MY_TASKS_SHOWN).map((task) => <li key={task.id}>
              <a className="homeRow" href={buildHash("work", { task: task.id })}>
                <span className="homeRowText">{task.title}</span>
                <span className="accessStatusChip" data-tone={STATUS_TONE[task.status]}>{task.status}</span>
              </a>
            </li>)}
          </ul> : <p className="homeCopy">No tienes tareas abiertas.{unassigned ? " Toma una de las que nadie tiene asignada." : ""}</p>}
          <div className="homeCardFoot">
            <a className="homeLink" href="#work?assignee=mine">{ready.tasks && mine.length > MY_TASKS_SHOWN ? `Ver las ${mine.length}` : "Ver mis tareas"} <span aria-hidden="true">↗</span></a>
            <a className="homeLink" href="#work?assignee=unassigned">{ready.tasks ? `${unassigned} sin asignar` : <Sk inline w="9ch" />}</a>
          </div>
        </article>

        <article className="panel homeCard homeProgress" aria-labelledby="home-progress-title">
          <div className="homeCardHead"><p className="homeEyebrow">AVANCE</p></div>
          <h2 className="homeCardTitle" id="home-progress-title">Plan de trabajo</h2>
          <p className="homeBigNumber">{ready.tasks ? `${percent}%` : <Sk inline w="3ch" />}<small>{ready.tasks ? (tasks.length ? `${counts.Hecha} de ${tasks.length} hechas` : "Todavía no hay tareas") : <Sk inline w="11ch" />}</small></p>
          <span className="bar" role={ready.tasks ? "progressbar" : undefined} aria-valuenow={ready.tasks ? percent : undefined} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del proyecto" aria-hidden={!ready.tasks}>{ready.tasks && <i style={{ width: `${percent}%` }} />}</span>
          <dl className="homeStats">
            {TASK_STATUSES.map((status) => <div key={status}><dt>{status}</dt><dd>{ready.tasks ? counts[status] : <Sk inline w="2ch" />}</dd></div>)}
          </dl>
          <div className="homeCardFoot"><a className="homeLink" href="#work">Abrir plan <span aria-hidden="true">↗</span></a></div>
        </article>

        <article className={`panel homeCard homeMilestone${upcomingState === "overdue" ? " isOverdue" : ""}`} aria-labelledby="home-milestone-title">
          <div className="homeCardHead"><p className="homeEyebrow">PRÓXIMO HITO</p>{upcomingState === "overdue" && <span className="accessStatusChip" data-tone="error">Vencido</span>}{upcomingState === "soon" && <span className="accessStatusChip" data-tone="warning">Menos de 24 h</span>}</div>
          {!(ready.milestones && ready.tasks) ? <>
            <h2 className="homeCardTitle" id="home-milestone-title"><Sk w="62%" /></h2>
            <p className="homeCopy"><SkText widths={["88%", "46%"]} /></p>
          </> : <>
            <h2 className="homeCardTitle" id="home-milestone-title">{upcoming ? upcoming.title : "Sin hitos pendientes"}</h2>
            <p className="homeCopy">{upcoming
              ? milestoneDueLabel(upcoming)
              : milestones.length ? "Todos los hitos activos están terminados." : "Divide la entrega en hitos desde el plan de trabajo."}</p>
            {upcomingProgress && <div className="homeMilestoneProgress">
              <span className="homeMilestoneCount">{upcomingProgress.total ? <><strong>{upcomingProgress.done}</strong> de {upcomingProgress.total} tareas hechas</> : "Todavía no tiene tareas vinculadas"}</span>
              <span className="bar" role="progressbar" aria-valuenow={upcomingProgress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del hito"><i style={{ width: `${upcomingProgress.percent}%` }} /></span>
            </div>}
          </>}
          <div className="homeCardFoot"><a className="homeLink" href="#work?focus=milestones">Ver hitos <span aria-hidden="true">↗</span></a></div>
        </article>

        <article className="panel homeCard homeActivity" aria-labelledby="home-activity-title">
          <div className="homeCardHead"><p className="homeEyebrow">ACTIVIDAD RECIENTE</p></div>
          <h2 className="homeCardTitle" id="home-activity-title">Lo último del equipo</h2>
          {!activity.ready ? <HomeListSkeleton rows={EVENTS_SHOWN} kind="event" /> : events.length ? <ul className="homeList">
            {events.map((event) => {
              const unread = activity.isUnreadEvent(event);
              return <li key={event.id}>
                <a className={`homeRow homeEvent${unread ? " isUnread" : ""}`} href={eventTarget(event)}>
                  <Avatar name={event.actorName} size={24} />
                  <span className="homeRowText"><span><strong>{event.actorName}</strong> {describeEvent(event, activity.milestoneTitle)}</span><small><time dateTime={event.createdAt}>{relativeTime(event.createdAt, now)}</time></small></span>
                  {unread && <span className="homeUnread" aria-label="Sin leer" />}
                </a>
              </li>;
            })}
          </ul> : <p className="homeCopy">Todavía no hay actividad en este proyecto.</p>}
        </article>

        <RepositorySummaryCard project={project} user={user} isOwner={isOwner} register={branches} registerReady={ready.branches} linkedTasks={ready.tasks ? tasks.filter((task) => task.branch && task.status !== "Hecha").length : null} now={now} />

        {project.repositoryUrl && <article className="panel homeCard homeCode" aria-labelledby="home-code-title">
          <div className="homeCardHead"><p className="homeEyebrow">CÓDIGO</p></div>
          <h2 className="homeCardTitle" id="home-code-title">Explorar archivos</h2>
          <p className="homeCopy">Navega el árbol de la rama principal o de cualquier rama, con resaltado de sintaxis y enlaces a líneas concretas.</p>
          <div className="homeCardFoot"><a className="homeLink" href="#code">Abrir código <span aria-hidden="true">↗</span></a></div>
        </article>}
      </div>

      {showSetup && <section className="panel homeSetup" aria-labelledby="home-setup-title">
        <div><p className="homeEyebrow">PRIMEROS PASOS</p><h2 className="homeCardTitle" id="home-setup-title">Completa el proyecto</h2></div>
        <ul className="homeSetupList">
          {setup.map((item) => <li key={item.section}>
            <a className={item.done ? "isDone" : ""} href={buildHash("settings-page", { section: item.section })}>
              <span className="homeSetupCheck" aria-hidden="true">{item.done ? "✓" : ""}</span>
              <span>{item.label}</span>
              <span className="visuallyHidden">{item.done ? " (hecho)" : " (pendiente)"}</span>
            </a>
          </li>)}
        </ul>
      </section>}
    </section>
  );
}
