import { useEffect, useState, type FormEvent } from "react";
import type { BranchEntry, PanelUser, Project } from "../types";
import { PageHeading } from "../components/PageHeading";
import { RepositoryCards } from "../features/repository/RepositoryCards";
import { useRepository } from "../features/repository/useRepository";
import { Sk } from "../components/Skeleton";
import { BranchListSkeleton } from "../components/PageSkeletons";
import { useGitHubSession, syncGitHubSession } from "../features/github/githubSession";
import { linkGitHubProvider, reconnectGitHub } from "../features/auth/panelAuth";
import { branchAccess, branchAccessMessage, branchWritePolicy, canDeleteBranch } from "../features/github/branchPermissions";
import { branchNameProblem } from "../features/github/githubRefs";
import { createBranch as createGitHubBranch, deleteBranch as deleteGitHubBranch } from "../features/github/githubApi";
import { githubRepository } from "../features/repository/githubRepository";

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : new Intl.DateTimeFormat("es-PA", { dateStyle: "medium", timeZone: "America/Panama" }).format(date);
}

/** Branch names match regardless of case, surrounding spaces and slashes vs. tildes (as the reward rules do). */
export function sameBranch(a: string, b: string) {
  const normal = (name: string) => name.trim().toLowerCase().replaceAll("/", "~");
  return normal(a) === normal(b);
}

export function BranchesPage({ project, branches, ready = true, user, isOwner, onSave, onRemove }: {
  project: Project;
  isOwner: boolean;
  branches: BranchEntry[];
  /** False until the team register has arrived. */
  ready?: boolean;
  user: PanelUser;
  onSave: (branch: BranchEntry) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const github = useGitHubSession(user);
  const repository = useRepository(project.repositoryUrl, github.status === "checking" ? null : github.token);
  const [connecting, setConnecting] = useState(false);
  const [inGitHub, setInGitHub] = useState(true);
  const [base, setBase] = useState("");
  const repoPath = githubRepository(project.repositoryUrl)?.path ?? "";
  const defaultBranch = repository.repo?.default_branch ?? "";
  const access = branchAccess({ hasRepository: Boolean(repoPath), githubStatus: github.status, repo: repository.repo, policy: branchWritePolicy(project), isOwner });
  const accessNote = branchAccessMessage(access);
  const createInGitHub = access.allowed && inGitHub;

  // New branches start from the default branch unless the person picks another one.
  useEffect(() => {
    if (!repository.branches.some((branch) => branch.name === base)) setBase(defaultBranch || repository.branches[0]?.name || "");
  }, [base, defaultBranch, repository.branches]);

  async function connectGitHub() {
    if (connecting) return;
    setConnecting(true);
    setError("");
    try {
      if (await (github.linked ? reconnectGitHub() : linkGitHubProvider())) syncGitHubSession(user.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo conectar GitHub.");
    } finally { setConnecting(false); }
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
    let baseSha = "";
    if (createInGitHub) {
      const problem = branchNameProblem(cleanName);
      if (problem) { setError(problem); return; }
      if (repository.branches.some((branch) => branch.name === cleanName)) {
        setError(`La rama «${cleanName}» ya existe en GitHub. Desmarca «Crear también en GitHub» para solo registrarla.`);
        return;
      }
      baseSha = repository.branches.find((branch) => branch.name === base)?.commit?.sha ?? "";
      if (!baseSha) { setError("Elige la rama de GitHub desde la que empieza la nueva rama."); return; }
    }
    setSaving(true);
    setError("");
    // GitHub first: if it refuses, nothing is registered in Cowork.
    if (createInGitHub) {
      try { await createGitHubBranch(repoPath, cleanName, baseSha, github.token); }
      catch (reason) {
        setError(reason instanceof Error ? reason.message : "GitHub no pudo crear la rama.");
        setSaving(false);
        return;
      }
      void repository.refresh();
    }
    try {
      await onSave({ id: `branch-${Date.now()}`, name: cleanName, reason: cleanReason, by: user.name, createdAt: new Date().toISOString(), ...(createInGitHub ? { githubCreated: true } : {}) });
      // The form keeps what was typed until the save is confirmed.
      setName("");
      setReason("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "No se pudo registrar la rama.";
      setError(createInGitHub ? `La rama se creó en GitHub, pero no se pudo registrar en Cowork: ${message}` : message);
    } finally {
      setSaving(false);
    }
  }

  async function removeFromGitHub(branchName: string) {
    await deleteGitHubBranch(repoPath, branchName, github.token);
    await repository.refresh();
  }

  async function remove(branch: BranchEntry) {
    setError("");
    try { await onRemove(branch.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo eliminar el registro."); }
  }

  return (
    <section className="page-view" id="branch-log" data-page="branches-page">
      <PageHeading eyebrow="COLABORACIÓN DEL EQUIPO" title="Ramas y cambios" description="Revisa lo que ya existe en GitHub y registra el trabajo en curso para que todos sepan qué se está construyendo." />
      {project.repositoryUrl && <RepositoryCards repositoryUrl={project.repositoryUrl} {...repository} onRefresh={() => void repository.refresh()} connect={github.status === "none" ? { label: github.linked ? "Reconectar GitHub" : "Conectar GitHub", busy: connecting, onClick: () => void connectGitHub() } : null} branchActions={access.allowed ? { canDelete: (branch) => canDeleteBranch(access, branch, defaultBranch), onDelete: removeFromGitHub } : null} />}
      <section className="panel branchPanel" aria-labelledby="branch-title">
        <div className="panelHead"><div><p className="eyebrow">REGISTRO DEL EQUIPO</p><h2 id="branch-title">¿En qué estamos trabajando?</h2></div><span className="clockLabel">{ready ? `${branches.length} ${branches.length === 1 ? "registro" : "registros"}` : <Sk inline w="9ch" />}</span></div>
        <p className="panelIntro">El registro compartido ayuda a coordinarse; los datos de GitHub se consultan directamente desde el repositorio.</p>
        <div className="branchGrid">
          <div className="branchForm">
            <form className="bf" onSubmit={addBranch}>
              <label className="controlField"><span>Nombre de la rama</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="feature/nombre-del-cambio" maxLength={120} required /></label>
              <label className="controlField"><span>Objetivo del cambio</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="¿Qué vas a implementar en esta rama?" maxLength={500} required /></label>
              {access.allowed && <div className="branchGitHubCreate">
                <label className="toggleRow"><input type="checkbox" checked={inGitHub} onChange={(event) => setInGitHub(event.target.checked)} /><span><strong>Crear también en GitHub</strong><small>Se crea en {repository.repo?.full_name ?? "el repositorio"} con tu cuenta de GitHub.</small></span></label>
                {inGitHub && <label className="controlField"><span>Desde la rama</span><select value={base} onChange={(event) => setBase(event.target.value)}>{repository.branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}</option>)}</select></label>}
              </div>}
              {accessNote && <p className="branchGitHubNote">{accessNote}{access.allowed === false && access.reason === "not-connected" && <> <button className="plain" type="button" onClick={() => void connectGitHub()} disabled={connecting}>{connecting ? "Conectando GitHub…" : github.linked ? "Reconectar GitHub" : "Conectar GitHub"}</button></>}</p>}
              <div className="add"><button type="submit" disabled={saving}>{saving ? (createInGitHub ? "Creando rama…" : "Guardando…") : createInGitHub ? "Crear y registrar rama" : "Registrar rama"}</button></div>
              {error && <p className="projectSettingsError" role="alert">{error}</p>}
            </form>
          </div>
          <div className="branchList" aria-live="polite">
            {!ready ? <BranchListSkeleton /> : branches.length ? branches.map((branch) => <article className="branch" key={branch.id}><code>{branch.name}</code>{branch.githubCreated && <span className="branchGitHubTag">en GitHub</span>}<button className="plain" type="button" onClick={() => void remove(branch)} aria-label={`Eliminar registro de ${branch.name}`}>Eliminar</button><p>{branch.reason}</p><p className="tag"><span>{branch.by || "Equipo"}</span><span aria-hidden="true">·</span><time dateTime={branch.createdAt}>{dateLabel(branch.createdAt)}</time></p></article>) : <p className="empty">Todavía no hay ramas registradas por el equipo. Añade la rama en la que vas a trabajar.</p>}
          </div>
        </div>
      </section>
    </section>
  );
}
