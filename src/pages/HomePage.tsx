import type { Milestone, Project, Task } from "../types";
import { repositoryLabel } from "../features/repository/githubRepository";
import { DeadlineCountdown } from "../features/schedule/DeadlineCountdown";
import { AmbientScene } from "../features/ambient/AmbientScene";
import { dueState, milestoneProgress, nextMilestone } from "../features/milestones/milestoneModel";
import { milestoneDueLabel } from "../features/milestones/MilestonesPanel";
import { Sk, SkText } from "../components/Skeleton";

function GitHubMark() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>;
}

/**
 * `ready` says which collections have arrived. Until then the cards keep their
 * titles and actions, and only the numbers and the milestone become shaped blocks.
 * Without a project (the boot screen) the hero is a placeholder too.
 */
/** Hero while the project itself is unknown: name, descriptor and lead, and the scene card. */
function HeroSkeleton() {
  return <div className="hero skGroup" aria-hidden="true">
    <div className="heroCopy">
      <p className="eyebrow"><Sk w={190} /></p>
      <h1><Sk w="46%" /></h1>
      <p className="heroDescriptor"><Sk w="64%" /></p>
      <p className="lead"><SkText widths={["92%", "40%"]} /></p>
    </div>
    <section className="clock ambientCard">
      <div className="clockHead"><div><p className="eyebrow"><Sk w={120} /></p><h2 className="ambientTitle"><Sk w={170} /></h2></div><span className="clockLabel"><Sk w={64} /></span></div>
      <div className="ambientStage"><Sk shape="block" className="skFill" r={0} /></div>
    </section>
  </div>;
}

export function HomePage({ project, tasks, branchesCount, milestones, now, ready }: { project: Project | null; tasks: Task[]; branchesCount: number; milestones: Milestone[]; now: number; ready: { tasks: boolean; branches: boolean; milestones: boolean } }) {
  const upcoming = nextMilestone(milestones, tasks);
  const upcomingProgress = upcoming ? milestoneProgress(upcoming, tasks) : null;
  const upcomingState = upcoming ? dueState(upcoming.dueAt, now) : null;
  const done = tasks.filter((task) => task.status === "Hecha").length;
  const active = tasks.filter((task) => task.status === "En curso").length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <section className="page-view" id="overview" data-page={project ? "home" : undefined}>
      {project ? <div className="hero">
        <div className="heroCopy">
          <p className="eyebrow">ESPACIO PRIVADO · PROYECTO</p>
          <h1>{project.name}</h1>
          <div className="heroDescriptorRow">
            <p className="heroDescriptor">{project.description || "Un espacio compartido para organizar el trabajo del equipo."}</p>
            {project.repositoryUrl && <a className="heroRepoLink" href={project.repositoryUrl} target="_blank" rel="noreferrer" aria-label={`Abrir el repositorio ${repositoryLabel(project.repositoryUrl)} en GitHub`} title={repositoryLabel(project.repositoryUrl)}>
              <GitHubMark /><span>GitHub</span><span aria-hidden="true">↗</span>
            </a>}
          </div>
          <p className="lead">Coordina tareas, registra avances y mantén al equipo en el mismo contexto.</p>
        </div>
        {project.schedule ? <DeadlineCountdown schedule={project.schedule} /> : <AmbientScene />}
      </div> : <HeroSkeleton />}

      <div className="overviewGrid" aria-busy={!ready.tasks || !ready.branches || !ready.milestones}>
        <a className="panel overviewCard" href="#work">
          <span className="cardEyebrow">PLAN DE TRABAJO</span>
          <strong className="overviewCardTitle">Tareas del proyecto</strong>
          {ready.tasks ? <>
            <span className="overviewCardCopy">{done} de {tasks.length} completadas · {active} en curso · {percent}% de avance.</span>
            <span className="bar" aria-label={`${percent}% completado`}><i style={{ width: `${percent}%` }} /></span>
          </> : <>
            <span className="overviewCardCopy"><SkText widths={["100%", "24%"]} /></span>
            <span className="bar" aria-hidden="true" />
          </>}
          <span className="cardAction">Abrir tareas <span aria-hidden="true">↗</span></span>
        </a>
        <a className="panel overviewCard" href="#branches-page">
          <span className="cardEyebrow">REPOSITORIO Y EQUIPO</span>
          <strong className="overviewCardTitle">Ramas y cambios</strong>
          <span className="overviewCardCopy">{ready.branches ? <>{branchesCount} {branchesCount === 1 ? "registro del equipo" : "registros del equipo"}{project?.repositoryUrl ? " y actividad reciente de GitHub." : " en este espacio."}</> : <Sk w="64%" />}</span>
          <span className="cardAction">Abrir registro <span aria-hidden="true">↗</span></span>
        </a>
        <a className={`panel overviewCard milestoneOverview${upcomingState === "overdue" ? " isOverdue" : ""}`} href="#work">
          <span className="cardEyebrow">PRÓXIMO HITO</span>
          {!(ready.milestones && ready.tasks) ? <>
            <strong className="overviewCardTitle"><Sk w="52%" /></strong>
            <span className="overviewCardCopy"><SkText widths={["88%", "46%"]} /></span>
          </> : <>
          <strong className="overviewCardTitle">{upcoming ? upcoming.title : "Sin hitos pendientes"}</strong>
          <span className="overviewCardCopy">
            {upcoming && upcomingProgress
              ? <>{upcomingState === "overdue" ? "Vencido · " : upcomingState === "soon" ? "Vence en menos de 24 h · " : ""}{milestoneDueLabel(upcoming)}. {upcomingProgress.total ? `${upcomingProgress.done} de ${upcomingProgress.total} tareas hechas.` : "Todavía no tiene tareas vinculadas."}</>
              : milestones.length ? "Todos los hitos activos están terminados." : "Divide la entrega en hitos desde el plan de trabajo."}
          </span>
          {upcomingProgress && <span className="bar" aria-label={`${upcomingProgress.percent}% del hito completado`}><i style={{ width: `${upcomingProgress.percent}%` }} /></span>}
          </>}
          <span className="cardAction">Ver hitos <span aria-hidden="true">↗</span></span>
        </a>
        <a className="panel overviewCard" href="#settings-page">
          <span className="cardEyebrow">ESPACIO DE TRABAJO</span>
          <strong className="overviewCardTitle">Configuración del proyecto</strong>
          <span className="overviewCardCopy">Administra la vista previa, el plazo de entrega y quién puede entrar a este proyecto.</span>
          <span className="cardAction">Ver configuración <span aria-hidden="true">↗</span></span>
        </a>
      </div>
    </section>
  );
}
