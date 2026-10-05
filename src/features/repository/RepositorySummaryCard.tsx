import type { BranchEntry, PanelUser, Project } from "../../types";
import { Sk, SkText } from "../../components/Skeleton";
import { useGitHubSession } from "../github/githubSession";
import { githubRepository, repositoryLabel } from "./githubRepository";
import { useRepository } from "./useRepository";
import { relativeTime } from "../../lib/relativeTime";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Summary card of the project's repository: default branch, last change and
 * how many branches and pull requests are open. Shares the repository store
 * with the branches and code pages, so opening them does not refetch.
 */
export function RepositorySummaryCard({ project, user, isOwner, register, registerReady, linkedTasks, now }: {
  project: Project;
  user: PanelUser;
  isOwner: boolean;
  /** Branches in the team register. */
  register: BranchEntry[];
  registerReady: boolean;
  /** Open tasks that point at a branch; null while tasks load. */
  linkedTasks: number | null;
  now: number;
}) {
  const github = useGitHubSession(user);
  const repository = useRepository(project.repositoryUrl, github.status === "checking" ? null : github.token);
  const location = githubRepository(project.repositoryUrl);

  if (!location) {
    return <article className="panel homeCard homeRepo" aria-labelledby="home-repo-title">
      <div className="homeCardHead"><p className="homeEyebrow">REPOSITORIO</p></div>
      <h2 className="homeCardTitle" id="home-repo-title">Sin repositorio</h2>
      <p className="homeCopy">{isOwner
        ? "Vincula el repositorio de GitHub para ver sus ramas, cambios y archivos desde Cowork."
        : "Este proyecto todavía no tiene un repositorio de GitHub vinculado."}</p>
      {isOwner && <div className="homeCardFoot"><a className="homeLink" href="#settings-page?section=github">Vincular repositorio <span aria-hidden="true">↗</span></a></div>}
    </article>;
  }

  const { repo, repoReady, repoError, branches, branchesReady, branchError, commits, commitsReady, commitError, pulls, pullsReady, pullError } = repository;
  const lastCommit = commits[0];
  const lastDate = lastCommit?.commit?.author?.date ?? lastCommit?.commit?.committer?.date ?? "";
  const failed = repoReady && !repo && repoError;

  return <article className="panel homeCard homeRepo" aria-labelledby="home-repo-title">
    <div className="homeCardHead">
      <p className="homeEyebrow">GITHUB · {repositoryLabel(project.repositoryUrl).toUpperCase()}</p>
      {repoReady ? repo && <span className="homeChip">{repo.private ? "Privado" : "Público"}</span> : <Sk shape="pill" w={58} h={20} />}
    </div>
    <h2 className="homeCardTitle" id="home-repo-title">Repositorio</h2>
    {failed ? <p className="homeCopy">{repoError}</p> : <>
      <dl className="homeFacts">
        <div><dt>Rama principal</dt><dd>{repoReady ? <code>{repo?.default_branch || "—"}</code> : <Sk inline w="8ch" />}</dd></div>
        <div><dt>Último cambio</dt><dd>{!commitsReady ? <SkText widths={["90%", "40%"]} /> : commitError ? <span className="homeMuted">{commitError}</span> : lastCommit
          ? <a href={`${location.url}/commit/${lastCommit.sha}`} target="_blank" rel="noreferrer">
            <span className="homeCommitMessage">{lastCommit.commit?.message?.split("\n")[0] || "Cambio sin descripción"}</span>
            <small>{lastCommit.author?.login || lastCommit.commit?.author?.name || "Colaborador"}{lastDate ? ` · ${relativeTime(lastDate, now)}` : ""}</small>
          </a>
          : <span className="homeMuted">Sin cambios todavía.</span>}</dd></div>
      </dl>
      <p className="homeRepoStats">
        <span>{!branchesReady ? <Sk inline w="9ch" /> : branchError ? "Ramas no disponibles" : plural(branches.length, "rama en GitHub", "ramas en GitHub")}</span>
        <span>{registerReady ? plural(register.length, "registrada en Cowork", "registradas en Cowork") : <Sk inline w="14ch" />}</span>
        {!(pullsReady && pullError) && <span>{pullsReady ? plural(pulls.length, "PR abierto", "PR abiertos") : <Sk inline w="8ch" />}</span>}
        {linkedTasks === null ? <span><Sk inline w="16ch" /></span> : linkedTasks > 0 && <span>{plural(linkedTasks, "tarea abierta en una rama", "tareas abiertas en ramas")}</span>}
      </p>
    </>}
    <div className="homeCardFoot">
      <a className="homeLink" href="#branches-page">Ramas y cambios <span aria-hidden="true">↗</span></a>
      <a className="homeLink" href={location.url} target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
    </div>
  </article>;
}
