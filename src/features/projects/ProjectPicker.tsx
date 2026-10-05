import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CoworkMark } from "../../components/CoworkMark";
import CardSwap, { Card } from "../../components/ui/CardSwap";
import SpecularButton from "../../components/ui/SpecularButton";
import ScrambledText from "../../components/ui/ScrambledText";
import { normalizePreviewUrl } from "./projectUrls";
import { accessLinkUrl, readAccessContext } from "../auth/accessContext";
import type { AccessContext, PanelUser, Project, ProjectAccessLink } from "../../types";
import { HeaderDock } from "../../components/HeaderDock";
import type { ProjectDraft } from "./projectCatalog";
import { ACCESS_LINK_LIFETIME_DAYS } from "./accessLinkPolicy";
import { emptyScheduleDraft, ScheduleField, scheduleFromDraft, type ScheduleDraft } from "../schedule/ScheduleField";
import { AccessLinkShare } from "../access/AccessLinkShare";
import { AccessRequestDialog, LEGACY_INVITE_MESSAGE } from "../access/AccessRequestDialog";
import { OwnAccessRequests } from "../access/OwnAccessRequests";
import { usePersonal } from "../personal/PersonalContext";
import type { ProjectSort } from "../../types";
import { arrangeProjects, personalOrder } from "./projectListing";
import { ProjectOrderEditor } from "./ProjectOrderEditor";
import { SiteFavicon } from "./SiteFavicon";
import { ProjectSearchDock } from "./ProjectSearchDock";
import { Sk } from "../../components/Skeleton";

type FormDraft = { name: string; description: string; repositoryUrl: string; shareLink: boolean; schedule: ScheduleDraft };
type CreatedState = { project: Project; link: ProjectAccessLink | null; linkError: string; generating: boolean };
const emptyDraft = (): FormDraft => ({ name: "", description: "", repositoryUrl: "", shareLink: true, schedule: emptyScheduleDraft() });
type ProjectSlot = { type: "project"; project: Project } | { type: "empty"; slot: number };
const PAGE_SIZE = 3;

/** A generic web page (nav, hero, text) shown until the preview iframe has loaded. */
function PreviewPlaceholder() {
  return <div className="projectPreviewPlaceholder" aria-hidden="true">
    <div className="projectPreviewPlaceholderNav"><Sk w={70} /><span><Sk w={38} /><Sk w={38} /><Sk w={38} /></span></div>
    <Sk shape="block" h={120} r={10} />
    <Sk w="62%" /><Sk w="84%" /><Sk w="48%" />
  </div>;
}

export function ProjectPicker({
  projects,
  loading,
  error,
  user,
  openCreate,
  onCreateIntentConsumed,
  accessContext,
  onRetry,
  onSelect,
  onCreate,
  onCreateLink,
  onJoinAccess,
  onCloseAccess,
  onUserUpdated,
  onLinkGoogle,
  onSignOut,
  headerActions,
  profileMenu,
}: {
  projects: Project[];
  loading: boolean;
  error: string;
  user: PanelUser;
  openCreate: boolean;
  onCreateIntentConsumed: () => void;
  accessContext: AccessContext | null;
  onRetry: () => void;
  onSelect: (project: Project) => void;
  onCreate: (draft: ProjectDraft) => Promise<Project>;
  onCreateLink: (project: Project) => Promise<ProjectAccessLink>;
  onJoinAccess: (context: AccessContext) => void;
  onCloseAccess: () => void;
  onUserUpdated: (user: PanelUser) => void;
  onLinkGoogle: () => Promise<PanelUser | null>;
  onSignOut: () => void;
  /** Activity center button, shown next to the avatar. */
  headerActions?: ReactNode;
  /** Extra entries for the profile menu (for example "Mi colección"). */
  profileMenu?: ReactNode;
}) {
  const [creating, setCreating] = useState(openCreate);
  const [draft, setDraft] = useState<FormDraft>(emptyDraft);
  const [created, setCreated] = useState<CreatedState | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [joining, setJoining] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [searchDockOpen, setSearchDockOpen] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const joinDialogRef = useRef<HTMLDialogElement>(null);
  const joinInputRef = useRef<HTMLInputElement>(null);
  const joinButtonRef = useRef<HTMLButtonElement>(null);
  const { preferences, savePreferences } = usePersonal();
  const arranged = useMemo(() => arrangeProjects(projects, preferences, query), [preferences, projects, query]);
  const totalPages = Math.max(1, Math.ceil(arranged.length / PAGE_SIZE));

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.safeSurface = "projects";
    return () => { delete root.dataset.safeSurface; };
  }, []);

  useEffect(() => { if (openCreate) setCreating(true); }, [openCreate]);
  useEffect(() => {
    const dialog = createDialogRef.current;
    if (creating && dialog && !dialog.open) {
      dialog.showModal();
      dialog.focus({ preventScroll: true });
      if (openCreate) onCreateIntentConsumed();
    }
  }, [creating, onCreateIntentConsumed, openCreate]);
  useEffect(() => {
    const dialog = joinDialogRef.current;
    if (!joining || !dialog || dialog.open) return;
    dialog.showModal();
    const frame = window.requestAnimationFrame(() => joinInputRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [joining]);
  useEffect(() => setPage((current) => Math.min(current, totalPages - 1)), [totalPages]);
  // A new search, filter or order always starts again from the first page.
  useEffect(() => setPage(0), [query, preferences.filter, preferences.sort]);

  const slots = useMemo<ProjectSlot[]>(() => {
    const visibleProjects = arranged.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    return Array.from({ length: PAGE_SIZE }, (_, index) => visibleProjects[index]
      ? { type: "project", project: visibleProjects[index] }
      : { type: "empty", slot: page * PAGE_SIZE + index }) as ProjectSlot[];
  }, [arranged, page]);

  async function toggleFavorite(project: Project) {
    const isFavorite = preferences.favorites.includes(project.id);
    const favorites = isFavorite ? preferences.favorites.filter((id) => id !== project.id) : [...preferences.favorites, project.id];
    setFavoriteError("");
    try { await savePreferences({ favorites }); }
    catch { setFavoriteError("No se pudo guardar el favorito. Revisa tu conexión."); }
  }

  function changeSort(sort: ProjectSort) {
    void savePreferences(sort === "custom" && !preferences.order.length ? { sort, order: personalOrder(projects, []) } : { sort }).catch(() => undefined);
  }

  function addProject() {
    setSearchDockOpen(false);
    setCreating(true);
    setFormError("");
    window.setTimeout(() => document.getElementById("new-project-title")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }

  async function generateLink(project: Project) {
    setCreated((current) => current && { ...current, generating: true, linkError: "" });
    try {
      const link = await onCreateLink(project);
      setCreated((current) => current && { ...current, link, generating: false });
    } catch {
      setCreated((current) => current && { ...current, generating: false, linkError: "El proyecto se creó, pero no pudimos generar el enlace. Vuelve a intentarlo; no se creará otro proyecto." });
    }
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || created) return;
    setSaving(true);
    setFormError("");
    let schedule;
    try { schedule = scheduleFromDraft(draft.schedule); }
    catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Revisa el plazo de entrega.");
      setSaving(false);
      return;
    }
    let project: Project;
    try {
      project = await onCreate({ name: draft.name, description: draft.description, repositoryUrl: draft.repositoryUrl, schedule });
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "No se pudo crear el proyecto.");
      setSaving(false);
      return;
    }
    setSaving(false);
    if (!draft.shareLink) {
      closeCreate();
      onSelect(project);
      return;
    }
    setCreated({ project, link: null, linkError: "", generating: true });
    await generateLink(project);
  }

  function closeCreate() {
    if (createDialogRef.current?.open) createDialogRef.current.close();
    setCreating(false);
    setCreated(null);
    setDraft(emptyDraft());
    setFormError("");
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const context = readAccessContext(inviteLink.trim());
    if (!context) {
      setInviteError("Ese enlace no es un enlace de acceso de Cowork. Pega el enlace completo que te compartieron.");
      return;
    }
    if (context.kind === "legacy") {
      setInviteError(LEGACY_INVITE_MESSAGE);
      return;
    }
    setInviteError("");
    setInviteLink("");
    setJoining(false);
    onJoinAccess(context);
  }

  function closeJoin() {
    joinDialogRef.current?.close();
  }

  function finishJoin() {
    setJoining(false);
    setInviteError("");
    joinButtonRef.current?.focus({ preventScroll: true });
  }

  return (
    <main className="projectPicker" aria-labelledby="project-picker-title">
      <header className="projectPickerHeader">
        <a className="projectPickerBrand" href="#projects" aria-label="Cowork, proyectos">
          <CoworkMark className="projectPickerMark" />
          <span><strong>COWORK</strong><small>ESPACIO DE EQUIPO</small></span>
        </a>
        <div className="projectPickerHeaderActions">
          <span className="projectPrivacy"><i aria-hidden="true" /> Espacio privado</span>
          {user && <HeaderDock user={user} activity={headerActions} profileMenu={profileMenu} onLinkGoogle={onLinkGoogle} onSignOut={onSignOut} />}
        </div>
      </header>

      <section className="projectPickerContent">
        <section className="projectShowcase" aria-label="Selector de proyectos">
          <div className="projectShowcaseCopy">
            <p className="eyebrow">ELIGE TU ESPACIO</p>
            <h1 id="project-picker-title"><ScrambledText>¿En qué proyecto vas a trabajar?</ScrambledText></h1>
            <p>Abre un proyecto para revisar su plan, actividad y notas de equipo.</p>
            {!loading && !error && projects.length === 0 && <p className="projectCatalogNotice">Todavía no tienes proyectos. Crea uno o abre el enlace de acceso que te compartió el equipo.</p>}
            {error && <div className="projectCatalogError"><p className="projectCatalogNotice" role="alert">{error}</p><button className="projectCatalogRetry" type="button" onClick={onRetry}>Volver a intentar</button></div>}
            <OwnAccessRequests user={user} projects={projects} onOpenProject={onSelect} onRetry={onJoinAccess} />
            <ProjectSearchDock
              open={searchDockOpen}
              onOpenChange={setSearchDockOpen}
              query={query}
              onQueryChange={setQuery}
              projects={arranged}
              totalCount={projects.length}
              preferences={preferences}
              onFilterChange={(filter) => void savePreferences({ filter }).catch(() => undefined)}
              onSortChange={changeSort}
              onEditOrder={() => setOrdering(true)}
              onSelect={onSelect}
              actions={<>
                <SpecularButton className="projectAddButton" size="sm" onClick={addProject}>
                  Agregar Proyecto
                </SpecularButton>
                <SpecularButton
                  className="projectJoinButton"
                  size="sm"
                  onClick={() => { setSearchDockOpen(false); setJoining(true); setInviteError(""); }}
                  buttonRef={(node) => { joinButtonRef.current = node; }}
                  aria-label="Unirme a un proyecto"
                  aria-expanded={joining}
                  aria-controls="project-invite-dialog"
                  aria-haspopup="dialog"
                  title="Unirme a un proyecto"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </SpecularButton>
              </>}
            />
            {favoriteError && <p className="projectFormError" role="alert">{favoriteError}</p>}
            {projects.length > 0 && !arranged.length && !searchDockOpen && <div className="projectNoResults" role="status">
              <strong>{preferences.filter === "favorites" && !query.trim() ? "Todavía no tienes favoritos." : "Ningún proyecto coincide."}</strong>
              <span>{preferences.filter === "favorites" ? "Marca un proyecto con ☆ o vuelve a mostrar todos." : "Prueba con otra palabra del nombre o de la descripción."}</span>
              <button className="plain" type="button" onClick={() => { setQuery(""); void savePreferences({ filter: "all" }).catch(() => undefined); }}>Mostrar todos los proyectos</button>
            </div>}
          </div>

          {/* Always shown: with no matches (e.g. no favourites yet) the stack falls back to empty "Añadir proyecto" cards. */}
          <div className="projectPreviewColumn">
            <div className="projectPreviewStage" aria-label="Vista previa de proyectos">
              <CardSwap
                key={`${page}-${slots.map((slot) => slot.type === "project" ? slot.project.id : `empty-${slot.slot}`).join("-")}`}
                width={500}
                height={400}
                cardDistance={75}
                verticalDistance={70}
                delay={5000}
                pauseOnHover
                skewAmount={6}
                easing="elastic"
              >
                {slots.map((slot) => slot.type === "project" ? (() => {
                  const project = slot.project;
                  const previewUrl = normalizePreviewUrl(project.previewUrl);
                  return (
                    <Card key={project.id} customClass="projectBrowserCard">
                      <header className="projectBrowserBar">
                        <span className="projectBrowserDots" aria-hidden="true"><i /><i /><i /></span>
                        <button className="projectBrowserTab" type="button" onClick={() => onSelect(project)} aria-label={`Abrir el proyecto ${project.name}`}>
                          <SiteFavicon previewUrl={previewUrl} iconUrl={project.iconUrl} name={project.name} />
                          <span>{project.name}</span>
                        </button>
                        <button type="button" className={`projectFavorite${preferences.favorites.includes(project.id) ? " isFavorite" : ""}`} aria-pressed={preferences.favorites.includes(project.id)} aria-label={`${preferences.favorites.includes(project.id) ? "Quitar de favoritos" : "Marcar como favorito"}: ${project.name}`} onClick={() => void toggleFavorite(project)}>{preferences.favorites.includes(project.id) ? "★" : "☆"}</button>
                        {previewUrl && <a className="projectBrowserOpen" href={previewUrl} target="_blank" rel="noreferrer" aria-label={`Abrir la web de ${project.name} en una pestaña nueva`}>Abrir ↗</a>}
                      </header>
                      <div className="projectBrowserViewport">
                        {previewUrl ? <>
                          <PreviewPlaceholder />
                          <iframe
                            src={previewUrl}
                            title={`Vista previa de ${project.name}`}
                            loading="lazy"
                            sandbox="allow-scripts allow-same-origin allow-forms"
                            tabIndex={-1}
                            aria-hidden="true"
                            onLoad={(event) => event.currentTarget.parentElement?.setAttribute("data-loaded", "")}
                          />
                          <button className="projectPreviewSelect" type="button" onClick={() => onSelect(project)} aria-label={`Seleccionar el proyecto ${project.name}`} />
                        </> : (
                          <button className="projectNoPreview" type="button" onClick={() => onSelect(project)}>
                            <span className="projectPreviewGlyph" aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span>
                            <strong>{project.name}</strong>
                            <span>Configura la URL de vista previa en los ajustes del proyecto.</span>
                          </button>
                        )}
                      </div>
                    </Card>
                  );
                })() : (
                  <Card key={`empty-${slot.slot}`} customClass="projectBrowserCard projectBrowserCardEmpty">
                    <header className="projectBrowserBar">
                      <span className="projectBrowserDots" aria-hidden="true"><i /><i /><i /></span>
                      <span className="projectBrowserEmptyTab">＋ Añadir proyecto</span>
                    </header>
                    <div className="projectBrowserViewport">
                      <button className="projectEmptyAction" type="button" onClick={addProject} aria-label="Añadir un proyecto">
                        <span className="projectEmptyPlus" aria-hidden="true">＋</span>
                        <strong>Añade otro proyecto</strong>
                        <span>Tu siguiente espacio de trabajo empieza aquí.</span>
                      </button>
                    </div>
                  </Card>
                ))}
              </CardSwap>
            </div>
            {totalPages > 1 && <nav className="projectPager" aria-label="Páginas de proyectos">
              <button className="projectPagerButton" type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} aria-label="Proyectos anteriores">←</button>
              <span aria-live="polite">{page + 1} <i>/</i> {totalPages}</span>
              <button className="projectPagerButton" type="button" onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} disabled={page >= totalPages - 1} aria-label="Más proyectos">→</button>
            </nav>}
          </div>
        </section>

        {creating && <dialog ref={createDialogRef} className="projectCreateCard projectCreateDialog" aria-labelledby="new-project-title" autoFocus tabIndex={-1} onClose={closeCreate} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
          {created ? <>
            <div className="projectCreateHeading"><div><p className="eyebrow">PROYECTO CREADO</p><h2 id="new-project-title">{created.project.name} está listo</h2></div><button className="plain" type="button" onClick={() => createDialogRef.current?.close()}>Cerrar</button></div>
            <p className="projectCreateHint">Comparte este enlace o el QR con tu equipo. Abrirlo solo permite pedir acceso: tú apruebas o rechazas cada solicitud desde Configuración.</p>
            <div className="projectCreatedBody" aria-live="polite">
              {created.link
                ? <AccessLinkShare url={accessLinkUrl(created.project.id, created.link.id)} projectName={created.project.name} expiresAt={created.link.expiresAt} />
                : created.generating
                  ? <p className="projectCreateHint" role="status">Generando el enlace de acceso…</p>
                  : <div className="projectCreatedRetry"><p className="projectFormError" role="alert">{created.linkError}</p><button type="button" onClick={() => void generateLink(created.project)}>Reintentar</button></div>}
            </div>
            <SpecularButton className="projectAddButton projectCreateSubmitButton" size="sm" type="button" onClick={() => { const project = created.project; closeCreate(); onSelect(project); }}>Abrir proyecto</SpecularButton>
          </> : <>
            <div className="projectCreateHeading"><div><p className="eyebrow">NUEVO ESPACIO</p><h2 id="new-project-title">Añadir un proyecto</h2></div><SpecularButton className="projectAddButton projectCreateCancelButton" size="sm" type="button" onClick={() => createDialogRef.current?.close()}>Cancelar</SpecularButton></div>
            <form className="projectCreateForm" onSubmit={submitProject}>
              <label className="controlField"><span>Nombre</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nombre del proyecto" maxLength={80} required /></label>
              <label className="controlField"><span>Descripción</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="¿Qué está construyendo el equipo?" maxLength={400} rows={3} /></label>
              <label className="controlField"><span>Repositorio de GitHub <small>Opcional</small></span><input type="url" value={draft.repositoryUrl} onChange={(event) => setDraft({ ...draft, repositoryUrl: event.target.value })} placeholder="https://github.com/equipo/proyecto" /></label>
              <fieldset className="formSection">
                <legend className="formSectionLegend">Equipo</legend>
                <label className="toggleRow">
                  <input type="checkbox" checked={draft.shareLink} onChange={(event) => setDraft({ ...draft, shareLink: event.target.checked })} />
                  <span><strong>Generar enlace para solicitar acceso</strong><small>Obtendrás un enlace y un QR válidos {ACCESS_LINK_LIFETIME_DAYS} días. Tendrás que aprobar cada solicitud antes de que alguien entre al proyecto.</small></span>
                </label>
              </fieldset>
              <ScheduleField value={draft.schedule} onChange={(schedule) => setDraft((current) => ({ ...current, schedule }))} />
              {formError && <p className="projectFormError" role="alert">{formError}</p>}
              <SpecularButton className="projectAddButton projectCreateSubmitButton" size="sm" type="submit" disabled={saving}>{saving ? "Creando…" : "Crear proyecto"}</SpecularButton>
            </form>
          </>}
        </dialog>}
        {joining && <dialog ref={joinDialogRef} className="projectJoinDialog" id="project-invite-dialog" aria-labelledby="project-invite-title" aria-describedby="project-invite-description" onClose={finishJoin} onClick={(event) => { if (event.target === event.currentTarget) closeJoin(); }}>
          <div className="projectJoinHeader">
            <span className="projectJoinMark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg></span>
            <div className="projectJoinTitle"><span>ACCESO AL EQUIPO</span><h2 id="project-invite-title">Unirme a un proyecto</h2></div>
            <button className="projectJoinClose" type="button" onClick={closeJoin} aria-label="Cerrar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
          </div>
          <p className="projectJoinIntro" id="project-invite-description">Pega el enlace que te compartieron o escanea el QR del propietario.</p>
          <form className="projectJoinForm" id="project-invite-form" onSubmit={submitInvite}>
            <label className="controlField" htmlFor="project-invite-link"><span>Enlace de acceso</span><input ref={joinInputRef} id="project-invite-link" type="text" inputMode="url" autoComplete="url" value={inviteLink} onChange={(event) => { setInviteLink(event.target.value); setInviteError(""); }} placeholder="https://…" required /></label>
            {inviteError && <p className="projectFormError" role="alert">{inviteError}</p>}
            <div className="projectJoinFooter"><p>El propietario debe aprobar tu solicitud antes de darte acceso.</p><button className="projectJoinSubmit" type="submit">Continuar <span aria-hidden="true">↗</span></button></div>
          </form>
        </dialog>}
        {ordering && <ProjectOrderEditor projects={projects} order={preferences.order} favorites={preferences.favorites} onChange={(order) => void savePreferences({ order, sort: "custom" }).catch(() => undefined)} onClose={() => setOrdering(false)} />}
        {accessContext && <AccessRequestDialog context={accessContext} user={user} projects={projects} onClose={onCloseAccess} onOpenProject={onSelect} onUserUpdated={onUserUpdated} />}
      </section>
      <footer className="projectPickerFooter">
        <p>COWORK <span>·</span> ESPACIOS DE TRABAJO DEL EQUIPO</p>
        <a className="projectPickerVersion" href="/novedades">VERSIÓN {__APP_VERSION__} <span>·</span> NOVEDADES</a>
      </footer>
    </main>
  );
}
