import { useId, useState, type FormEvent } from "react";
import type { FileDraft } from "../../types";
import { FILE_DRAFT_LIMITS } from "../../types";
import { Popover } from "../../components/ui/Popover";
import { relativeTime } from "../../lib/relativeTime";
import { draftPathProblem, type DraftInput } from "./fileDrafts";
import { formatBytes } from "./repoTree";
import { RepoIcon } from "./repoIcons";

/**
 * "Crear archivo nuevo": path, content and commit message. The file is kept in
 * Cowork until a reviewer approves it; then it is committed to `targetRef`.
 */
export function FileDraftEditor({ folder, targetRef, refNote, exists, pendingAt, onCancel, onSubmit }: {
  folder: string;
  targetRef: string;
  /** Why the target is not the branch being viewed (a tag or a commit is open). */
  refNote: string;
  /** The path is already a file in the repository. */
  exists: (path: string) => boolean;
  /** Another proposal already waits for this path. */
  pendingAt: (path: string) => boolean;
  onCancel: () => void;
  onSubmit: (input: DraftInput) => Promise<void>;
}) {
  const [path, setPath] = useState(folder ? `${folder}/` : "");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const ids = useId();
  const cleanPath = path.trim();
  const name = cleanPath.slice(cleanPath.lastIndexOf("/") + 1);
  const bytes = new TextEncoder().encode(content).length;
  const replaces = Boolean(cleanPath) && !draftPathProblem(cleanPath) && exists(cleanPath);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = draftPathProblem(cleanPath) || (pendingAt(cleanPath) ? "Ya hay una propuesta pendiente para esa ruta en esta rama." : "")
      || (bytes > FILE_DRAFT_LIMITS.bytes ? "El contenido supera los 650 KB que admite la revisión en Cowork." : "");
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError("");
    try {
      await onSubmit({ ref: targetRef, path: cleanPath, encoding: "utf-8", content, size: bytes, message: message.trim() || `${replaces ? "Actualizar" : "Añadir"} ${name}` });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la propuesta.");
      setSaving(false);
    }
  }

  return <form className="panel codeDraftEditor" onSubmit={(event) => void submit(event)} aria-label="Proponer archivo nuevo">
    <header className="codeDraftHead">
      <div>
        <h2>Crear archivo nuevo</h2>
        <p>Queda en Cowork pendiente de revisión. Cuando alguien con permiso lo apruebe, se sube a <code>{targetRef}</code>.{refNote ? ` ${refNote}` : ""}</p>
      </div>
    </header>
    <label className="controlField" htmlFor={`${ids}-path`}><span>Ruta en el repositorio</span>
      <input id={`${ids}-path`} value={path} onChange={(event) => { setPath(event.target.value); setError(""); }} placeholder="carpeta/archivo.ts" maxLength={FILE_DRAFT_LIMITS.path} autoComplete="off" spellCheck={false} autoFocus required />
    </label>
    {replaces && <p className="codeDraftHint">Ya existe un archivo con esa ruta: al aprobarse, lo reemplazará.</p>}
    <label className="controlField codeDraftContent" htmlFor={`${ids}-content`}><span>Contenido</span>
      <textarea id={`${ids}-content`} value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} placeholder="Escribe o pega el contenido del archivo" />
    </label>
    <label className="controlField" htmlFor={`${ids}-message`}><span>Mensaje del commit</span>
      <input id={`${ids}-message`} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={name ? `${replaces ? "Actualizar" : "Añadir"} ${name}` : "Describe el cambio"} maxLength={FILE_DRAFT_LIMITS.message} />
    </label>
    {error && <p className="projectSettingsError" role="alert">{error}</p>}
    <footer className="codeDraftActions">
      <span className="codeDraftSize">{formatBytes(bytes)} de 650 KB</span>
      <button className="plain" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
      <button type="submit" disabled={saving || !cleanPath}>{saving ? "Guardando…" : "Proponer archivo"}</button>
    </footer>
  </form>;
}

export type ReviewAbility =
  | { approve: true }
  | { approve: false; reason: string; connect?: boolean };

/** Above a proposed file: who proposed it, for which branch, and the review actions. */
export function DraftReviewBar({ draft, replaces, canReject, approval, isAuthor, busy, error, onApprove, onReject, onDiscard, onConnect }: {
  draft: FileDraft;
  replaces: boolean;
  canReject: boolean;
  approval: ReviewAbility;
  isAuthor: boolean;
  busy: "" | "approve" | "reject" | "discard";
  error: string;
  onApprove: () => void;
  onReject: (note: string) => void;
  onDiscard: () => void;
  onConnect: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const pending = draft.status === "pending";
  const noteId = useId();

  return <section className={`panel codeReview is-${draft.status}`} aria-label="Revisión del archivo propuesto">
    <div className="codeReviewInfo">
      <span className="codeReviewBadge">{pending ? "Pendiente de revisión" : "Rechazado"}</span>
      <p><b>{draft.authorName}</b> lo propuso {relativeTime(draft.createdAt)} para <code>{draft.ref}</code> · {formatBytes(draft.size)}{replaces ? " · reemplaza el archivo actual" : " · archivo nuevo"}</p>
      <p className="codeReviewMessage">«{draft.message}»</p>
      {!pending && <p className="codeReviewNote"><b>{draft.reviewerName || "Un revisor"}</b> lo rechazó{draft.reviewNote ? `: ${draft.reviewNote}` : "."}</p>}
    </div>
    {pending && rejecting ? <form className="codeReviewReject" onSubmit={(event) => { event.preventDefault(); onReject(note); }}>
      <label className="controlField" htmlFor={noteId}><span>Motivo (opcional)</span>
        <textarea id={noteId} value={note} onChange={(event) => setNote(event.target.value)} maxLength={FILE_DRAFT_LIMITS.reviewNote} rows={2} autoFocus placeholder="Qué falta o qué cambiar" />
      </label>
      <div className="codeReviewActions">
        <button className="plain" type="button" onClick={() => setRejecting(false)} disabled={busy === "reject"}>Cancelar</button>
        <button className="ghost" type="submit" disabled={busy === "reject"}>{busy === "reject" ? "Rechazando…" : "Rechazar archivo"}</button>
      </div>
    </form> : <div className="codeReviewActions">
      {(isAuthor || (!pending && canReject)) && <button className="plain" type="button" onClick={onDiscard} disabled={Boolean(busy)}>{busy === "discard" ? "Descartando…" : "Descartar"}</button>}
      {pending && canReject && <button className="ghost" type="button" onClick={() => setRejecting(true)} disabled={Boolean(busy)}>Rechazar</button>}
      {pending && approval.approve && <button className="codeReviewApprove" type="button" onClick={onApprove} disabled={Boolean(busy)}>{busy === "approve" ? "Subiendo a GitHub…" : "Aprobar y subir a GitHub"}</button>}
    </div>}
    {pending && !approval.approve && approval.reason && <p className="codeReviewWhy">{approval.reason}{approval.connect && <> <button className="plain" type="button" onClick={onConnect}>Conectar GitHub</button></>}</p>}
    {error && <p className="projectSettingsError" role="alert">{error}</p>}
  </section>;
}

/** "N pendientes" in the toolbar: every proposal of the project, by branch. */
export function PendingDrafts({ drafts, current, onOpen }: { drafts: FileDraft[]; current: string; onOpen: (draft: FileDraft) => void }) {
  const [open, setOpen] = useState(false);
  if (!drafts.length) return null;
  const pending = drafts.filter((draft) => draft.status === "pending").length;
  return <Popover className="repoPending" open={open} onOpenChange={setOpen} label="Archivos propuestos" panelClassName="repoPendingPanel"
    trigger={(trigger) => <button {...trigger} className="repoCount repoPendingButton" type="button" aria-label={`${pending} archivos pendientes de revisión${drafts.length > pending ? `, ${drafts.length - pending} rechazados` : ""}`}>
      <span className="repoPendingDot" aria-hidden="true" /><b>{pending}</b><span className="repoCountLabel">{pending === 1 ? "pendiente" : "pendientes"}</span>
    </button>}>
    <header className="repoPopHead"><strong>Archivos propuestos</strong></header>
    <div className="repoPendingList">
      {drafts.map((draft) => <button key={draft.id} type="button" className="repoMenuItem" onClick={() => { setOpen(false); onOpen(draft); }}>
        <RepoIcon name={draft.status === "pending" ? "filePlus" : "external"} />
        <span>
          <b>{draft.path.slice(draft.path.lastIndexOf("/") + 1)}</b>
          <small>{draft.status === "pending" ? "Pendiente" : "Rechazado"} · {draft.authorName} · <code>{draft.ref}</code>{draft.ref === current ? "" : " (otra rama)"}</small>
        </span>
      </button>)}
    </div>
  </Popover>;
}
