import { useState } from "react";
import type { GitHubBranch, GitHubCommit, GitHubRepo } from "../../types";
import { githubRepository, repositoryLabel } from "./githubRepository";
import { repeat, Sk, SkGroup } from "../../components/Skeleton";

function relativeDate(value?: string) {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-PA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Panama" }).format(date);
}

/** Branch rows while GitHub answers: monospace name, "principal" pill on the first one, short sha. */
function BranchesSkeleton() {
  return <SkGroup className="repoList" label="Cargando ramas de GitHub">
    {repeat(6, (index) => <div className="repoBranchItem" key={index}>
      <span className="repoBranchLink"><Sk w={[64, 150, 118, 176, 96, 136][index]} /></span>
      {index === 0 && <Sk shape="pill" w={52} h={18} />}
      <span className="repoSha"><Sk w={46} /></span>
    </div>)}
  </SkGroup>;
}

/** Commit rows: a message of up to two lines, then author · date · sha. */
function CommitsSkeleton() {
  return <SkGroup className="repoList" label="Cargando cambios recientes">
    {repeat(6, (index) => <div className="repoCommitItem" key={index}>
      <span className="repoCommitMessage">{index % 3 === 1 ? <><Sk /><Sk w="48%" /></> : <Sk w={index % 2 ? "58%" : "76%"} />}</span>
      <span className="repoCommitMeta"><Sk w="42%" /></span>
    </div>)}
  </SkGroup>;
}

/** Offered next to a GitHub error while the account has no usable token. */
export type RepositoryConnect = { label: string; busy: boolean; onClick: () => void };

/** Deletion offered per branch; the page decides who may delete what. */
export type RepositoryBranchActions = { canDelete: (branch: GitHubBranch) => boolean; onDelete: (name: string) => Promise<void> };

export function RepositoryCards({ repositoryUrl, repo, branches, commits, branchError, commitError, branchesReady, commitsReady, loading, updatedAt, onRefresh, connect = null, branchActions = null }: {
  repositoryUrl: string;
  repo: GitHubRepo | null;
  branches: GitHubBranch[];
  commits: GitHubCommit[];
  branchError: string;
  commitError: string;
  branchesReady: boolean;
  commitsReady: boolean;
  loading: boolean;
  updatedAt: Date | null;
  onRefresh: () => void;
  connect?: RepositoryConnect | null;
  branchActions?: RepositoryBranchActions | null;
}) {
  const [confirming, setConfirming] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const repository = githubRepository(repositoryUrl);
  if (!repository) return null;
  const label = repositoryLabel(repositoryUrl);
  const defaultBranch = repo?.default_branch ?? "main";
  async function confirmDelete(name: string) {
    if (!branchActions || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await branchActions.onDelete(name);
      setConfirming("");
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "No se pudo borrar la rama en GitHub.");
    } finally { setDeleting(false); }
  }

  const branchRow = (branch: GitHubBranch) => {
    const deletable = branchActions?.canDelete(branch) ?? false;
    return <div className="repoBranchItem" key={branch.name}>
      <a className="repoBranchLink" href={`${repository.url}/tree/${encodeURIComponent(branch.name)}`} target="_blank" rel="noreferrer">{branch.name}</a>
      {branch.name === defaultBranch ? <span className="repoDefault">principal</span> : branch.protected && <span className="repoProtected">protegida</span>}
      <code className="repoSha">{branch.commit?.sha?.slice(0, 7) ?? "—"}</code>
      {deletable && confirming !== branch.name && <button className="plain repoBranchDelete" type="button" onClick={() => { setConfirming(branch.name); setDeleteError(""); }} aria-label={`Borrar la rama ${branch.name} en GitHub`}>Borrar</button>}
      {deletable && confirming === branch.name && <div className="repoBranchConfirm" role="group" aria-label={`Confirmar borrado de ${branch.name}`}>
        <p>Esta acción borra la rama <code>{branch.name}</code> del repositorio en GitHub.</p>
        <div><button className="plain" type="button" onClick={() => { setConfirming(""); setDeleteError(""); }} disabled={deleting}>Cancelar</button><button className="ghost repoBranchConfirmButton" type="button" onClick={() => void confirmDelete(branch.name)} disabled={deleting}>{deleting ? "Borrando…" : "Borrar rama"}</button></div>
        {deleteError && <p className="projectSettingsError" role="alert">{deleteError}</p>}
      </div>}
    </div>;
  };
  const connectButton = connect && <button className="ghost repoConnect" type="button" onClick={connect.onClick} disabled={connect.busy}>{connect.busy ? "Conectando GitHub…" : connect.label}</button>;

  return (
    <section className="repoCards" aria-label={`Actividad del repositorio ${label}`}>
      <article className="panel repoCard">
        <div className="panelHead"><div><p className="eyebrow">GITHUB · {label.toUpperCase()}</p><h2>Ramas registradas</h2></div><span className="repoStatus" data-state={!branchesReady ? "loading" : branchError ? "error" : "ready"}>{!branchesReady ? <Sk inline w="9ch" /> : branchError ? "No disponible" : "Actualizado"}</span></div>
        <div className="repoCardMeta"><span>{!branchesReady ? <Sk inline w="12ch" /> : branches.length ? `${branches.length} ${branches.length === 1 ? "rama" : "ramas"}${repo?.private ? " · repositorio privado" : ""}` : "Ramas del repositorio"}</span><a href={`${repository.url}/branches`} target="_blank" rel="noreferrer">Ver en GitHub ↗</a></div>
        {!branchesReady ? <BranchesSkeleton /> : branchError ? <div className="repoEmpty"><p>{branchError}</p>{connectButton}</div> : branches.length ? <div className="repoList">{branches.map(branchRow)}</div> : <p className="repoEmpty">No hay ramas disponibles.</p>}
      </article>

      <article className="panel repoCard">
        <div className="panelHead"><div><p className="eyebrow">HISTORIAL DEL REPOSITORIO</p><h2>Cambios recientes</h2></div><button className="ghost repoRefresh" type="button" onClick={onRefresh} disabled={loading}>{loading ? "Actualizando…" : "Actualizar"}</button></div>
        <div className="repoCardMeta"><span>{updatedAt ? `Consulta · ${relativeDate(updatedAt.toISOString())}` : "Commits recientes"}</span><a href={`${repository.url}/commits`} target="_blank" rel="noreferrer">Ver historial ↗</a></div>
        {!commitsReady ? <CommitsSkeleton /> : commitError ? <p className="repoEmpty">{commitError}</p> : commits.length ? <div className="repoList">{commits.map((commit) => {
          const sha = commit.sha;
          const date = commit.commit?.author?.date ?? commit.commit?.committer?.date;
          return <article className="repoCommitItem" key={sha}><a className="repoCommitMessage" href={`${repository.url}/commit/${sha}`} target="_blank" rel="noreferrer">{commit.commit?.message?.split("\n")[0] || "Cambio sin descripción"}</a><div className="repoCommitMeta"><span>{commit.author?.login || commit.commit?.author?.name || "Colaborador"}</span><span aria-hidden="true">·</span><time dateTime={date}>{relativeDate(date)}</time><code>{sha.slice(0, 7)}</code></div></article>;
        })}</div> : <p className="repoEmpty">No hay cambios recientes disponibles.</p>}
      </article>
    </section>
  );
}
