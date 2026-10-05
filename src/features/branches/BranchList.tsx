import { useEffect, useState } from "react";
import type { GitHubCommit, GitHubCompare } from "../../types";
import { repeat, Sk, SkGroup } from "../../components/Skeleton";
import { compareRefs, listCommits } from "../github/githubApi";
import { encodeBranchPath } from "../github/githubRefs";
import type { UnifiedBranch } from "../github/branchModel";
import { buildHash } from "../../lib/hashRoute";
import { relativeTime } from "../../lib/relativeTime";

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : new Intl.DateTimeFormat("es-PA", { dateStyle: "medium", timeZone: "America/Panama" }).format(date);
}

const PRESENCE_LABEL = {
  both: "Cowork + GitHub",
  github: "Sin registrar",
  unknown: "GitHub no disponible",
} as const;

function presenceLabel(branch: UnifiedBranch, hasRepository: boolean) {
  // The default branch is the base of everything; it is not "registered" work.
  if (branch.isDefault && branch.presence === "github") return "";
  if (branch.presence === "cowork") return branch.deletedInGitHub ? "Borrada en GitHub" : hasRepository ? "Solo en Cowork" : "";
  return PRESENCE_LABEL[branch.presence];
}

export interface BranchRowActions {
  repositoryUrl: string;
  repoPath: string;
  token: string;
  defaultBranch: string;
  hasRepository: boolean;
  canWriteGitHub: boolean;
  canDelete: (branch: UnifiedBranch) => boolean;
  register: (name: string) => void;
  createInGitHub: (branch: UnifiedBranch) => Promise<void>;
  deleteInGitHub: (name: string) => Promise<void>;
  removeEntry: (branch: UnifiedBranch, alsoGitHub: boolean) => Promise<void>;
}

type Confirming = "github" | "register" | null;

/** One branch: where it exists, its pull request and tasks, and what can be done with it. */
export function BranchRow({ branch, actions, expanded, onToggle }: {
  branch: UnifiedBranch;
  actions: BranchRowActions;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [alsoGitHub, setAlsoGitHub] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const deletable = actions.canDelete(branch);
  const presence = presenceLabel(branch, actions.hasRepository);
  const detailId = `branch-detail-${branch.key.replace(/[^\w-]/g, "-")}`;

  async function run(work: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError("");
    try { await work(); setConfirming(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : fallback); }
    finally { setBusy(false); }
  }

  return <article className={`branchRow${expanded ? " isExpanded" : ""}`} data-presence={branch.presence} data-branch={branch.name}>
    <div className="branchRowMain">
      <div className="branchRowTitle">
        {branch.github
          ? <a className="branchName" href={`${actions.repositoryUrl}/tree/${encodeBranchPath(branch.name)}`} target="_blank" rel="noreferrer">{branch.name}</a>
          : <code className="branchName">{branch.name}</code>}
        {branch.isDefault && <span className="repoDefault">principal</span>}
        {branch.protected && !branch.isDefault && <span className="repoProtected">protegida</span>}
        {presence && <span className="branchPresence" data-presence={branch.presence} data-deleted={branch.deletedInGitHub || undefined}>{presence}</span>}
        {branch.pull && <a className="branchPull" href={branch.pull.html_url} target="_blank" rel="noreferrer" title={branch.pull.title}>PR #{branch.pull.number}{branch.pull.draft ? " · borrador" : ""}</a>}
        {branch.tasks.length > 0 && <span className="branchTasksCount">{branch.tasks.length} {branch.tasks.length === 1 ? "tarea" : "tareas"}</span>}
      </div>
      {branch.entry && <p className="branchReason">{branch.entry.reason}</p>}
      <p className="tag branchMeta">
        {branch.entry && <><span>{branch.entry.by || "Equipo"}</span><span aria-hidden="true">·</span><time dateTime={branch.entry.createdAt}>{dateLabel(branch.entry.createdAt)}</time></>}
        {branch.github?.commit?.sha && <code className="repoSha">{branch.github.commit.sha.slice(0, 7)}</code>}
      </p>
    </div>
    <div className="branchRowActions">
      <button className="plain" type="button" aria-expanded={expanded} aria-controls={expanded ? detailId : undefined} onClick={onToggle}>{expanded ? "Ocultar" : "Detalles"}</button>
      {branch.github && <a className="plain branchCodeLink" href={buildHash("code", { ref: branch.name })}>Ver código</a>}
      {branch.presence === "github" && !branch.isDefault && <button className="plain" type="button" onClick={() => actions.register(branch.name)}>Registrar</button>}
      {branch.entry && branch.presence === "cowork" && actions.hasRepository && actions.canWriteGitHub && <button className="plain" type="button" disabled={busy} onClick={() => void run(() => actions.createInGitHub(branch), "GitHub no pudo crear la rama.")}>{busy ? "Creando…" : "Crear en GitHub"}</button>}
      {deletable && confirming !== "github" && <button className="plain repoBranchDelete" type="button" onClick={() => { setConfirming("github"); setError(""); }} aria-label={`Borrar la rama ${branch.name} en GitHub`}>Borrar en GitHub</button>}
      {branch.entry && confirming !== "register" && <button className="plain" type="button" onClick={() => { setConfirming("register"); setAlsoGitHub(false); setError(""); }} aria-label={`Quitar ${branch.name} del registro`}>Quitar del registro</button>}
    </div>
    {confirming === "github" && <div className="repoBranchConfirm" role="group" aria-label={`Confirmar borrado de ${branch.name}`}>
      <p>Esta acción borra la rama <code>{branch.name}</code> del repositorio en GitHub.</p>
      <div><button className="plain" type="button" onClick={() => setConfirming(null)} disabled={busy}>Cancelar</button><button className="ghost repoBranchConfirmButton" type="button" onClick={() => void run(() => actions.deleteInGitHub(branch.name), "No se pudo borrar la rama en GitHub.")} disabled={busy}>{busy ? "Borrando…" : "Borrar rama"}</button></div>
    </div>}
    {confirming === "register" && <div className="repoBranchConfirm" role="group" aria-label={`Confirmar quitar ${branch.name} del registro`}>
      <p>La rama deja de aparecer en el registro del equipo. La actividad conserva quién la quitó.</p>
      {branch.github && deletable && <label className="toggleRow"><input type="checkbox" checked={alsoGitHub} onChange={(event) => setAlsoGitHub(event.target.checked)} /><span><strong>Borrar también en GitHub</strong></span></label>}
      <div><button className="plain" type="button" onClick={() => setConfirming(null)} disabled={busy}>Cancelar</button><button className="ghost repoBranchConfirmButton" type="button" onClick={() => void run(() => actions.removeEntry(branch, alsoGitHub), "No se pudo quitar la rama del registro.")} disabled={busy}>{busy ? "Quitando…" : "Quitar"}</button></div>
    </div>}
    {error && <p className="projectSettingsError" role="alert">{error}</p>}
    {expanded && <BranchDetail id={detailId} branch={branch} actions={actions} />}
  </article>;
}

/** Ahead/behind the default branch, the last commits of the branch and its linked tasks. */
function BranchDetail({ id, branch, actions }: { id: string; branch: UnifiedBranch; actions: BranchRowActions }) {
  const onGitHub = Boolean(branch.github) && Boolean(actions.repoPath);
  const comparable = onGitHub && !branch.isDefault && Boolean(actions.defaultBranch);
  const [compare, setCompare] = useState<GitHubCompare | null>(null);
  const [compareReady, setCompareReady] = useState(!comparable);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [commitsReady, setCommitsReady] = useState(!onGitHub);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!onGitHub) return;
    let active = true;
    const token = actions.token || undefined;
    if (comparable) {
      compareRefs(actions.repoPath, actions.defaultBranch, branch.name, token)
        .then((value) => { if (active) setCompare(value); })
        .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "No se pudo comparar la rama."); })
        .finally(() => { if (active) setCompareReady(true); });
    }
    listCommits(actions.repoPath, token, { sha: branch.name, perPage: 5 })
      .then((value) => { if (active) setCommits(Array.isArray(value) ? value : []); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "No se pudieron cargar los cambios."); })
      .finally(() => { if (active) setCommitsReady(true); });
    return () => { active = false; };
  }, [actions.defaultBranch, actions.repoPath, actions.token, branch.name, comparable, onGitHub]);

  return <div className="branchDetail" id={id}>
    {comparable && <p className="branchCompare">{!compareReady ? <Sk inline w="26ch" /> : compare
      ? <><strong>{compare.ahead_by}</strong> {compare.ahead_by === 1 ? "cambio" : "cambios"} por delante · <strong>{compare.behind_by}</strong> por detrás de <code>{actions.defaultBranch}</code></>
      : null}</p>}
    {error && <p className="repoEmpty">{error}</p>}
    {onGitHub && <div className="branchDetailBlock">
      <h4>Últimos cambios</h4>
      {!commitsReady ? <SkGroup label="Cargando cambios de la rama">{repeat(3, (index) => <div className="repoCommitItem" key={index}><span className="repoCommitMessage"><Sk w={["70%", "54%", "62%"][index]} /></span><span className="repoCommitMeta"><Sk w="36%" /></span></div>)}</SkGroup>
        : commits.length ? commits.map((commit) => {
          const date = commit.commit?.author?.date ?? commit.commit?.committer?.date;
          return <article className="repoCommitItem" key={commit.sha}><a className="repoCommitMessage" href={`${actions.repositoryUrl}/commit/${commit.sha}`} target="_blank" rel="noreferrer">{commit.commit?.message?.split("\n")[0] || "Cambio sin descripción"}</a><div className="repoCommitMeta"><span>{commit.author?.login || commit.commit?.author?.name || "Colaborador"}</span><span aria-hidden="true">·</span><time dateTime={date}>{date ? relativeTime(date) : ""}</time><code>{commit.sha.slice(0, 7)}</code></div></article>;
        }) : <p className="repoEmpty">Sin cambios en esta rama.</p>}
    </div>}
    <div className="branchDetailBlock">
      <h4>Tareas vinculadas</h4>
      {branch.tasks.length ? <ul className="branchTaskList">{branch.tasks.map((task) => <li key={task.id}><a href={buildHash("work", { task: task.id })}>{task.title}</a><span className="tag">{task.status}</span></li>)}</ul>
        : <p className="repoEmpty">Ninguna tarea apunta a esta rama. Vincúlala desde el detalle de una tarea.</p>}
    </div>
  </div>;
}
