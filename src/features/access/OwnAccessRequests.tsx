import { useEffect, useState } from "react";
import type { AccessContext, OwnAccessRequest, PanelUser, Project } from "../../types";

const STATUS_LABELS: Record<OwnAccessRequest["status"], string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  unknown: "No disponible",
};

/** The requester's own access requests, with live status from each project. */
export function OwnAccessRequests({ user, projects, onOpenProject, onRetry }: {
  user: PanelUser;
  projects: Project[];
  onOpenProject: (project: Project) => void;
  /** Opens the request dialog again with the link used last time. */
  onRetry: (context: AccessContext) => void;
}) {
  const [requests, setRequests] = useState<OwnAccessRequest[]>([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    void import("../projects/projectAccess").then(({ watchOwnAccessRequests }) => watchOwnAccessRequests(user.id, (next) => {
      if (active) setRequests(next);
    }, () => { if (active) setRequests([]); })).then((unsubscribe) => {
      if (active) stop = unsubscribe;
      else unsubscribe();
    }).catch(() => undefined);
    return () => { active = false; stop?.(); };
  }, [user.id]);

  async function dismiss(projectId: string) {
    setBusy(projectId);
    try {
      const { dismissOwnAccessRequest } = await import("../projects/projectAccess");
      await dismissOwnAccessRequest(user.id, projectId);
    } catch { /* The entry stays visible and can be dismissed later. */ }
    finally { setBusy(""); }
  }

  if (!requests.length) return null;

  return (
    <section className="ownAccessRequests" aria-labelledby="own-access-requests-title">
      <h2 id="own-access-requests-title" className="eyebrow">TUS SOLICITUDES DE ACCESO</h2>
      <ul>
        {requests.map((request) => {
          const project = projects.find((entry) => entry.id === request.projectId);
          const status = project ? "approved" : request.status;
          const canRetry = !project && status === "rejected" && request.retryAllowed;
          return (
            <li key={request.projectId} className="ownAccessRequest">
              <span className="ownAccessRequestName">{project?.name || request.projectName}</span>
              <span className="accessStatusChip" data-tone={status === "approved" ? "success" : canRetry ? "warning" : status === "rejected" ? "error" : "info"}>{canRetry ? "Puedes volver a solicitar" : STATUS_LABELS[status]}</span>
              {project
                ? <button className="plain" type="button" onClick={() => { onOpenProject(project); void dismiss(request.projectId); }}>Abrir proyecto</button>
                : canRetry && request.linkId
                  ? <button className="plain" type="button" onClick={() => onRetry({ kind: "link", projectId: request.projectId, linkId: request.linkId })}>Solicitar de nuevo</button>
                  : status !== "pending" && <button className="plain" type="button" onClick={() => void dismiss(request.projectId)} disabled={busy === request.projectId}>Ocultar</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
