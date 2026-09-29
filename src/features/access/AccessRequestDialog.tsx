import { useEffect, useRef, useState, type ReactNode } from "react";
import { refreshPanelAuthUser, sendAccountEmailVerification } from "../auth/panelAuth";
import type { AccessLinkLookup } from "../projects/projectAccess";
import type { AccessContext, PanelUser, Project, ProjectAccessRequest } from "../../types";

export const LEGACY_INVITE_MESSAGE = "Este enlace pertenece a una invitación por correo que ya no se usa. Pide al propietario del proyecto un enlace de acceso nuevo.";

/**
 * Confirmation shown over the project picker when someone opens a shared link.
 * Opening the link never grants access by itself: it only lets the person ask.
 */
export function AccessRequestDialog({ context, user, projects, onClose, onOpenProject, onUserUpdated }: {
  context: AccessContext;
  user: PanelUser;
  projects: Project[];
  onClose: () => void;
  onOpenProject: (project: Project) => void;
  onUserUpdated: (user: PanelUser) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [lookup, setLookup] = useState<AccessLinkLookup | null>(null);
  const [request, setRequest] = useState<ProjectAccessRequest | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verification, setVerification] = useState<{ sent: boolean; message: string }>({ sent: false, message: "" });
  const projectId = context.kind === "link" ? context.projectId : "";
  const linkId = context.kind === "link" ? context.linkId : "";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setLookup(null);
    void import("../projects/projectAccess").then(({ lookupAccessLink }) => lookupAccessLink(projectId, linkId))
      .then((value) => { if (active) setLookup(value); })
      .catch(() => { if (active) { setLookup({ state: "missing" }); setError("No pudimos comprobar el enlace. Revisa tu conexión y vuelve a abrirlo."); } });
    return () => { active = false; };
  }, [linkId, projectId]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    let stop: (() => void) | undefined;
    void import("../projects/projectAccess").then(({ watchOwnAccessRequest }) => watchOwnAccessRequest(projectId, user.id, (value) => {
      if (active) setRequest(value);
    }, () => { if (active) setRequest(null); })).then((unsubscribe) => {
      if (active) stop = unsubscribe;
      else unsubscribe();
    }).catch(() => { if (active) setRequest(null); });
    return () => { active = false; stop?.(); };
  }, [projectId, user.id]);

  // Explicit controls close directly; Escape still goes through the native `close` event.
  function close() {
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  }

  const project = projects.find((entry) => entry.id === projectId) ?? null;
  const link = lookup && lookup.state !== "missing" ? lookup.link : null;
  const projectName = project?.name || link?.projectName || "este proyecto";

  async function submit() {
    if (busy || lookup?.state !== "ready") return;
    setBusy(true);
    setError("");
    try {
      const { submitAccessRequest } = await import("../projects/projectAccess");
      await submitAccessRequest(lookup.link, user, request ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo enviar la solicitud.");
    } finally {
      setBusy(false);
    }
  }

  async function sendVerification() {
    if (busy) return;
    setBusy(true);
    try {
      await sendAccountEmailVerification(context);
      setVerification({ sent: true, message: `Enviamos un enlace a ${user.email}. Ábrelo y vuelve aquí.` });
    } catch {
      setVerification((current) => ({ ...current, message: "No pudimos enviar el correo. Espera un momento y vuelve a intentarlo." }));
    } finally { setBusy(false); }
  }

  async function checkVerification() {
    if (busy) return;
    setBusy(true);
    try {
      const refreshed = await refreshPanelAuthUser();
      onUserUpdated(refreshed);
      setVerification((current) => ({ ...current, message: refreshed.emailVerified ? "Correo confirmado. Ya puedes solicitar acceso." : "Todavía no aparece confirmado. Abre el enlace del correo y vuelve a intentarlo." }));
    } catch {
      setVerification((current) => ({ ...current, message: "No pudimos comprobar el correo. Recarga la página e inténtalo de nuevo." }));
    } finally { setBusy(false); }
  }

  let status: { tone: "info" | "success" | "warning" | "error"; label?: string; text: string } | null = null;
  let actions: ReactNode = null;

  if (context.kind === "legacy") {
    status = { tone: "warning", text: LEGACY_INVITE_MESSAGE };
  } else if (project) {
    status = { tone: "success", label: "Aprobado", text: `Ya formas parte de ${project.name}.` };
    actions = <button className="projectCreateSubmit" type="button" onClick={() => onOpenProject(project)}>Abrir proyecto</button>;
  } else if (lookup === null || request === undefined) {
    status = { tone: "info", text: "Comprobando el enlace…" };
  } else if (request?.status === "pending") {
    status = { tone: "info", label: "Pendiente", text: `Tu solicitud está pendiente. El propietario de ${projectName} debe aprobarla; verás el cambio aquí y en tu lista de proyectos.` };
  } else if (request?.status === "rejected" && !request.retryAllowed) {
    status = { tone: "error", label: "Rechazada", text: `El propietario rechazó tu solicitud para ${projectName}. Si te permite volver a intentarlo, verás aquí la opción para solicitar de nuevo.` };
  } else if (request?.status === "rejected" && lookup.state !== "ready") {
    status = { tone: "warning", label: "Puedes volver a solicitar", text: `El propietario te permite volver a solicitar acceso a ${projectName}, pero este enlace ya no es válido. Pídele un enlace nuevo.` };
  } else if (request?.status === "approved" && lookup.state !== "ready") {
    status = { tone: "success", label: "Aprobado", text: `Tu solicitud fue aprobada. ${projectName} aparecerá en tu lista en unos segundos.` };
  } else if (lookup.state === "missing") {
    status = { tone: "error", text: error || "Este enlace no existe o no está disponible. Pide al propietario un enlace nuevo." };
  } else if (lookup.state === "revoked") {
    status = { tone: "error", text: `El propietario revocó este enlace de ${projectName}. Pídele uno nuevo.` };
  } else if (lookup.state === "expired") {
    status = { tone: "error", text: `Este enlace de ${projectName} venció. Pide al propietario uno nuevo.` };
  } else if (!user.emailVerified) {
    status = { tone: "warning", text: `Para solicitar acceso, confirma que controlas ${user.email}.` };
    actions = <>
      <button className="projectCreateSubmit" type="button" onClick={() => void sendVerification()} disabled={busy}>{busy ? "Un momento…" : verification.sent ? "Reenviar verificación" : "Enviar verificación"}</button>
      {verification.sent && <button className="ghost" type="button" onClick={() => void checkVerification()} disabled={busy}>Ya confirmé el correo</button>}
    </>;
  } else {
    const again = request?.status === "rejected" || request?.status === "approved";
    status = request?.status === "rejected"
      ? { tone: "warning", label: "Puedes volver a solicitar", text: `El propietario te permite enviar una nueva solicitud a ${projectName}. Volverá a quedar pendiente hasta que la apruebe.` }
      : { tone: "info", text: request?.status === "approved"
        ? `Ya no tienes acceso a ${projectName}. Puedes pedirlo de nuevo; el propietario debe aprobarlo.`
        : `El propietario revisará tu solicitud antes de darte acceso. Compartirás tu nombre y ${user.email}.` };
    actions = <button className="projectCreateSubmit" type="button" onClick={() => void submit()} disabled={busy}>{busy ? "Enviando…" : again ? "Solicitar de nuevo" : "Solicitar acceso"}</button>;
  }

  return (
    <dialog ref={dialogRef} className="projectCreateCard projectCreateDialog accessRequestDialog" aria-labelledby="access-request-title" aria-describedby="access-request-status" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="projectCreateHeading">
        <div>
          <p className="eyebrow">ACCESO AL EQUIPO</p>
          <h2 id="access-request-title">{context.kind === "legacy" ? "Enlace de invitación antiguo" : project ? `Ya tienes acceso a ${project.name}` : `Solicitar acceso a ${projectName}`}</h2>
        </div>
        <button className="plain" type="button" onClick={close}>Cerrar</button>
      </div>
      <div className="accessRequestAccount"><span className="projectMemberAvatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></div>
      {status && <p className={`accessRequestStatus is-${status.tone}`} id="access-request-status" role="status">
        {status.label && <span className="accessStatusChip" data-tone={status.tone}>{status.label}</span>}
        {status.text}
      </p>}
      {error && lookup?.state !== "missing" && <p className="projectFormError" role="alert">{error}</p>}
      {verification.message && <p className="projectCreateHint" role="status">{verification.message}</p>}
      <div className="accessRequestActions">
        {actions}
        {context.kind === "legacy" && <button className="projectCreateSubmit" type="button" onClick={close}>Entendido</button>}
      </div>
    </dialog>
  );
}
