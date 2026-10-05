import type { GitHubBranch, GitHubBranchWrite, GitHubRepo, Project } from "../../types";

export function branchWritePolicy(project: Pick<Project, "githubPolicy">): GitHubBranchWrite {
  return project.githubPolicy?.branchWrite === "members" ? "members" : "owner";
}

export type BranchAccess =
  | { allowed: true }
  | { allowed: false; reason: "no-repository" | "not-connected" | "checking" | "policy" | "no-push" }
  | { allowed: false; reason: "repo-unavailable"; error: string };

/**
 * Two checks: the project's policy in Cowork and the person's real permission
 * on GitHub (`permissions.push`, only present on authenticated requests).
 */
export function branchAccess({ hasRepository, githubStatus, repo, repoError = "", policy, isOwner }: {
  hasRepository: boolean;
  githubStatus: "none" | "checking" | "ready";
  repo: Pick<GitHubRepo, "permissions"> | null;
  /** Why the repository could not be read; without it a missing repo means "still loading". */
  repoError?: string;
  policy: GitHubBranchWrite;
  isOwner: boolean;
}): BranchAccess {
  if (!hasRepository) return { allowed: false, reason: "no-repository" };
  if (policy === "owner" && !isOwner) return { allowed: false, reason: "policy" };
  if (githubStatus === "checking") return { allowed: false, reason: "checking" };
  if (githubStatus !== "ready") return { allowed: false, reason: "not-connected" };
  if (!repo) return repoError ? { allowed: false, reason: "repo-unavailable", error: repoError } : { allowed: false, reason: "checking" };
  if (!repo.permissions?.push) return { allowed: false, reason: "no-push" };
  return { allowed: true };
}

/** The default branch and protected branches are never deleted from Cowork. */
export function canDeleteBranch(access: BranchAccess, branch: Pick<GitHubBranch, "name" | "protected">, defaultBranch: string) {
  return access.allowed && branch.name !== defaultBranch && !branch.protected;
}

export function branchAccessMessage(access: BranchAccess) {
  if (access.allowed) return "";
  switch (access.reason) {
    case "policy": return "Solo el propietario puede crear o borrar ramas en GitHub desde este proyecto.";
    case "not-connected": return "Conecta GitHub para crear o borrar ramas del repositorio desde Cowork.";
    case "no-push": return "Tu cuenta de GitHub no tiene permiso de escritura en este repositorio.";
    case "repo-unavailable": return `No se pudo consultar el repositorio en GitHub. ${access.error}`;
    default: return "";
  }
}
