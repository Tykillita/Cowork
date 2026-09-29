import type { GitHubBranch, GitHubCommit, GitHubRepo } from "../../types";
import { encodeBranchPath } from "./githubRefs";
import { rejectGitHubToken } from "./githubSession";

const API = "https://api.github.com";

export type GitHubErrorKind = "unauthorized" | "rate-limited" | "forbidden" | "not-found" | "conflict" | "network" | "unknown";

export class GitHubError extends Error {
  constructor(message: string, readonly kind: GitHubErrorKind, readonly status: number) {
    super(message);
    this.name = "GitHubError";
  }
}

function resetTime(resetHeader: string | null) {
  const seconds = Number(resetHeader);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return new Intl.DateTimeFormat("es-PA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Panama" }).format(new Date(seconds * 1000));
}

/** Turns a failed GitHub response into a Spanish message the panels can show as is. */
export function describeGitHubFailure(status: number, headers: Pick<Headers, "get">, apiMessage: string, authenticated: boolean): GitHubError {
  if (status === 401) return new GitHubError("GitHub rechazó la conexión. Vuelve a conectar tu cuenta de GitHub.", "unauthorized", status);
  const remaining = headers.get("x-ratelimit-remaining");
  if ((status === 403 || status === 429) && (remaining === "0" || status === 429)) {
    const at = resetTime(headers.get("x-ratelimit-reset"));
    const retry = at ? ` Vuelve a intentarlo a las ${at}.` : " Vuelve a intentarlo en unos minutos.";
    const hint = authenticated ? "" : " Conectar GitHub amplía el límite.";
    return new GitHubError(`GitHub alcanzó su límite de consultas.${retry}${hint}`, "rate-limited", status);
  }
  if (status === 403) return new GitHubError(apiMessage || "GitHub no permite esta acción con tu cuenta.", "forbidden", status);
  if (status === 404) {
    return new GitHubError(authenticated
      ? "GitHub no encontró el repositorio o tu cuenta no tiene acceso a él."
      : "GitHub no encontró el repositorio. Si es privado, conecta tu cuenta de GitHub para verlo.", "not-found", status);
  }
  if (status === 409 || status === 422) return new GitHubError(apiMessage || "GitHub rechazó el cambio.", "conflict", status);
  return new GitHubError(apiMessage || `GitHub respondió ${status}.`, "unknown", status);
}

export async function githubRequest<T>(path: string, { method = "GET", body, token = "" }: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-cache" });
  } catch {
    throw new GitHubError("No se pudo conectar con GitHub. Revisa tu conexión.", "network", 0);
  }
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) rejectGitHubToken(token);
    const message = (payload as { message?: unknown }).message;
    throw describeGitHubFailure(response.status, response.headers, typeof message === "string" ? message : "", Boolean(token));
  }
  return payload as T;
}

/** `owner/name` path segment, already validated by `githubRepository`. */
export type RepoPath = string;

export function getRepo(repo: RepoPath, token?: string) {
  return githubRequest<GitHubRepo>(`/repos/${repo}`, { token });
}

export function listBranches(repo: RepoPath, token?: string) {
  return githubRequest<GitHubBranch[]>(`/repos/${repo}/branches?per_page=100`, { token });
}

export function listCommits(repo: RepoPath, token?: string) {
  return githubRequest<GitHubCommit[]>(`/repos/${repo}/commits?per_page=8`, { token });
}

/** Creates `refs/heads/<name>` pointing at `sha` (the tip of the chosen base branch). */
export function createBranch(repo: RepoPath, name: string, sha: string, token: string) {
  return githubRequest<{ ref: string }>(`/repos/${repo}/git/refs`, { method: "POST", body: { ref: `refs/heads/${name}`, sha }, token });
}

export function deleteBranch(repo: RepoPath, name: string, token: string) {
  return githubRequest<void>(`/repos/${repo}/git/refs/heads/${encodeBranchPath(name)}`, { method: "DELETE", token });
}
