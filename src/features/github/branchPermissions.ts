import type { GitHubBranch, GitHubBranchWrite, GitHubRepo, Project } from "../../types";

export function branchWritePolicy(project: Pick<Project, "githubPolicy">): GitHubBranchWrite {
  return project.githubPolicy?.branchWrite === "members" ? "members" : "owner";
}

export type BranchAccess =
  | { allowed: true }
  | { allowed: false; reason: "no-repository" | "not-connected" | "checking" | "policy" | "no-push" };

/**
 * Two checks: the project's policy in Cowork and the person's real permission
 * on GitHub (`permissions.push`, only present on authenticated requests).
 */
export function branchAccess({ hasRepository, githubStatus, repo, policy, isOwner }: {
  hasRepository: boolean;
  githubStatus: "none" | "checking" | "ready";
  repo: Pick<GitHubRepo, "permissions"> | null;
  policy: GitHubBranchWrite;
  isOwner: boolean;
}): BranchAccess {
  if (!hasRepository) return { allowed: false, reason: "no-repository" };
  if (policy === "owner" && !isOwner) return { allowed: false, reason: "policy" };
  if (githubStatus === "checking") return { allowed: false, reason: "checking" };
  if (githubStatus !== "ready") return { allowed: false, reason: "not-connected" };
  if (!repo) return { allowed: false, reason: "checking" };
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
    default: return "";
  }
}
