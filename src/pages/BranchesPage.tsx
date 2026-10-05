import { useEffect, useRef, useState, type FormEvent } from "react";
import type { BranchEntry, PanelUser, Project, Task } from "../types";
import { PageHeading } from "../components/PageHeading";
import { useRepository } from "../features/repository/useRepository";
import { repeat, Sk, SkGroup } from "../components/Skeleton";
import { BranchRowsSkeleton } from "../components/PageSkeletons";
import { useGitHubSession } from "../features/github/githubSession";
import { useGitHubConnect } from "../features/github/useGitHubConnect";
import { branchAccess, branchAccessMessage, branchWritePolicy, canDeleteBranch } from "../features/github/branchPermissions";
import { branchNameProblem } from "../features/github/githubRefs";
import { createBranch as createGitHubBranch, deleteBranch as deleteGitHubBranch } from "../features/github/githubApi";
import { githubRepository, repositoryLabel } from "../features/repository/githubRepository";
import { filterBranches, reconcileBranches, sameBranch, type BranchFilter, type UnifiedBranch } from "../features/github/branchModel";
import { BranchRow, type BranchRowActions } from "../features/branches/BranchList";
import { RepositoryStrip } from "../features/branches/RepositoryStrip";
import { newId } from "../lib/ids";
import { useHashParams } from "../lib/useHashRoute";
import { relativeTime } from "../lib/relativeTime";

const FILTERS: { id: BranchFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "cowork", label: "En Cowork" },
  { id: "github", label: "Solo en GitHub" },
  { id: "pulls", label: "Con PR" },
];

export function BranchesPage({ project, branches, tasks, ready = true, user, isOwner, onSave, onRemove }: {
  project: Project;
  isOwner: boolean;
  branches: BranchEntry[];
  /** Tasks, to show which ones point at each branch. */
  tasks: Task[];
  /** False until the team register has arrived. */
  ready?: boolean;
  user: PanelUser;
  onSave: (branch: BranchEntry) => Promise<void>;
  onRemove: (entry: BranchEntry) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // GitHub created the branch but the register write failed: offer a retry without recreating it.
  const [pendingRegister, setPendingRegister] = useState<BranchEntry | null>(null);
  const [inGitHub, setInGitHub] = useState(true);
  const [base, setBase] = useState("");
  const [filter, setFilter] = useState<BranchFilter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState("");
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const github = useGitHubSession(user);
  const token = github.status === "checking" ? null : github.token;
  const repository = useRepository(project.repositoryUrl, token);
  const connect = useGitHubConnect(user, github);
  const { params } = useHashParams();
  const branchParam = params.get("branch");
  const location = githubRepository(project.repositoryUrl);
  const repoPath = location?.path ?? "";
  const defaultBranch = repository.repo?.default_branch ?? "";
  const access = branchAccess({ hasRepository: Boolean(repoPath), githubStatus: github.status, repo: repository.repo, repoError: repository.repoError, policy: branchWritePolicy(project), isOwner });
  const accessNote = branchAccessMessage(access);
  const createInGitHub = access.allowed && inGitHub;
  const githubKnown = repository.branchesReady && !repository.branchError;
  const listReady = ready && (!repoPath || repository.branchesReady);

  const unified = reconcileBranches({
    register: branches,
    github: githubKnown ? repository.branches : null,
    hasRepository: Boolean(repoPath),
    pulls: repository.pullError ? [] : repository.pulls,
    defaultBranch,
    tasks,
  });
  const visible = filterBranches(unified, filter, query);

  // New branches start from the default branch unless the person picks another one.
  useEffect(() => {
    if (!repository.branches.some((branch) => branch.name === base)) setBase(defaultBranch || repository.branches[0]?.name || "");
  }, [base, defaultBranch, repository.branches]);

  // "#branches-page?branch=feature/x" opens that branch.
  useEffect(() => {
    if (!branchParam || !listReady) return;
    const match = unified.find((branch) => sameBranch(branch.name, branchParam));
    if (!match) return;
    setExpanded(match.key);
    setFilter("all");
    requestAnimationFrame(() => document.querySelector(`[data-branch="${CSS.escape(match.name)}"]`)?.scrollIntoView({ block: "center" }));
    // Only when the link or the data arrive, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchParam, listReady]);

  async function register(entry: BranchEntry, createdInGitHub: boolean) {
    try {
      await onSave(entry);
      setPendingRegister(null);
      setName("");
      setReason("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "No se pudo registrar la rama.";
      if (createdInGitHub) {
        setPendingRegister(entry);
        setError(`La rama se creó en GitHub, pero no se registró en Cowork: ${message} Aparece como «Sin registrar»; pulsa «Reintentar registro».`);
      } else setError(message);
    }
  }

  async function addBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanReason = reason.trim();
    if (!cleanName || !cleanReason || saving) return;
    // The same branch is registered once per project (it also earns its point only once).
    if (branches.some((branch) => sameBranch(branch.name, cleanName))) {
      setError(`La rama «${cleanName}» ya está registrada en este proyecto.`);
      return;
    }
    const existsInGitHub = repository.branches.some((branch) => sameBranch(branch.name, cleanName));
    let baseSha = "";
    if (createInGitHub && !existsInGitHub) {
      const problem = branchNameProblem(cleanName);
      if (problem) { setError(problem); return; }
      baseSha = repository.branches.find((branch) => branch.name === base)?.commit?.sha ?? "";
      if (!baseSha) { setError("Elige la rama de GitHub desde la que empieza la nueva rama."); return; }
    }
    setSaving(true);
    setError("");
    const creating = createInGitHub && !existsInGitHub;
    // GitHub first: if it refuses, nothing is registered in Cowork.
    if (creating) {
      try { await createGitHubBranch(repoPath, cleanName, baseSha, github.token); }
      catch (reason) {
        setError(reason instanceof Error ? reason.message : "GitHub no pudo crear la rama.");
        setSaving(false);
        return;
      }
      void repository.refresh();
    }
    await register({ id: newId("b"), name: cleanName, reason: cleanReason, by: user.name, createdAt: new Date().toISOString(), ...(creating ? { githubCreated: true } : {}) }, creating);
    setSaving(false);
  }

  async function retryRegister() {
    if (!pendingRegister || saving) return;
    setSaving(true);
    setError("");
    await register(pendingRegister, true);
    setSaving(false);
  }

  const actions: BranchRowActions = {
    repositoryUrl: location?.url ?? "",
    repoPath,
    token: github.token,
    defaultBranch,
    hasRepository: Boolean(repoPath),
    canWriteGitHub: access.allowed,
    canDelete: (branch: UnifiedBranch) => Boolean(branch.github) && canDeleteBranch(access, { name: branch.name, protected: branch.protected }, defaultBranch),
    register: (branchName) => {
      setName(branchName);
      setInGitHub(false);
      setError("");
      reasonRef.current?.focus();
      reasonRef.current?.scrollIntoView({ block: "center" });
    },
    createInGitHub: async (branch) => {
      const problem = branchNameProblem(branch.name);
      if (problem) throw new Error(problem);
      const sha = repository.branches.find((entry) => entry.name === defaultBranch)?.commit?.sha;
      if (!sha) throw new Error("No se encontró la rama principal en GitHub.");
      await createGitHubBranch(repoPath, branch.name, sha, github.token);
      await repository.refresh();
    },
    deleteInGitHub: async (branchName) => {
      await deleteGitHubBranch(repoPath, branchName, github.token);
      await repository.refresh();
    },
    removeEntry: async (branch, alsoGitHub) => {
      if (alsoGitHub && branch.github) await deleteGitHubBranch(repoPath, branch.name, github.token);
      if (branch.entry) await onRemove(branch.entry);
      if (alsoGitHub) await repository.refresh();
    },
  };

  const connectAction = location && github.status === "none" ? { label: connect.label, busy: connect.connecting, onClick: () => void connect.connect() } : null;
  const counts = { all: unified.length, cowork: unified.filter((branch) => branch.entry).length, github: unified.filter((branch) => branch.presence === "github").length, pulls: unified.filter((branch) => branch.pull).length };

  return (
    <section className="page-view" id="branch-log" data-page="branches-page">
      <PageHeading eyebrow="COLABORACIÓN DEL EQUIPO" title="Ramas y cambios" description="Las ramas del repositorio y del registro del equipo en una sola lista: qué existe en GitHub, quién trabaja en qué y qué tareas avanzan en cada rama." />
      {location && <RepositoryStrip
        url={location.url}
        label={repositoryLabel(project.repositoryUrl)}
        repo={repository.repo}
        repoReady={repository.repoReady}
        branchCount={repository.branches.length}
        branchesReady={repository.branchesReady}
        branchesTruncated={repository.branchesTruncated}
        updatedAt={repository.updatedAt}
        loading={repository.loading}
        token={github.token}
        onRefresh={() => void repository.refresh()}
        connect={connectAction}
      />}
      {connect.error && <p className="projectSettingsError" role="alert">{connect.error}</p>}

      <div className="branchesLayout">
        <section className="panel branchPanel" aria-labelledby="branch-title">
          <div className="panelHead"><div><p className="eyebrow">RAMAS</p><h2 id="branch-title">¿En qué estamos trabajando?</h2></div><span className="clockLabel">{listReady ? `${unified.length} ${unified.length === 1 ? "rama" : "ramas"}` : <Sk inline w="9ch" />}</span></div>
          {repository.branchError && listReady && <p className="branchGitHubNote">{repository.branchError}</p>}
          <div className="branchToolbar">
            <div className="branchFilters" role="group" aria-label="Filtrar ramas">
              {FILTERS.map((option) => <button key={option.id} type="button" className={`plain${filter === option.id ? " isActive" : ""}`} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}{listReady ? ` (${counts[option.id]})` : ""}</button>)}
            </div>
            <label className="branchSearch"><span className="visuallyHidden">Buscar ramas</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ramas" /></label>
          </div>
          <div className="branchList" aria-live="polite">
            {!listReady ? <BranchRowsSkeleton /> : visible.length
              ? visible.map((branch) => <BranchRow key={branch.key} branch={branch} actions={actions} expanded={expanded === branch.key} onToggle={() => setExpanded((current) => current === branch.key ? "" : branch.key)} />)
              : <p className="empty">{unified.length ? "Ninguna rama coincide con el filtro." : "Todavía no hay ramas. Registra la rama en la que vas a trabajar."}</p>}
          </div>
        </section>

        <aside className="panel branchFormPanel" aria-labelledby="branch-form-title">
          <div className="panelHead"><div><p className="eyebrow">REGISTRO DEL EQUIPO</p><h2 id="branch-form-title">Registrar una rama</h2></div></div>
          <form className="bf" onSubmit={addBranch}>
            <label className="controlField"><span>Nombre de la rama</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="feature/nombre-del-cambio" maxLength={120} required spellCheck={false} /></label>
            <label className="controlField"><span>Objetivo del cambio</span><textarea ref={reasonRef} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="¿Qué vas a implementar en esta rama?" maxLength={500} required /></label>
            {access.allowed && !repository.branches.some((branch) => sameBranch(branch.name, name)) && <div className="branchGitHubCreate">
              <label className="toggleRow"><input type="checkbox" checked={inGitHub} onChange={(event) => setInGitHub(event.target.checked)} /><span><strong>Crear también en GitHub</strong><small>Se crea en {repository.repo?.full_name ?? "el repositorio"} con tu cuenta de GitHub.</small></span></label>
              {inGitHub && <label className="controlField"><span>Desde la rama</span><select value={base} onChange={(event) => setBase(event.target.value)}>{repository.branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}</option>)}</select></label>}
            </div>}
            {accessNote && <p className="branchGitHubNote">{accessNote}{access.allowed === false && access.reason === "not-connected" && <> <button className="plain" type="button" onClick={() => void connect.connect()} disabled={connect.connecting}>{connect.connecting ? "Conectando GitHub…" : connect.label}</button></>}</p>}
            <div className="add"><button type="submit" disabled={saving}>{saving ? (createInGitHub ? "Creando rama…" : "Guardando…") : createInGitHub && !repository.branches.some((branch) => sameBranch(branch.name, name)) ? "Crear y registrar rama" : "Registrar rama"}</button></div>
            {error && <p className="projectSettingsError" role="alert">{error}</p>}
            {pendingRegister && <button className="ghost" type="button" onClick={() => void retryRegister()} disabled={saving}>Reintentar registro</button>}
          </form>
        </aside>
      </div>

      {location && <section className="panel repoCard recentChanges" aria-labelledby="recent-title">
        <div className="panelHead"><div><p className="eyebrow">HISTORIAL · {defaultBranch || "RAMA PRINCIPAL"}</p><h2 id="recent-title">Cambios recientes</h2></div><a className="plain repoHistoryLink" href={`${location.url}/commits`} target="_blank" rel="noreferrer">Ver historial ↗</a></div>
        {!repository.commitsReady ? <SkGroup className="repoList" label="Cargando cambios recientes">
          {repeat(5, (index) => <div className="repoCommitItem" key={index}><span className="repoCommitMessage"><Sk w={index % 2 ? "58%" : "76%"} /></span><span className="repoCommitMeta"><Sk w="42%" /></span></div>)}
        </SkGroup> : repository.commitError ? <p className="repoEmpty">{repository.commitError}</p> : repository.commits.length ? <div className="repoList">{repository.commits.map((commit) => {
          const date = commit.commit?.author?.date ?? commit.commit?.committer?.date;
          return <article className="repoCommitItem" key={commit.sha}><a className="repoCommitMessage" href={`${location.url}/commit/${commit.sha}`} target="_blank" rel="noreferrer">{commit.commit?.message?.split("\n")[0] || "Cambio sin descripción"}</a><div className="repoCommitMeta"><span>{commit.author?.login || commit.commit?.author?.name || "Colaborador"}</span><span aria-hidden="true">·</span><time dateTime={date}>{date ? relativeTime(date) : ""}</time><code>{commit.sha.slice(0, 7)}</code></div></article>;
        })}</div> : <p className="repoEmpty">No hay cambios recientes disponibles.</p>}
      </section>}
    </section>
  );
}
