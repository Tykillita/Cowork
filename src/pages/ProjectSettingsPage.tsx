import { useEffect, useState, type FormEvent } from "react";
import { PageHeading } from "../components/PageHeading";
import { accessLinkUrl } from "../features/auth/accessContext";
import { AccessLinkShare } from "../features/access/AccessLinkShare";
import { ACCESS_LINK_LIFETIME_DAYS, isLinkUsable } from "../features/projects/accessLinkPolicy";
import { normalizeChangelogUrl, normalizePreviewUrl } from "../features/projects/projectUrls";
import { ScheduleField, scheduleDraftFrom, scheduleFromDraft, type ScheduleDraft } from "../features/schedule/ScheduleField";
import { formatDeadline, formatRange, timeZoneLabel } from "../features/schedule/scheduleTime";
import type { GitHubBranchWrite, PanelUser, Project, ProjectAccessLink, ProjectAccessRequest, ProjectMember, ProjectSchedule } from "../types";
import type { HistoryPage } from "../features/projects/projectAccess";
import { AccessHistoryList } from "../features/access/AccessHistoryList";
import { TeamMigrationPanel } from "../features/team/TeamMigrationPanel";
import { Sk, SkImg } from "../components/Skeleton";
import { AccessLinkSkeleton, MemberRowsSkeleton } from "../components/PageSkeletons";
import { branchWritePolicy } from "../features/github/branchPermissions";
import { useGitHubSession } from "../features/github/githubSession";
import { normalizeRepositoryUrl, repositoryLabel } from "../features/repository/githubRepository";
import { useHashParams } from "../lib/useHashRoute";
import { buildHash } from "../lib/hashRoute";

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

type Unsubscribe = () => void;
type Watch<T> = (projectId: string, onValue: (value: T[]) => void, onError: (error: Error) => void) => Promise<Unsubscribe>;

type ProjectActions = {
  watchMembers: Watch<ProjectMember>;
  watchLinks: Watch<ProjectAccessLink>;
  watchRequests: Watch<ProjectAccessRequest>;
  createLink: (project: Pick<Project, "id" | "name">) => Promise<ProjectAccessLink>;
  revokeLink: (projectId: string, linkId: string) => Promise<void>;
  approveRequest: (projectId: string, request: ProjectAccessRequest) => Promise<void>;
  rejectRequest: (projectId: string, request: ProjectAccessRequest) => Promise<void>;
  setRetryAllowed: (projectId: string, request: ProjectAccessRequest, allowed: boolean) => Promise<void>;
  loadHistory: (projectId: string, pageSize: number, cursor: unknown) => Promise<HistoryPage>;
  removeMember: (projectId: string, uid: string, ownerUid: string) => Promise<void>;
  transferOwnership: (projectId: string, targetUid: string) => Promise<void>;
};

/** Subscribes to an owner-only collection while the page is open. */
function useOwnerCollection<T>(enabled: boolean, projectId: string, watch: Watch<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  useEffect(() => {
    setItems([]);
    if (!enabled) { setLoading(false); return; }
    let active = true;
    let stop: Unsubscribe | undefined;
    setLoading(true);
    setError("");
    watch(projectId, (next) => { if (active) { setItems(next); setLoading(false); } }, (reason) => {
      if (active) { setError(reason.message || "No se pudo cargar la información."); setLoading(false); }
    }).then((unsubscribe) => {
      if (active) stop = unsubscribe;
      else unsubscribe();
    }).catch((reason: Error) => { if (active) { setError(reason.message); setLoading(false); } });
    return () => { active = false; stop?.(); };
  }, [enabled, projectId, watch]);
  return { items, setItems, loading, error };
}

function sameSchedule(draft: ScheduleDraft, schedule: ProjectSchedule | undefined) {
  if (!schedule) return !draft.enabled;
  return draft.enabled && draft.startDate === schedule.startDate && (draft.endDate || draft.startDate) === schedule.endDate && draft.timeZone === schedule.timeZone;
}

const BRANCH_WRITE_OPTIONS: { value: GitHubBranchWrite; title: string; hint: string }[] = [
  { value: "owner", title: "Solo el propietario", hint: "Los miembros ven las ramas, pero no las crean ni las borran desde Cowork." },
  { value: "members", title: "Todos los miembros", hint: "Cualquier miembro con permiso de escritura en el repositorio de GitHub." },
];

export function ProjectSettingsPage({ project, user, isOwner, actions, onSavePreview, onSaveSchedule, onSaveGitHubPolicy, onSaveRepository, onSaveChangelogUrl }: {
  project: Project;
  user: PanelUser;
  isOwner: boolean;
  actions: ProjectActions;
  onSavePreview: (previewUrl: string, iconUrl: string) => Promise<void>;
  onSaveSchedule: (schedule: ProjectSchedule | null) => Promise<void>;
  onSaveGitHubPolicy: (branchWrite: GitHubBranchWrite) => Promise<void>;
  onSaveRepository: (repositoryUrl: string) => Promise<void>;
  onSaveChangelogUrl: (changelogUrl: string) => Promise<void>;
}) {
  const github = useGitHubSession(user);
  const savedBranchWrite = branchWritePolicy(project);
  // Shown right away while the change is being saved.
  const [pendingBranchWrite, setPendingBranchWrite] = useState<GitHubBranchWrite | null>(null);
  const branchWrite = pendingBranchWrite ?? savedBranchWrite;
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyMessage, setPolicyMessage] = useState("");
  const [policyError, setPolicyError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(project.previewUrl);
  const [iconUrl, setIconUrl] = useState(project.iconUrl ?? "");
  const [iconBroken, setIconBroken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>(() => scheduleDraftFrom(project.schedule));
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [busyItem, setBusyItem] = useState("");
  const [accessMessage, setAccessMessage] = useState("");
  const [accessError, setAccessError] = useState("");
  const [memberMessage, setMemberMessage] = useState("");
  const [memberError, setMemberError] = useState("");
  const [ownershipMessage, setOwnershipMessage] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState(project.repositoryUrl);
  const [repositoryBusy, setRepositoryBusy] = useState(false);
  const [repositoryMessage, setRepositoryMessage] = useState("");
  const [repositoryError, setRepositoryError] = useState("");
  const [changelogUrl, setChangelogUrl] = useState(project.changelogUrl ?? "");
  const [changelogBusy, setChangelogBusy] = useState(false);
  const [changelogMessage, setChangelogMessage] = useState("");
  const [changelogError, setChangelogError] = useState("");
  const { params } = useHashParams();
  const activeSection = params.get("section") ?? "";
  const members = useOwnerCollection(isOwner, project.id, actions.watchMembers);
  const links = useOwnerCollection(isOwner, project.id, actions.watchLinks);
  const requests = useOwnerCollection(isOwner, project.id, actions.watchRequests);

  useEffect(() => {
    setPreviewUrl(project.previewUrl);
    setIconUrl(project.iconUrl ?? "");
    setMessage("");
    setError("");
  }, [project.id, project.previewUrl, project.iconUrl]);

  useEffect(() => {
    setRepositoryUrl(project.repositoryUrl);
    setRepositoryError("");
  }, [project.id, project.repositoryUrl]);

  useEffect(() => {
    setChangelogUrl(project.changelogUrl ?? "");
    setChangelogError("");
  }, [project.id, project.changelogUrl]);

  // "#settings-page?section=github" opens the page at that section.
  useEffect(() => {
    if (!activeSection) return;
    document.getElementById(`settings-${activeSection}`)?.scrollIntoView({ block: "start" });
  }, [activeSection]);

  // Reflect schedule changes made elsewhere in real time.
  const scheduleKey = project.schedule ? `${project.schedule.startDate}|${project.schedule.endDate}|${project.schedule.timeZone}` : "none";
  useEffect(() => {
    setScheduleDraft(scheduleDraftFrom(project.schedule));
    setScheduleError("");
  }, [project.id, scheduleKey]);

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const normalized = normalizePreviewUrl(previewUrl);
    if (previewUrl.trim() && !normalized) { setError("Introduce una dirección HTTPS válida, por ejemplo https://equipo.github.io/proyecto."); setMessage(""); return; }
    const icon = normalizePreviewUrl(iconUrl);
    if (iconUrl.trim() && !icon) { setError("La dirección del icono debe empezar con https://, por ejemplo https://sitio.example/favicon.svg."); setMessage(""); return; }
    setSaving(true); setError(""); setMessage("");
    try { await onSavePreview(normalized, icon); setPreviewUrl(normalized); setIconUrl(icon); setMessage("La vista previa y el icono se actualizaron."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la configuración."); }
    finally { setSaving(false); }
  }

  async function submitRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (repositoryBusy) return;
    const normalized = normalizeRepositoryUrl(repositoryUrl);
    if (normalized === null) { setRepositoryError("Usa un enlace de repositorio de GitHub válido, por ejemplo https://github.com/equipo/proyecto."); setRepositoryMessage(""); return; }
    setRepositoryBusy(true); setRepositoryError(""); setRepositoryMessage("");
    try {
      await onSaveRepository(normalized);
      setRepositoryUrl(normalized);
      setRepositoryMessage(normalized ? `El proyecto quedó vinculado a ${repositoryLabel(normalized)}.` : "El proyecto quedó sin repositorio.");
    } catch (reason) { setRepositoryError(reason instanceof Error ? reason.message : "No se pudo guardar el repositorio."); }
    finally { setRepositoryBusy(false); }
  }

  async function submitChangelog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changelogBusy) return;
    const normalized = normalizeChangelogUrl(changelogUrl);
    if (changelogUrl.trim() && !normalized) {
      setChangelogError("Usa una dirección HTTPS pública válida. No se admiten direcciones locales.");
      setChangelogMessage("");
      return;
    }
    setChangelogBusy(true); setChangelogError(""); setChangelogMessage("");
    try {
      await onSaveChangelogUrl(normalized ?? "");
      setChangelogUrl(normalized ?? "");
      setChangelogMessage(normalized ? "La página de novedades quedó vinculada al proyecto." : "Se quitó la página de novedades.");
    } catch (reason) { setChangelogError(reason instanceof Error ? reason.message : "No se pudo guardar la página de novedades."); }
    finally { setChangelogBusy(false); }
  }

  async function saveSchedule(next: ProjectSchedule | null, success: string) {
    setScheduleBusy(true); setScheduleError(""); setScheduleMessage("");
    try { await onSaveSchedule(next); setScheduleMessage(success); }
    catch (reason) { setScheduleError(reason instanceof Error ? reason.message : "No se pudo guardar el plazo."); }
    finally { setScheduleBusy(false); }
  }

  async function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (scheduleBusy) return;
    let next: ProjectSchedule | null;
    try { next = scheduleFromDraft(scheduleDraft); }
    catch (reason) { setScheduleError(reason instanceof Error ? reason.message : "Revisa el plazo."); return; }
    await saveSchedule(next, next ? "El plazo de entrega se actualizó para todo el equipo." : "El proyecto quedó sin fecha de entrega.");
  }

  async function savePolicy(next: GitHubBranchWrite) {
    if (policyBusy || next === branchWrite) return;
    setPolicyBusy(true); setPolicyError(""); setPolicyMessage(""); setPendingBranchWrite(next);
    try { await onSaveGitHubPolicy(next); setPolicyMessage(next === "members" ? "Ahora los miembros con permiso en GitHub pueden crear y borrar ramas." : "Ahora solo tú puedes crear y borrar ramas desde Cowork."); }
    catch (reason) { setPolicyError(reason instanceof Error ? reason.message : "No se pudo guardar el permiso."); }
    finally { setPolicyBusy(false); setPendingBranchWrite(null); }
  }

  async function generateLink() {
    setBusyItem("new-link"); setAccessError(""); setAccessMessage("");
    try { await actions.createLink(project); setAccessMessage(`Enlace nuevo generado. Vence en ${ACCESS_LINK_LIFETIME_DAYS} días.`); }
    catch (reason) { setAccessError(reason instanceof Error ? reason.message : "No se pudo generar el enlace."); }
    finally { setBusyItem(""); }
  }

  async function revokeLink(link: ProjectAccessLink) {
    if (!window.confirm("¿Revocar este enlace? Nadie podrá usarlo para pedir acceso; las solicitudes pendientes se conservan.")) return;
    setBusyItem(link.id); setAccessError(""); setAccessMessage("");
    try { await actions.revokeLink(project.id, link.id); setAccessMessage("El enlace se revocó."); }
    catch (reason) { setAccessError(reason instanceof Error ? reason.message : "No se pudo revocar el enlace."); }
    finally { setBusyItem(""); }
  }

  async function decide(request: ProjectAccessRequest, approve: boolean) {
    setBusyItem(request.uid); setAccessError(""); setAccessMessage("");
    try {
      if (approve) await actions.approveRequest(project.id, request);
      else await actions.rejectRequest(project.id, request);
      setAccessMessage(approve ? `${request.name} ya forma parte de ${project.name}.` : `Rechazaste la solicitud de ${request.name}.`);
    } catch (reason) { setAccessError(reason instanceof Error ? reason.message : "No se pudo actualizar la solicitud."); }
    finally { setBusyItem(""); }
  }

  async function toggleRetry(request: ProjectAccessRequest) {
    const allow = !request.retryAllowed;
    setBusyItem(request.uid); setAccessError(""); setAccessMessage("");
    try {
      await actions.setRetryAllowed(project.id, request, allow);
      setAccessMessage(allow
        ? `${request.name} podrá enviar una nueva solicitud con un enlace vigente. Volverá a quedar pendiente.`
        : `Retiraste la autorización de ${request.name} para volver a solicitar.`);
    } catch (reason) { setAccessError(reason instanceof Error ? reason.message : "No se pudo actualizar la solicitud."); }
    finally { setBusyItem(""); }
  }

  async function remove(member: ProjectMember) {
    if (!window.confirm(`¿Quitar a ${member.name} de ${project.name}?`)) return;
    setBusyItem(member.uid); setMemberError(""); setMemberMessage("");
    try {
      await actions.removeMember(project.id, member.uid, project.ownerUid);
      members.setItems((current) => current.filter((item) => item.uid !== member.uid));
      setMemberMessage(`${member.name} ya no tiene acceso a este proyecto.`);
    } catch (reason) { setMemberError(reason instanceof Error ? reason.message : "No se pudo quitar al miembro."); }
    finally { setBusyItem(""); }
  }

  async function transfer(member: ProjectMember) {
    const confirmed = window.confirm(`¿Transferir la propiedad de ${project.name} a ${member.name}? Pasarás a ser miembro y ${member.name} podrá administrar el equipo.`);
    if (!confirmed) return;
    setBusyItem(member.uid); setMemberError(""); setOwnershipMessage("");
    try {
      await actions.transferOwnership(project.id, member.uid);
      setOwnershipMessage(`La propiedad de ${project.name} se transfirió a ${member.name}. Ahora tienes acceso como miembro.`);
    } catch (reason) { setMemberError(reason instanceof Error ? reason.message : "No se pudo transferir la propiedad."); }
    finally { setBusyItem(""); }
  }

  const activeLinks = links.items.filter((link) => isLinkUsable(link));
  const inactiveLinks = links.items.length - activeLinks.length;
  const pendingRequests = requests.items.filter((request) => request.status === "pending");
  const rejectedRequests = requests.items.filter((request) => request.status === "rejected");
  const historyKey = requests.items.map((request) => `${request.uid}:${request.status}:${request.attempt}:${request.grantVersion}`).join("|");
  const scheduleDirty = !sameSchedule(scheduleDraft, project.schedule);
  const repositoryDirty = (normalizeRepositoryUrl(repositoryUrl) ?? repositoryUrl.trim()) !== project.repositoryUrl;
  const sections = [
    { id: "github", label: "GitHub", badge: "" },
    { id: "schedule", label: "Plazo", badge: "" },
    { id: "preview", label: "Vista previa", badge: "" },
    { id: "changelog", label: "Novedades", badge: "" },
    ...(isOwner ? [
      { id: "members", label: "Miembros", badge: "" },
      { id: "access", label: "Acceso", badge: !requests.loading && pendingRequests.length ? String(pendingRequests.length) : "" },
    ] : []),
  ];

  return (
    <section className="page-view" id="project-settings" data-page="settings-page">
      <PageHeading eyebrow="CONFIGURACIÓN DEL PROYECTO" title={project.name} description="Configura GitHub, las novedades, el plazo de entrega, la vista previa y quién puede acceder a este espacio." />
      <div className="settingsLayout">
        <nav className="settingsSections" aria-label="Secciones de la configuración">
          {sections.map((section) => <a key={section.id} href={buildHash("settings-page", { section: section.id })} aria-current={activeSection === section.id ? "true" : undefined}>{section.label}{section.badge ? <span className="settingsSectionBadge">{section.badge}</span> : null}</a>)}
        </nav>
        <div className="settingsPanels">
          <section className="panel projectSettingsPanel" id="settings-github" aria-labelledby="github-title">
            <div className="panelHead"><div><p className="eyebrow">GITHUB</p><h2 id="github-title">Repositorio y ramas</h2></div><span className="clockLabel">{isOwner ? "Solo el propietario edita" : "Administrado por el propietario"}</span></div>
            <p className="panelIntro">Vincula el repositorio del proyecto y decide quién puede crear y borrar ramas de GitHub desde Cowork. GitHub sigue exigiendo que cada persona tenga permiso de escritura en el repositorio, y la rama principal y las protegidas nunca se borran desde aquí.</p>
            {isOwner && <form className="projectSettingsForm projectRepositoryForm" onSubmit={submitRepository}>
              <label className="controlField" htmlFor="project-repository-url"><span>Repositorio de GitHub</span><input id="project-repository-url" name="repositoryUrl" type="url" inputMode="url" value={repositoryUrl} onChange={(event) => { setRepositoryUrl(event.target.value); setRepositoryError(""); setRepositoryMessage(""); }} placeholder="https://github.com/equipo/proyecto" /></label>
              <p className="projectSettingsHint">{repositoryDirty && project.repositoryUrl
                ? "Las ramas registradas se conservan; su estado en GitHub se recalcula con el nuevo repositorio."
                : "Déjalo vacío si el proyecto no usa GitHub."}</p>
              {repositoryError && <p className="projectSettingsError" role="alert">{repositoryError}</p>}{repositoryMessage && <p className="projectSettingsSuccess" role="status">{repositoryMessage}</p>}
              <div className="projectSettingsActions"><button type="submit" disabled={repositoryBusy || !repositoryDirty}>{repositoryBusy ? "Guardando…" : "Guardar repositorio"}</button></div>
            </form>}
            <dl className="projectGitHubFacts">
              <div><dt>Repositorio</dt><dd>{project.repositoryUrl ? <a href={project.repositoryUrl} target="_blank" rel="noreferrer">{repositoryLabel(project.repositoryUrl) || project.repositoryUrl} ↗</a> : "Sin repositorio"}</dd></div>
              <div><dt>Tu cuenta de GitHub</dt><dd>{github.status === "checking" ? <Sk inline w="10ch" /> : github.status === "ready" ? (github.login ? `@${github.login}` : "Conectada") : github.linked ? "Vinculada, sin conexión en esta pestaña" : "Sin vincular"}</dd></div>
            </dl>
            {isOwner ? <div className="projectSettingsForm">
              <fieldset className="formSection">
                <legend className="formSectionLegend">Quién puede crear y borrar ramas</legend>
                <div className="scheduleModes" role="radiogroup" aria-label="Quién puede crear y borrar ramas">
                  {BRANCH_WRITE_OPTIONS.map((option) => <label key={option.value} className={`scheduleMode${branchWrite === option.value ? " isActive" : ""}`}>
                    <input type="radio" name="github-branch-write" checked={branchWrite === option.value} disabled={policyBusy} onChange={() => void savePolicy(option.value)} />
                    <span><strong>{option.title}</strong><small>{option.hint}</small></span>
                  </label>)}
                </div>
              </fieldset>
              {policyError && <p className="projectSettingsError" role="alert">{policyError}</p>}{policyMessage && <p className="projectSettingsSuccess" role="status">{policyMessage}</p>}
            </div> : <div className="projectPreviewReadonly"><p>{branchWrite === "members" ? "Los miembros con permiso de escritura en GitHub pueden crear y borrar ramas desde Cowork." : "Solo el propietario crea y borra ramas de GitHub desde Cowork."}</p></div>}
          </section>

          <section className="panel projectSettingsPanel" id="settings-schedule" aria-labelledby="schedule-title">
            <div className="panelHead"><div><p className="eyebrow">CALENDARIO</p><h2 id="schedule-title">Plazo de entrega</h2></div><span className="clockLabel">{isOwner ? "Solo el propietario edita" : "Administrado por el propietario"}</span></div>
            <p className="panelIntro">Con un plazo, el resumen muestra la cuenta regresiva hasta el final del último día. Sin plazo, muestra una escena ambiental.</p>
            {isOwner ? <form className="projectSettingsForm" onSubmit={submitSchedule}>
              <ScheduleField value={scheduleDraft} onChange={(next) => { setScheduleDraft(next); setScheduleMessage(""); setScheduleError(""); }} disabled={scheduleBusy} />
              {scheduleError && <p className="projectSettingsError" role="alert">{scheduleError}</p>}{scheduleMessage && <p className="projectSettingsSuccess" role="status">{scheduleMessage}</p>}
              <div className="projectSettingsActions">
                <button type="submit" disabled={scheduleBusy || !scheduleDirty}>{scheduleBusy ? "Guardando…" : "Guardar plazo"}</button>
                {project.schedule && <button className="ghost" type="button" disabled={scheduleBusy} onClick={() => void saveSchedule(null, "El proyecto quedó sin fecha de entrega.")}>Quitar plazo</button>}
              </div>
            </form> : <div className="projectPreviewReadonly">{project.schedule
              ? <p>Del <strong>{formatRange(project.schedule)}</strong>. Vence {formatDeadline(project.schedule)} · {timeZoneLabel(project.schedule.timeZone)}.</p>
              : <p>Este proyecto no tiene fecha de entrega.</p>}</div>}
          </section>

          <section className="panel projectSettingsPanel" id="settings-preview" aria-labelledby="preview-url-title">
            <div className="panelHead"><div><p className="eyebrow">VISTA PREVIA</p><h2 id="preview-url-title">Página principal</h2></div><span className="clockLabel">{isOwner ? "Solo el propietario edita" : "Administrado por el propietario"}</span></div>
            <p className="panelIntro">La página configurada aparece dentro de la tarjeta de este proyecto en el selector de Cowork.</p>
            {isOwner ? <form className="projectSettingsForm" onSubmit={submitPreview}>
              <label className="controlField" htmlFor="project-preview-url"><span>URL pública del sitio</span><input id="project-preview-url" name="previewUrl" type="url" inputMode="url" autoComplete="url" value={previewUrl} onChange={(event) => { setPreviewUrl(event.target.value); setError(""); setMessage(""); }} placeholder="https://sitio-del-proyecto.example" /></label>
              <p className="projectSettingsHint">Usa HTTPS. El sitio debe permitir mostrarse dentro de Cowork; si no, se abre desde el enlace externo de la tarjeta.</p>
              <div className="projectIconField">
                <label className="controlField" htmlFor="project-icon-url"><span>Icono del proyecto <small>Opcional</small></span><input id="project-icon-url" name="iconUrl" type="url" inputMode="url" value={iconUrl} onChange={(event) => { setIconUrl(event.target.value); setIconBroken(false); setError(""); setMessage(""); }} placeholder="https://sitio-del-proyecto.example/favicon.svg" /></label>
                <span className="projectIconPreview" aria-live="polite">
                  {normalizePreviewUrl(iconUrl) && !iconBroken
                    ? <SkImg src={normalizePreviewUrl(iconUrl)} alt="Vista previa del icono" referrerPolicy="no-referrer" onError={() => setIconBroken(true)} />
                    : <span aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span>}
                </span>
              </div>
              <p className="projectSettingsHint">{iconBroken ? "No se pudo cargar esa imagen. Revisa la dirección; mientras tanto se usará el icono detectado de la web o la inicial." : "Déjalo vacío para usar el icono que Cowork detecta en la web de vista previa. Acepta SVG, PNG o ICO por HTTPS."}</p>
              {error && <p className="projectSettingsError" role="alert">{error}</p>}{message && <p className="projectSettingsSuccess" role="status">{message}</p>}
              <div className="projectSettingsActions"><button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button>{normalizePreviewUrl(previewUrl) && <a className="ghost projectSettingsOpen" href={normalizePreviewUrl(previewUrl)} target="_blank" rel="noreferrer">Abrir sitio ↗</a>}</div>
            </form> : <div className="projectPreviewReadonly">{project.previewUrl ? <a href={project.previewUrl} target="_blank" rel="noreferrer">Abrir página principal ↗</a> : <p>El propietario todavía no configuró una página de vista previa.</p>}</div>}
          </section>

          <section className="panel projectSettingsPanel" id="settings-changelog" aria-labelledby="changelog-source-title">
            <div className="panelHead"><div><p className="eyebrow">TAREAS DEL PROYECTO</p><h2 id="changelog-source-title">Página de novedades</h2></div><span className="clockLabel">{isOwner ? "Solo el propietario edita" : "Administrado por el propietario"}</span></div>
            <p className="panelIntro">Cowork puede proponer tareas a partir de las novedades publicadas. Cada propuesta se revisa en el tablero antes de crear una tarea o cambiar su estado.</p>
            {isOwner ? <form className="projectSettingsForm" onSubmit={submitChangelog}>
              <label className="controlField" htmlFor="project-changelog-url"><span>Enlace de novedades</span><input id="project-changelog-url" name="changelogUrl" type="url" inputMode="url" autoComplete="url" value={changelogUrl} onChange={(event) => { setChangelogUrl(event.target.value); setChangelogError(""); setChangelogMessage(""); }} placeholder="https://sitio.example/novedades o GitHub Releases" /></label>
              <p className="projectSettingsHint">Acepta una página HTTPS con títulos y listas, un CHANGELOG.md o la página de Releases de GitHub. El sitio debe permitir CORS desde cwspace.web.app; Cowork solo lee el texto y no guarda el HTML.</p>
              {changelogError && <p className="projectSettingsError" role="alert">{changelogError}</p>}{changelogMessage && <p className="projectSettingsSuccess" role="status">{changelogMessage}</p>}
              <div className="projectSettingsActions"><button type="submit" disabled={changelogBusy || (normalizeChangelogUrl(changelogUrl) ?? changelogUrl.trim()) === (project.changelogUrl ?? "")}>{changelogBusy ? "Guardando…" : "Guardar novedades"}</button>{project.changelogUrl && <a className="ghost projectSettingsOpen" href={project.changelogUrl} target="_blank" rel="noreferrer">Abrir página ↗</a>}</div>
            </form> : <div className="projectPreviewReadonly">{project.changelogUrl ? <a href={project.changelogUrl} target="_blank" rel="noreferrer">Abrir página de novedades ↗</a> : <p>El propietario todavía no configuró una página de novedades.</p>}</div>}
          </section>

          {ownershipMessage && <p className="projectSettingsSuccess ownershipTransferNotice" role="status">{ownershipMessage}</p>}

          {isOwner && <section className="panel projectMembersPanel" id="settings-members" aria-labelledby="members-title">
            <div className="panelHead"><div><p className="eyebrow">EQUIPO</p><h2 id="members-title">Miembros del equipo</h2></div><span className="clockLabel">{members.loading ? <Sk inline w="9ch" /> : `${members.items.length} ${members.items.length === 1 ? "miembro" : "miembros"}`}</span></div>
            <p className="panelIntro">Solo tú puedes administrar el equipo. Puedes quitar miembros o transferir la propiedad a un miembro activo; tú pasarás a ser miembro.</p>
            {memberError && <p className="projectSettingsError" role="alert">{memberError}</p>}{memberMessage && <p className="projectSettingsSuccess" role="status">{memberMessage}</p>}
            {members.loading ? <MemberRowsSkeleton rows={3} role label="Cargando miembros" /> : members.error ? <p className="projectSettingsError" role="alert">{members.error}</p> : <div className="projectMemberList" aria-live="polite">
              {members.items.map((member) => <article className="projectMemberRow" key={member.uid}><span className="projectMemberAvatar">{member.name.slice(0, 1).toUpperCase()}</span><span className="projectMemberIdentity"><strong>{member.name}{member.uid === user.id ? " (tú)" : ""}</strong><small>{member.email}</small></span><span className={`projectMemberRole${member.role === "owner" ? " isOwner" : ""}`}>{member.role === "owner" ? "Propietario" : "Miembro"}</span>{member.role !== "owner" && <span className="projectMemberActions"><button className="plain projectMemberTransfer" type="button" onClick={() => void transfer(member)} disabled={busyItem === member.uid}>Transferir</button><button className="plain projectMemberRemove" type="button" onClick={() => void remove(member)} disabled={busyItem === member.uid}>Quitar</button></span>}</article>)}
              {!members.items.length && <p className="empty">Todavía no hay miembros registrados para este proyecto.</p>}
            </div>}
          </section>}
          {isOwner && <section className="panel projectMembersPanel" id="settings-access" aria-labelledby="access-title">
            <div className="panelHead"><div><p className="eyebrow">ACCESO AL PROYECTO</p><h2 id="access-title">Enlace y solicitudes</h2></div><span className="clockLabel">{requests.loading ? <Sk inline w="10ch" /> : `${pendingRequests.length} ${pendingRequests.length === 1 ? "pendiente" : "pendientes"}`}</span></div>
            <p className="panelIntro">Quien abre el enlace o escanea el QR solo puede pedir acceso. Nadie entra hasta que apruebas su solicitud. Revocar un enlace impide nuevas solicitudes y conserva las pendientes.</p>
            {accessError && <p className="projectSettingsError" role="alert">{accessError}</p>}{accessMessage && <p className="projectSettingsSuccess" role="status">{accessMessage}</p>}

            <div className="projectMembersSubhead"><h3>Solicitudes pendientes</h3><span>{requests.loading ? <Sk inline w="1ch" /> : pendingRequests.length}</span></div>
            {requests.loading ? <MemberRowsSkeleton rows={1} label="Cargando solicitudes" /> : requests.error ? <p className="projectSettingsError" role="alert">{requests.error}</p> : pendingRequests.length ? <div className="projectMemberList" aria-live="polite">
              {pendingRequests.map((request) => <article className="projectMemberRow accessRequestRow" key={request.uid}>
                <span className="projectMemberAvatar">{request.name.slice(0, 1).toUpperCase()}</span>
                <span className="projectMemberIdentity"><strong>{request.name}</strong><small>{request.email} · {dateLabel(request.createdAt)}</small></span>
                <span className="projectMemberActions">
                  <button type="button" onClick={() => void decide(request, true)} disabled={busyItem === request.uid}>Aprobar</button>
                  <button className="plain projectMemberRemove" type="button" onClick={() => void decide(request, false)} disabled={busyItem === request.uid}>Rechazar</button>
                </span>
              </article>)}
            </div> : <p className="empty">No hay solicitudes pendientes.</p>}
            {rejectedRequests.length > 0 && <>
              <div className="projectMembersSubhead"><h3>Solicitudes rechazadas</h3><span>{rejectedRequests.length}</span></div>
              <div className="projectMemberList">
                {rejectedRequests.map((request) => <article className="projectMemberRow accessRequestRow" key={request.uid}>
                  <span className="projectMemberAvatar">{request.name.slice(0, 1).toUpperCase()}</span>
                  <span className="projectMemberIdentity"><strong>{request.name}</strong><small>{request.email}{request.attempt > 1 ? ` · intento ${request.attempt}` : ""}</small></span>
                  {request.retryAllowed && <span className="accessStatusChip" data-tone="warning">Puede volver a solicitar</span>}
                  <span className="projectMemberActions">
                    <button className="plain" type="button" onClick={() => void toggleRetry(request)} disabled={busyItem === request.uid}>{request.retryAllowed ? "Retirar autorización" : "Permitir otra solicitud"}</button>
                  </span>
                </article>)}
              </div>
              <p className="projectSettingsHint">Permitir otra solicitud no da acceso: la persona podrá enviar un nuevo intento con un enlace vigente y tendrás que aprobarlo.</p>
            </>}
            <AccessHistoryList projectId={project.id} refreshKey={historyKey} loadPage={actions.loadHistory} />

            <div className="projectMembersSubhead"><h3>Enlaces vigentes</h3><span>{links.loading ? <Sk inline w="1ch" /> : activeLinks.length}</span></div>
            {links.loading ? <AccessLinkSkeleton /> : links.error ? <p className="projectSettingsError" role="alert">{links.error}</p> : <div className="accessLinkList">
              {activeLinks.map((link) => <article className="accessLinkItem" key={link.id}>
                <AccessLinkShare url={accessLinkUrl(project.id, link.id)} projectName={project.name} expiresAt={link.expiresAt} compact />
                <button className="plain projectInvitationCancel accessLinkRevoke" type="button" onClick={() => void revokeLink(link)} disabled={busyItem === link.id}>Revocar enlace</button>
              </article>)}
              {!activeLinks.length && <p className="empty">No hay enlaces vigentes{inactiveLinks ? ` (${inactiveLinks} ${inactiveLinks === 1 ? "vencido o revocado" : "vencidos o revocados"})` : ""}.</p>}
              <div className="projectSettingsActions"><button type="button" onClick={() => void generateLink()} disabled={busyItem === "new-link"}>{busyItem === "new-link" ? "Generando…" : activeLinks.length ? "Generar otro enlace" : "Generar enlace"}</button></div>
            </div>}
          </section>}

          {isOwner && <TeamMigrationPanel projectId={project.id} user={user} />}
        </div>
      </div>
    </section>
  );
}
