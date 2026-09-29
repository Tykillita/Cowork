import { PageHeading } from './PageHeading';
import { repeat, Sk, SkGroup, SkText } from './Skeleton';

/** The overview's real card layout while the project view code arrives. */
export function HomePageSkeleton() {
  return <section className="page-view" id="overview" aria-hidden="true">
    <div className="hero skGroup">
      <div className="heroCopy">
        <p className="eyebrow"><Sk w={190} /></p><h1><Sk w="46%" /></h1>
        <p className="heroDescriptor"><Sk w="64%" /></p>
        <p className="lead"><SkText widths={["92%", "40%"]} /></p>
      </div>
      <section className="clock ambientCard">
        <div className="clockHead"><div><p className="eyebrow"><Sk w={120} /></p><h2 className="ambientTitle"><Sk w={170} /></h2></div><span className="clockLabel"><Sk w={64} /></span></div>
        <div className="ambientStage"><Sk shape="block" className="skFill" r={0} /></div>
      </section>
    </div>
    <div className="overviewGrid" aria-busy="true">
      <a className="panel overviewCard" href="#work"><span className="cardEyebrow">PLAN DE TRABAJO</span><strong className="overviewCardTitle">Tareas del proyecto</strong><span className="overviewCardCopy"><SkText widths={["100%", "24%"]} /></span><span className="bar" aria-hidden="true" /><span className="cardAction">Abrir tareas <span aria-hidden="true">↗</span></span></a>
      <a className="panel overviewCard" href="#branches-page"><span className="cardEyebrow">REPOSITORIO Y EQUIPO</span><strong className="overviewCardTitle">Ramas y cambios</strong><span className="overviewCardCopy"><Sk w="64%" /></span><span className="cardAction">Abrir registro <span aria-hidden="true">↗</span></span></a>
      <a className="panel overviewCard milestoneOverview" href="#work"><span className="cardEyebrow">PRÓXIMO HITO</span><strong className="overviewCardTitle"><Sk w="52%" /></strong><span className="overviewCardCopy"><SkText widths={["88%", "46%"]} /></span><span className="cardAction">Ver hitos <span aria-hidden="true">↗</span></span></a>
      <a className="panel overviewCard" href="#settings-page"><span className="cardEyebrow">ESPACIO DE TRABAJO</span><strong className="overviewCardTitle">Configuración del proyecto</strong><span className="overviewCardCopy">Administra la vista previa, el plazo de entrega y quién puede entrar a este proyecto.</span><span className="cardAction">Ver configuración <span aria-hidden="true">↗</span></span></a>
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

/** The whole page before the project is known (boot): static headings, shaped controls and rows. */
export function TaskBoardSkeleton() {
  return (
    <section className="page-view" aria-hidden="true">
      <PageHeading eyebrow="EJECUCIÓN DEL PROYECTO" title="Plan de trabajo" description="Divide el proyecto en hitos y fases, toma una tarea y mantén al equipo sincronizado." />
      {/* Same id as the real panel: its width rules are keyed on it. */}
      <section className="panel taskPanel" id="task-board">
        <div className="panelHead"><div><p className="eyebrow">AVANCE</p><h2>Objetivos y tareas</h2></div></div>
        <p className="panelIntro"><Sk w="58%" /></p>
        <div className="progressBox">
          <div className="progressLine"><span className="eyebrow">AVANCE DEL PROYECTO</span><p className="tag"><Sk inline w="22ch" /></p></div>
          <div className="bar" />
        </div>
        <div className="taskFilters">
          {["Responsable", "Estado", "Hito"].map((label) => <span className="controlField" key={label}><span>{label}</span><Sk shape="block" h={36} r={10} /></span>)}
          <div className="taskFilterShortcuts"><Sk shape="block" w={70} h={28} r={10} /><Sk shape="block" w={74} h={28} r={10} /></div>
        </div>
        <div id="tasks"><TaskRowsSkeleton /></div>
        <div className="add taskCreate"><Sk shape="block" h={38} r={10} className="skGrow" /><Sk shape="block" w={120} h={38} r={10} /><Sk shape="block" w={120} h={38} r={10} /><Sk shape="block" w={104} h={38} r={10} /></div>
      </section>
      <section className="panel milestonesPanel">
        <div className="panelHead"><div><p className="eyebrow">HITOS</p><h2>Entregas intermedias</h2></div></div>
        <p className="panelIntro"><Sk w="72%" /></p>
        <MilestonesSkeleton />
      </section>
    </section>
  );
}


/** Branch entries while the register loads: name pill, goal line and author line. */
export function BranchListSkeleton() {
  return <SkGroup label="Cargando ramas registradas">
    {repeat(4, (index) => <article className="branch" key={index}>
      <Sk shape="block" inline w={[150, 118, 170, 132][index]} h={24} r={8} /> <Sk inline w={36} />
      <p><Sk w={["82%", "64%", "74%", "58%"][index]} /></p>
      <p className="tag"><Sk w={120} /></p>
    </article>)}
  </SkGroup>;
}

/** The whole page before the project is known (boot). */
export function BranchesPageSkeleton() {
  return (
    <section className="page-view" id="branch-log" aria-hidden="true">
      <PageHeading eyebrow="COLABORACIÓN DEL EQUIPO" title="Ramas y cambios" description="Revisa lo que ya existe en GitHub y registra el trabajo en curso para que todos sepan qué se está construyendo." />
      <section className="panel branchPanel">
        <div className="panelHead"><div><p className="eyebrow">REGISTRO DEL EQUIPO</p><h2>¿En qué estamos trabajando?</h2></div><span className="clockLabel"><Sk inline w="9ch" /></span></div>
        <p className="panelIntro">El registro compartido ayuda a coordinarse; los datos de GitHub se consultan directamente desde el repositorio.</p>
        <div className="branchGrid">
          <div className="branchForm"><div className="bf">
            <span className="controlField"><span>Nombre de la rama</span><Sk shape="block" h={36} r={10} /></span>
            <span className="controlField"><span>Objetivo del cambio</span><Sk shape="block" h={82} r={10} /></span>
            <div className="add"><Sk shape="block" w={96} h={32} r={10} /></div>
          </div></div>
          <div className="branchList"><BranchListSkeleton /></div>
        </div>
      </section>
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

/** The page before the project is known (boot): the two panels every member sees. */
export function ProjectSettingsSkeleton() {
  return (
    <section className="page-view" aria-hidden="true">
      <header className="pageHeading"><p className="eyebrow">CONFIGURACIÓN DEL PROYECTO</p><h1><Sk w="32%" /></h1><p className="pageDescription">Configura la vista previa, el plazo de entrega, GitHub y quién puede acceder a este espacio.</p></header>
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
        <div className="panelHead"><div><p className="eyebrow">GITHUB</p><h2>Ramas del repositorio</h2></div><span className="clockLabel"><Sk inline w="18ch" /></span></div>
        <p className="panelIntro">Decide quién puede crear y borrar ramas de GitHub desde Cowork. GitHub sigue exigiendo que cada persona tenga permiso de escritura en el repositorio, y la rama principal y las protegidas nunca se borran desde aquí.</p>
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
