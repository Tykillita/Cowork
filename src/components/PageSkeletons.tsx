import { PageHeading } from './PageHeading';
import { repeat, Sk, SkGroup, SkText } from './Skeleton';
import { Drawer } from './Drawer';
import { readTaskView } from '../features/workboard/taskView';
import { RepoIcon } from '../features/code/repoIcons';
// The code page's skeleton takes the shape of the real tree and viewer before their chunk loads.
import './ui/FolderTree.css';
import './ui/CodeBlock.css';

/** Rows of a summary card: a task title with its status chip, or an event with its avatar and time. */
export function HomeListSkeleton({ rows, kind }: { rows: number; kind: "task" | "event" }) {
  return <SkGroup className="homeList" label={kind === "task" ? "Cargando tus tareas" : "Cargando actividad"}>
    {repeat(rows, (index) => <div className={`homeRow${kind === "event" ? " homeEvent" : ""}`} key={index}>
      {kind === "event" && <Sk shape="circle" w={24} h={24} />}
      <span className="homeRowText">
        <Sk w={["78%", "62%", "70%", "54%", "66%"][index % 5]} />
        {kind === "event" && <small><Sk w={56} /></small>}
      </span>
      {kind === "task" && <Sk shape="pill" w={[58, 64, 58][index % 3]} h={19} />}
    </div>)}
  </SkGroup>;
}

/** Hero while the project itself is unknown: name, descriptor, facts and the scene card. */
export function HeroSkeleton() {
  return <div className="hero skGroup" aria-hidden="true">
    <div className="heroCopy">
      <p className="eyebrow"><Sk w={190} /></p><h1><Sk w="46%" /></h1>
      <p className="heroDescriptor"><Sk w="64%" /></p>
      <ul className="heroFacts"><li><Sk inline w="17ch" /></li><li><Sk inline w="13ch" /></li></ul>
    </div>
    <section className="clock ambientCard">
      <div className="clockHead"><div><p className="eyebrow"><Sk w={120} /></p><h2 className="ambientTitle"><Sk w={170} /></h2></div><span className="clockLabel"><Sk w={64} /></span></div>
      <div className="ambientStage"><Sk shape="block" className="skFill" r={0} /></div>
    </section>
  </div>;
}

/** The summary's real card grid while the project view code arrives. */
export function HomePageSkeleton() {
  return <section className="page-view" id="overview" aria-hidden="true">
    <HeroSkeleton />
    <div className="homeGrid" aria-busy="true">
      <article className="panel homeCard homeYou">
        <div className="homeCardHead"><p className="homeEyebrow">PARA TI</p><span className="homeCount"><Sk inline w="2ch" /></span></div>
        <h2 className="homeCardTitle">Tus tareas abiertas</h2>
        <HomeListSkeleton rows={3} kind="task" />
        <div className="homeCardFoot"><span className="homeLink">Ver mis tareas <span aria-hidden="true">↗</span></span><span className="homeLink"><Sk inline w="9ch" /></span></div>
      </article>
      <article className="panel homeCard homeProgress">
        <div className="homeCardHead"><p className="homeEyebrow">AVANCE</p></div>
        <h2 className="homeCardTitle">Plan de trabajo</h2>
        <p className="homeBigNumber"><Sk inline w="3ch" /><small><Sk inline w="11ch" /></small></p>
        <span className="bar" />
        <dl className="homeStats">{["Pendiente", "En curso", "Hecha"].map((status) => <div key={status}><dt>{status}</dt><dd><Sk inline w="2ch" /></dd></div>)}</dl>
        <div className="homeCardFoot"><span className="homeLink">Abrir plan <span aria-hidden="true">↗</span></span></div>
      </article>
      <article className="panel homeCard homeMilestone">
        <div className="homeCardHead"><p className="homeEyebrow">PRÓXIMO HITO</p></div>
        <h2 className="homeCardTitle"><Sk w="62%" /></h2>
        <p className="homeCopy"><SkText widths={["88%", "46%"]} /></p>
        <div className="homeCardFoot"><span className="homeLink">Ver hitos <span aria-hidden="true">↗</span></span></div>
      </article>
      <article className="panel homeCard homeActivity">
        <div className="homeCardHead"><p className="homeEyebrow">ACTIVIDAD RECIENTE</p></div>
        <h2 className="homeCardTitle">Lo último del equipo</h2>
        <HomeListSkeleton rows={5} kind="event" />
      </article>
      <article className="panel homeCard homeRepo">
        <div className="homeCardHead"><p className="homeEyebrow"><Sk w={150} /></p><Sk shape="pill" w={58} h={20} /></div>
        <h2 className="homeCardTitle">Repositorio</h2>
        <dl className="homeFacts">
          <div><dt>Rama principal</dt><dd><Sk inline w="8ch" /></dd></div>
          <div><dt>Último cambio</dt><dd><SkText widths={["90%", "40%"]} /></dd></div>
        </dl>
        <p className="homeRepoStats"><span><Sk inline w="9ch" /></span><span><Sk inline w="14ch" /></span><span><Sk inline w="8ch" /></span></p>
        <div className="homeCardFoot"><span className="homeLink">Ramas y cambios <span aria-hidden="true">↗</span></span><span className="homeLink">GitHub <span aria-hidden="true">↗</span></span></div>
      </article>
    </div>
  </section>;
}

/** Milestone cards while they load: title and status chip, due line, progress bar and caption. */
export function MilestonesSkeleton() {
  return <SkGroup className="milestoneList" label="Cargando hitos">
    {repeat(2, (index) => <article className="milestoneItem" key={index}>
      <div className="milestoneItemHead"><h3><Sk w={index ? 120 : 168} /></h3><Sk shape="pill" w={64} h={20} /></div>
      <p className="milestoneMeta"><Sk w={index ? 150 : 190} /></p>
      <div className="milestoneProgress"><span className="bar" aria-hidden="true" /><small><Sk w={110} /></small></div>
    </article>)}
  </SkGroup>;
}


/** Phases and task rows while the first snapshot loads, with the real row grid and controls. */
export function TaskRowsSkeleton() {
  return <SkGroup label="Cargando tareas">
    {[3, 2].map((rows, phaseIndex) => <section className="phase" key={phaseIndex}>
      <h3><Sk w={phaseIndex ? 64 : 88} /></h3>
      {repeat(rows, (index) => <article className="row taskRow" key={index}>
        <div className="taskRowMain">
          <div className="t"><Sk w={["72%", "54%", "64%"][index % 3]} /></div>
          <div className="meta"><Sk shape="pill" w={92} h={28} />{index % 2 === 0 && <Sk shape="pill" w={64} h={28} />}</div>
        </div>
        <div className="meta taskRowControls"><Sk shape="block" w={68} h={31} r={9} /><Sk shape="block" w={78} h={31} r={9} /><Sk shape="block" w={40} h={28} r={10} /></div>
      </article>)}
    </section>)}
  </SkGroup>;
}

/** Three status columns with cards shaped like the real ones: title, chips, assignee and status. */
export function KanbanSkeleton() {
  return <SkGroup className="kanban" label="Cargando tablero">
    {["Pendiente", "En curso", "Hecha"].map((status, column) => <section className="kanbanColumn" key={status}>
      <header className="kanbanColumnHead"><h3>{status}</h3><span className="kanbanCount"><Sk inline w="1ch" /></span></header>
      <div className="kanbanList">
        {repeat([3, 2, 2][column], (index) => <article className="taskCard" key={index}>
          <div className="taskCardHead"><span className="taskCardTitle"><Sk w={["78%", "62%", "70%"][index % 3]} /></span><Sk shape="block" w={28} h={28} r={8} /></div>
          <div className="taskChips">{index % 2 === 0 && <Sk shape="pill" w={74} h={20} />}</div>
          <div className="taskCardFoot"><div className="taskCardPeople"><Sk shape="pill" w={96} h={28} /></div><Sk shape="block" w={92} h={31} r={9} /></div>
        </article>)}
      </div>
    </section>)}
  </SkGroup>;
}

/** The whole page before the project is known (boot): static headings, shaped controls and the remembered view. */
export function TaskBoardSkeleton() {
  const view = readTaskView();
  return (
    <section className="page-view workPlanStack" aria-hidden="true">
      <PageHeading eyebrow="EJECUCIÓN DEL PROYECTO" title="Plan de trabajo" description="Divide el proyecto en hitos y fases, toma una tarea y mantén al equipo sincronizado." />
      {/* Same id as the real panel: its width rules are keyed on it. */}
      <section className="panel taskPanel" id="task-board" data-view={view}>
        <div className="panelHead"><div><p className="eyebrow">AVANCE</p><h2>Objetivos y tareas</h2></div><div className="segmented taskViewSwitch"><button type="button" tabIndex={-1} className={view === "board" ? "isActive" : ""}>Tablero</button><button type="button" tabIndex={-1} className={view === "list" ? "isActive" : ""}>Lista</button></div></div>
        <p className="panelIntro"><Sk w="58%" /></p>
        <div className="progressBox">
          <div className="progressLine"><span className="eyebrow">AVANCE DEL PROYECTO</span><p className="tag"><Sk inline w="22ch" /></p></div>
          <div className="bar" />
        </div>
        <div className="taskToolbar">
          <span className="taskSearch"><Sk shape="block" h={36} r={10} /></span>
          <div className="taskFilterShortcuts"><Sk shape="block" w={70} h={28} r={10} /><Sk shape="block" w={74} h={28} r={10} /><Sk shape="block" w={64} h={28} r={10} /><Sk shape="block" w={58} h={28} r={10} /></div>
        </div>
        <div className="taskFilters" data-open="false">
          {["Responsable", "Estado", "Hito", "Prioridad", "Fecha límite"].map((label) => <span className="controlField" key={label}><span>{label}</span><Sk shape="block" h={36} r={10} /></span>)}
        </div>
        <div id="tasks">{view === "board" ? <KanbanSkeleton /> : <TaskRowsSkeleton />}</div>
        <div className="add taskCreate"><Sk shape="block" h={38} r={10} className="skGrow" /><Sk shape="block" w={120} h={38} r={10} /><Sk shape="block" w={120} h={38} r={10} /><Sk shape="block" w={104} h={38} r={10} /></div>
      </section>
      <section className="panel releaseSyncPanel">
        <div className="panelHead"><div><p className="eyebrow">NOVEDADES DEL PROYECTO</p><h2>Propuestas de tareas</h2></div><Sk shape="block" w={132} h={34} r={10} /></div>
        <p className="panelIntro"><Sk w="68%" /></p>
        <SkGroup className="releaseSyncLoading" label="Cargando propuestas"><article className="releaseProposal"><Sk w="42%" /><Sk w="82%" /><Sk shape="block" h={34} r={10} /></article></SkGroup>
      </section>
      <section className="panel milestonesPanel">
        <div className="panelHead"><div><p className="eyebrow">HITOS</p><h2>Entregas intermedias</h2></div></div>
        <p className="panelIntro"><Sk w="72%" /></p>
        <MilestonesSkeleton />
      </section>
    </section>
  );
}

/** The task drawer while its code arrives: the same sheet with header, title, fields and sections. */
export function TaskDrawerSkeleton({ onClose }: { onClose: () => void }) {
  return <Drawer label="Cargando tarea" onClose={onClose} busy className="taskDrawer">
    <div className="skGroup" aria-hidden="true">
      <header className="drawerHead"><div><p className="eyebrow"><Sk w={120} /></p></div><Sk shape="circle" w={32} h={32} /></header>
      <div className="drawerTitleField"><Sk w="80%" h={22} /></div>
      <dl className="drawerFields">
        {["Estado", "Responsable", "Prioridad", "Fecha límite", "Fase", "Hito", "Rama"].map((label) => <div key={label}><dt>{label}</dt><dd><Sk shape="block" h={34} r={10} w={label === "Responsable" ? 140 : "100%"} /></dd></div>)}
      </dl>
      <section className="drawerSection"><div className="drawerSectionHead"><h3>Descripción</h3></div><Sk shape="block" h={110} r={12} /></section>
      <section className="drawerSection"><div className="drawerSectionHead"><h3>Lista de pasos</h3></div><SkText widths={["70%", "54%"]} /></section>
    </div>
  </Drawer>;
}

/** Branch rows while the register and GitHub answer: name with its chips, goal line and author line. */
export function BranchRowsSkeleton() {
  return <SkGroup label="Cargando ramas">
    {repeat(4, (index) => <article className="branchRow" key={index}>
      <div className="branchRowMain">
        <div className="branchRowTitle"><Sk w={[110, 150, 128, 170][index]} />{index === 0 ? <Sk shape="pill" w={58} h={18} /> : <Sk shape="pill" w={92} h={18} />}</div>
        <p className="branchReason"><Sk w={["74%", "62%", "70%", "54%"][index]} /></p>
        <p className="tag branchMeta"><Sk w={120} /></p>
      </div>
      <div className="branchRowActions"><Sk shape="block" w={62} h={28} r={9} /></div>
    </article>)}
  </SkGroup>;
}

/** The whole page before the project is known (boot): the list and the register form. */
export function BranchesPageSkeleton() {
  return (
    <section className="page-view" id="branch-log" aria-hidden="true">
      <PageHeading eyebrow="COLABORACIÓN DEL EQUIPO" title="Ramas y cambios" description="Las ramas del repositorio y del registro del equipo en una sola lista: qué existe en GitHub, quién trabaja en qué y qué tareas avanzan en cada rama." />
      <div className="branchesLayout">
        <section className="panel branchPanel">
          <div className="panelHead"><div><p className="eyebrow">RAMAS</p><h2>¿En qué estamos trabajando?</h2></div><span className="clockLabel"><Sk inline w="9ch" /></span></div>
          <div className="branchToolbar"><div className="branchFilters">{["Todas", "En Cowork", "Solo en GitHub", "Con PR"].map((label) => <Sk key={label} shape="block" w={label.length * 7 + 22} h={28} r={10} />)}</div><span className="branchSearch"><Sk shape="block" h={34} r={10} /></span></div>
          <div className="branchList"><BranchRowsSkeleton /></div>
        </section>
        <aside className="panel branchFormPanel">
          <div className="panelHead"><div><p className="eyebrow">REGISTRO DEL EQUIPO</p><h2>Registrar una rama</h2></div></div>
          <div className="bf">
            <span className="controlField"><span>Nombre de la rama</span><Sk shape="block" h={36} r={10} /></span>
            <span className="controlField"><span>Objetivo del cambio</span><Sk shape="block" h={82} r={10} /></span>
            <div className="add"><Sk shape="block" w={120} h={32} r={10} /></div>
          </div>
        </aside>
      </div>
    </section>
  );
}


/** Member or request rows while they load: round initial, name and email, then role pill and actions. */
export function MemberRowsSkeleton({ rows, label, role = false }: { rows: number; label: string; role?: boolean }) {
  return <SkGroup className="projectMemberList" label={label}>
    {repeat(rows, (index) => <div className="projectMemberRow" key={index}>
      <Sk shape="circle" w={34} h={34} />
      <span className="projectMemberIdentity"><strong><Sk w={["34%", "42%", "28%"][index % 3]} /></strong><small><Sk w={["52%", "60%", "46%"][index % 3]} /></small></span>
      {role && <Sk shape="pill" w={index ? 56 : 74} h={23} />}
      <span className="projectMemberActions"><Sk w={46} /><Sk w={36} /></span>
    </div>)}
  </SkGroup>;
}

/** The page before the project is known (boot): section chips and the panels every member sees, as the owner sees them. */
export function ProjectSettingsSkeleton() {
  return (
    <section className="page-view" aria-hidden="true">
      <header className="pageHeading"><p className="eyebrow">CONFIGURACIÓN DEL PROYECTO</p><h1><Sk w="32%" /></h1><p className="pageDescription">Configura GitHub, las novedades, el plazo de entrega, la vista previa y quién puede acceder a este espacio.</p></header>
      <div className="settingsLayout">
        <nav className="settingsSections">{["GitHub", "Plazo", "Vista previa", "Novedades"].map((label) => <a key={label}>{label}</a>)}</nav>
        <div className="settingsPanels">
          <section className="panel projectSettingsPanel">
            <div className="panelHead"><div><p className="eyebrow">GITHUB</p><h2>Repositorio y ramas</h2></div><span className="clockLabel"><Sk inline w="18ch" /></span></div>
            <p className="panelIntro">Vincula el repositorio del proyecto y decide quién puede crear y borrar ramas de GitHub desde Cowork. GitHub sigue exigiendo que cada persona tenga permiso de escritura en el repositorio, y la rama principal y las protegidas nunca se borran desde aquí.</p>
            <div className="projectSettingsForm projectRepositoryForm">
              <span className="controlField"><span>Repositorio de GitHub</span><Sk shape="block" h={38} r={10} /></span>
              <p className="projectSettingsHint"><Sk w="52%" /></p>
              <div className="projectSettingsActions"><Sk shape="block" w={150} h={38} r={10} /></div>
            </div>
            <dl className="projectGitHubFacts">
              <div><dt>Repositorio</dt><dd><Sk w="14ch" /></dd></div>
              <div><dt>Tu cuenta de GitHub</dt><dd><Sk w="10ch" /></dd></div>
            </dl>
            <div className="projectSettingsForm">
              <div className="formSection">
                <p className="formSectionLegend">Quién puede crear y borrar ramas</p>
                <div className="scheduleModes"><Sk shape="block" h={62} r={12} /><Sk shape="block" h={62} r={12} /></div>
              </div>
            </div>
          </section>
          <section className="panel projectSettingsPanel">
            <div className="panelHead"><div><p className="eyebrow">CALENDARIO</p><h2>Plazo de entrega</h2></div><span className="clockLabel"><Sk inline w="18ch" /></span></div>
            <p className="panelIntro">Con un plazo, el resumen muestra la cuenta regresiva hasta el final del último día. Sin plazo, muestra una escena ambiental.</p>
            <div className="projectSettingsForm">
              <div className="scheduleField">
                <p className="formSectionLegend">Plazo de entrega</p>
                <div className="scheduleModes"><Sk shape="block" h={62} r={12} /><Sk shape="block" h={62} r={12} /></div>
              </div>
              <div className="projectSettingsActions"><Sk shape="block" w={104} h={38} r={10} /></div>
            </div>
          </section>
          <section className="panel projectSettingsPanel">
            <div className="panelHead"><div><p className="eyebrow">VISTA PREVIA</p><h2>Página principal</h2></div><span className="clockLabel"><Sk inline w="18ch" /></span></div>
            <p className="panelIntro">La página configurada aparece dentro de la tarjeta de este proyecto en el selector de Cowork.</p>
            <div className="projectSettingsForm">
              <span className="controlField"><span>URL pública del sitio</span><Sk shape="block" h={38} r={10} /></span>
              <p className="projectSettingsHint"><Sk w="80%" /></p>
              <div className="projectIconField"><span className="controlField"><span>Icono del proyecto</span><Sk shape="block" h={38} r={10} /></span><Sk shape="block" w={38} h={38} r={10} /></div>
              <p className="projectSettingsHint"><Sk w="86%" /></p>
              <div className="projectSettingsActions"><Sk shape="block" w={118} h={38} r={10} /></div>
            </div>
          </section>
          <section className="panel projectSettingsPanel">
            <div className="panelHead"><div><p className="eyebrow">TAREAS DEL PROYECTO</p><h2>Página de novedades</h2></div><span className="clockLabel"><Sk inline w="18ch" /></span></div>
            <p className="panelIntro">Cowork puede proponer tareas a partir de las novedades publicadas.</p>
            <div className="projectSettingsForm">
              <span className="controlField"><span>Enlace de novedades</span><Sk shape="block" h={38} r={10} /></span>
              <p className="projectSettingsHint"><Sk w="84%" /></p>
              <div className="projectSettingsActions"><Sk shape="block" w={136} h={38} r={10} /></div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

/** An access link while it loads: the compact QR tile, link field, expiry line and buttons. */
export function AccessLinkSkeleton() {
  return <SkGroup className="accessLinkList" label="Cargando enlaces">
    <div className="accessLinkItem">
      <div className="accessShare isCompact">
        <Sk shape="block" w={104} h={104} r={12} />
        <div className="accessShareBody">
          <span className="controlField"><Sk w={150} /><Sk shape="block" h={36} r={10} /></span>
          <p className="accessShareHint"><Sk w="70%" /></p>
          <div className="accessShareActions"><Sk shape="block" w={118} h={38} r={10} /><Sk shape="block" w={112} h={38} r={10} /></div>
        </div>
      </div>
    </div>
  </SkGroup>;
}

/** Tree rows while the repository listing loads: chevron, icon and a name of varying length. */
export function FolderTreeSkeleton({ rows = 8, nested = false }: { rows?: number; nested?: boolean }) {
  return <SkGroup className={nested ? "ftGroup" : "folderTree"} label="Cargando archivos">
    {repeat(rows, (index) => <div className="ftRow" key={index} style={{ paddingLeft: `${8 + (nested ? 16 : index > 2 && index < 6 ? 16 : 0)}px` }}>
      <span className="ftChevron" /><Sk shape="block" w={16} h={14} r={3} /><span className="ftLabel"><Sk w={[96, 72, 120, 84, 64, 110, 90, 76][index % 8]} /></span>
    </div>)}
  </SkGroup>;
}

/** The code window while a file loads: header, file name, numbered lines and footer. */
export function CodeViewerSkeleton() {
  return <section className="codeBlock" aria-busy="true" aria-label="Cargando archivo">
    <header className="cbHeader"><span className="cbDots" aria-hidden="true"><i /><i /><i /></span><span className="cbBreadcrumb"><Sk w={180} /></span><span className="cbStats"><Sk inline w="9ch" /></span></header>
    <div className="cbFilename"><Sk w={120} /></div>
    <SkGroup className="cbBody" label="Cargando archivo">
      <div className="cbPre hasNumbers">
        {repeat(14, (index) => <div className="cbLine" key={index}><span className="cbNum" data-n={index + 1} /><span className="cbText"><Sk inline w={`${[38, 52, 24, 0, 61, 44, 70, 33, 0, 48, 57, 29, 40, 22][index]}ch`} /></span></div>)}
      </div>
    </SkGroup>
    <footer className="cbFooter"><Sk inline w="7ch" /><Sk inline w="8ch" /><span className="cbEncoding">UTF-8</span></footer>
  </section>;
}

/** The repository bar with its fixed labels; the branch and the counts shimmer. */
export function RepoToolbarSkeleton() {
  return <div className="repoToolbar" aria-hidden="true">
    <div className="repoToolbarRefs">
    <span className="popover repoPicker"><span className="repoRefButton"><RepoIcon name="branch" /><span className="repoRefName"><Sk w={72} /></span><RepoIcon name="caret" className="repoCaret" /></span></span>
    <span className="repoCount repoBranches"><RepoIcon name="branch" /><Sk w={44} /></span>
    <span className="repoCount repoTags"><RepoIcon name="tag" /><Sk w={56} /></span>
    </div>
    <div className="repoToolbarActions">
    <span className="repoFind"><span className="repoFindField"><RepoIcon name="search" /><input disabled placeholder="Ir a archivo" tabIndex={-1} /><kbd className="repoFindKey">T</kbd></span></span>
    <span className="repoButton repoFindTrigger">Ir a archivo</span>
    <span className="popover repoAdd"><span className="repoButton repoAddButton"><RepoIcon name="plus" /><span className="repoButtonLabel">Añadir archivo</span><RepoIcon name="caret" className="repoCaret" /></span></span>
    <span className="repoIconButton repoRefresh"><RepoIcon name="refresh" /></span>
    <span className="popover repoCode"><span className="repoButton repoCodeButton"><RepoIcon name="code" /><span>Código</span><RepoIcon name="caret" className="repoCaret" /></span></span>
    </div>
  </div>;
}

/** The files dialog keeps its controls and tree dimensions while the first reference loads. */
export function RepoFilesDialogSkeleton() {
  return <>
    <div className="repoFilesControls" aria-hidden="true">
      <span className="popover repoPicker"><span className="repoRefButton"><RepoIcon name="branch" /><span className="repoRefName"><Sk w={72} /></span><RepoIcon name="caret" className="repoCaret" /></span></span>
      <span className="repoButton repoAddButton"><RepoIcon name="plus" /></span>
      <span className="repoIconButton"><RepoIcon name="search" /></span>
    </div>
    <div className="repoFind repoFilesFinder">
      <div className="repoFindField"><RepoIcon name="search" /><input disabled placeholder="Ir a archivo" aria-label="Ir a archivo" /><kbd className="repoFindKey" aria-hidden="true">T</kbd></div>
      <div className="repoFilesContent"><FolderTreeSkeleton /></div>
    </div>
  </>;
}

/** The whole code page before the project is known (boot). */
export function CodePageSkeleton() {
  return <section className="page-view" id="code" aria-hidden="true">
    <PageHeading eyebrow="CÓDIGO DEL PROYECTO" title="Código" description="Explora los archivos del repositorio y de cada rama sin salir de Cowork." />
    <RepoToolbarSkeleton />
    <div className="codeLayout">
      <aside className="panel codeTreePanel"><div className="codeTreeHead"><Sk w={120} /></div><FolderTreeSkeleton /></aside>
      <div className="codeViewer"><section className="panel codeEmpty codePlaceholder"><CodeViewerSkeleton /></section></div>
    </div>
  </section>;
}
