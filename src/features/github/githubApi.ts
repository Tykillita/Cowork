import type { GitHubBranch, GitHubCommit, GitHubCompare, GitHubPull, GitHubRepo, GitHubTag, GitHubTree } from "../../types";
import { encodeBranchPath } from "./githubRefs";
import { rejectGitHubToken } from "./githubSession";
import { blockedRateLimit, cacheKey, dedupe, invalidateRepo, isFresh, readEntry, recordRateLimit, tokenFingerprint, writeEntry, type CacheEntry } from "./githubCache";

const API = "https://api.github.com";
const JSON_ACCEPT = "application/vnd.github+json";
const RAW_ACCEPT = "application/vnd.github.raw+json";

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

/** `<https://api.github.com/...?page=2>; rel="next", <...>; rel="last"` → `{ next, last }`. */
export function parseLinkHeader(value: string | null): Record<string, string> {
  const links: Record<string, string> = {};
  if (!value) return links;
  for (const part of value.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?([^";]+)"?/);
    if (match) links[match[2]] = match[1];
  }
  return links;
}

export interface GitHubResponse<T> {
  data: T;
  status: number;
  link: Record<string, string>;
  /** Served from this tab's cache (fresh, or confirmed by a 304). */
  cached: boolean;
}

/**
 * `none`: always ask GitHub. `revalidate`: reuse a fresh answer, otherwise ask
 * with `If-None-Match`. `refresh`: always ask, still with `If-None-Match`.
 * `immutable`: content addressed by SHA, asked once.
 */
export type GitHubCacheMode = "none" | "revalidate" | "refresh" | "immutable";

export interface GitHubFetchOptions {
  method?: string;
  body?: unknown;
  token?: string;
  accept?: string;
  as?: "json" | "arrayBuffer" | "text";
  cache?: GitHubCacheMode;
}

function fromEntry<T>(entry: CacheEntry, status = 200): GitHubResponse<T> {
  return { data: entry.data as T, status, link: entry.link, cached: true };
}

function rateLimitedError(reset: number, authenticated: boolean) {
  const headers = new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) });
  return describeGitHubFailure(403, headers, "", authenticated);
}

/** Every GitHub call goes through here: errors in Spanish, cache, rate limit and 401 handling. */
export async function githubFetch<T>(path: string, options: GitHubFetchOptions = {}): Promise<GitHubResponse<T>> {
  const { method = "GET", token = "", accept = JSON_ACCEPT, cache = "none" } = options;
  const fingerprint = tokenFingerprint(token);
  const key = cacheKey(fingerprint, accept, path);
  const entry = method === "GET" && cache !== "none" ? readEntry(key) : undefined;
  // The quota limits network calls, not files already downloaded in this tab.
  if (entry && cache !== "refresh" && isFresh(entry)) return fromEntry<T>(entry);
  const blocked = blockedRateLimit(fingerprint);
  if (blocked) throw rateLimitedError(blocked.reset, Boolean(token));
  if (method !== "GET" || cache === "none") return send<T>(path, options, fingerprint, null);
  return dedupe(key, () => send<T>(path, options, fingerprint, { key, previous: entry ?? null }));
}

async function send<T>(path: string, options: GitHubFetchOptions, fingerprint: string, cached: { key: string; previous: CacheEntry | null } | null): Promise<GitHubResponse<T>> {
  const { method = "GET", body, token = "", accept = JSON_ACCEPT, as = "json", cache = "none" } = options;
  const headers: Record<string, string> = { accept, "x-github-api-version": "2022-11-28" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const conditional = cached?.previous?.etag && !cached.previous.immutable ? cached.previous.etag : "";
  if (conditional) headers["if-none-match"] = conditional;
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // With our own If-None-Match the 304 must reach this code, not the browser cache.
      cache: cached ? "no-store" : "no-cache",
    });
  } catch {
    throw new GitHubError("No se pudo conectar con GitHub. Revisa tu conexión.", "network", 0);
  }
  recordRateLimit(fingerprint, response.headers);
  if (response.status === 304 && cached?.previous) {
    const refreshed = { ...cached.previous, at: Date.now() };
    writeEntry(cached.key, refreshed);
    return fromEntry<T>(refreshed, 304);
  }
  if (response.status === 204) return { data: undefined as T, status: 204, link: {}, cached: false };
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    if (response.status === 401 && token) rejectGitHubToken(token);
    const message = (payload as { message?: unknown }).message;
    throw describeGitHubFailure(response.status, response.headers, typeof message === "string" ? message : "", Boolean(token));
  }
  const link = parseLinkHeader(response.headers.get("link"));
  let data: unknown;
  let bytes: number;
  if (as === "arrayBuffer") {
    const buffer = await response.arrayBuffer();
    data = buffer;
    bytes = buffer.byteLength;
  } else if (as === "text") {
    const text = await response.text();
    data = text;
    bytes = text.length * 2;
  } else {
    data = await response.json().catch(() => ({}));
    bytes = Number(response.headers.get("content-length")) || 2048;
  }
  if (cached) {
    writeEntry(cached.key, { path, etag: response.headers.get("etag") ?? "", data, link, at: Date.now(), bytes, immutable: cache === "immutable" });
  }
  return { data: data as T, status: response.status, link, cached: false };
}

/** JSON body only; kept for callers that need nothing else. */
export async function githubRequest<T>(path: string, options: { method?: string; body?: unknown; token?: string; cache?: GitHubCacheMode } = {}): Promise<T> {
  return (await githubFetch<T>(path, options)).data;
}

/** `owner/name` path segment, already validated by `githubRepository`. */
export type RepoPath = string;

type ReadOptions = { refresh?: boolean };

function readMode(options?: ReadOptions): GitHubCacheMode {
  return options?.refresh ? "refresh" : "revalidate";
}

export function getRepo(repo: RepoPath, token?: string, options?: ReadOptions) {
  return githubRequest<GitHubRepo>(`/repos/${repo}`, { token, cache: readMode(options) });
}

export function listBranches(repo: RepoPath, token?: string, options?: ReadOptions) {
  return githubRequest<GitHubBranch[]>(`/repos/${repo}/branches?per_page=100`, { token, cache: readMode(options) });
}

/** Every page of a list endpoint, following `Link: rel="next"` up to `maxPages` pages. */
async function listPages<T>(first: string, token: string | undefined, { maxPages, refresh, what }: { maxPages: number; refresh: boolean; what: string }) {
  const items: T[] = [];
  let path: string | null = first;
  let pages = 0;
  while (path && pages < maxPages) {
    const page: GitHubResponse<T[]> = await githubFetch<T[]>(path, { token, cache: refresh ? "refresh" : "revalidate" });
    if (!Array.isArray(page.data)) throw new GitHubError(`GitHub devolvió un formato inesperado para ${what}.`, "unknown", page.status);
    items.push(...page.data);
    pages += 1;
    path = page.link.next ? page.link.next.replace(API, "") : null;
  }
  return { items, truncated: Boolean(path) };
}

/** Follows `Link: rel="next"` up to `maxPages` pages of 100 branches. */
export async function listAllBranches(repo: RepoPath, token?: string, { maxPages = 10, refresh = false }: { maxPages?: number; refresh?: boolean } = {}) {
  const { items, truncated } = await listPages<GitHubBranch>(`/repos/${repo}/branches?per_page=100`, token, { maxPages, refresh, what: "las ramas" });
  return { branches: items, truncated };
}

/** Tags, newest first as GitHub lists them, up to `maxPages` pages of 100. */
export async function listAllTags(repo: RepoPath, token?: string, { maxPages = 5, refresh = false }: { maxPages?: number; refresh?: boolean } = {}) {
  const { items, truncated } = await listPages<GitHubTag>(`/repos/${repo}/tags?per_page=100`, token, { maxPages, refresh, what: "las etiquetas" });
  return { tags: items, truncated };
}

/** Recent commits of `sha` (a branch name or commit), or of the default branch. */
export function listCommits(repo: RepoPath, token?: string, { sha = "", perPage = 8, refresh = false }: { sha?: string; perPage?: number; refresh?: boolean } = {}) {
  const ref = sha ? `&sha=${encodeURIComponent(sha)}` : "";
  return githubRequest<GitHubCommit[]>(`/repos/${repo}/commits?per_page=${perPage}${ref}`, { token, cache: refresh ? "refresh" : "revalidate" });
}

/** One commit; resolves a branch or tag name to its SHA and tree. */
export function getCommit(repo: RepoPath, ref: string, token?: string) {
  return githubRequest<GitHubCommit>(`/repos/${repo}/commits/${encodeBranchPath(ref)}`, { token, cache: "revalidate" });
}

export function listPulls(repo: RepoPath, token?: string, options?: ReadOptions) {
  return githubRequest<GitHubPull[]>(`/repos/${repo}/pulls?state=open&per_page=100`, { token, cache: readMode(options) });
}

export function compareRefs(repo: RepoPath, base: string, head: string, token?: string) {
  return githubRequest<GitHubCompare>(`/repos/${repo}/compare/${encodeBranchPath(base)}...${encodeBranchPath(head)}`, { token, cache: "revalidate" });
}

/** A tree by SHA never changes, so it is asked for once per tab. */
export function getTree(repo: RepoPath, sha: string, token?: string, recursive = true) {
  return githubRequest<GitHubTree>(`/repos/${repo}/git/trees/${encodeURIComponent(sha)}${recursive ? "?recursive=1" : ""}`, { token, cache: "immutable" });
}

/** Raw bytes of a file by its blob SHA. */
export async function getBlobRaw(repo: RepoPath, sha: string, token?: string) {
  return (await githubFetch<ArrayBuffer>(`/repos/${repo}/git/blobs/${encodeURIComponent(sha)}`, { token, accept: RAW_ACCEPT, as: "arrayBuffer", cache: "immutable" })).data;
}

function contentsPath(repo: RepoPath, path: string) {
  return `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** SHA of the file at `path` on `ref`, or "" when it does not exist there (needed to overwrite it). */
export async function getContentSha(repo: RepoPath, path: string, ref: string, token: string) {
  try {
    const answer = await githubRequest<{ sha?: string; type?: string }>(`${contentsPath(repo, path)}?ref=${encodeURIComponent(ref)}`, { token });
    return answer && !Array.isArray(answer) && answer.type === "file" && answer.sha ? answer.sha : "";
  } catch (reason) {
    if (reason instanceof GitHubError && reason.kind === "not-found") return "";
    throw reason;
  }
}

/** Creates or replaces a file with one commit on `branch` (`PUT /contents`). `base64` is the file's content. */
export async function putFile(repo: RepoPath, { path, base64, message, branch, sha }: { path: string; base64: string; message: string; branch: string; sha?: string }, token: string) {
  const answer = await githubRequest<{ commit?: { sha?: string; html_url?: string } }>(contentsPath(repo, path), {
    method: "PUT",
    body: { message, content: base64, branch, ...(sha ? { sha } : {}) },
    token,
  });
  invalidateRepo(repo);
  return answer;
}

/** Creates `refs/heads/<name>` pointing at `sha` (the tip of the chosen base branch). */
export async function createBranch(repo: RepoPath, name: string, sha: string, token: string) {
  const created = await githubRequest<{ ref: string }>(`/repos/${repo}/git/refs`, { method: "POST", body: { ref: `refs/heads/${name}`, sha }, token });
  invalidateRepo(repo);
  return created;
}

export async function deleteBranch(repo: RepoPath, name: string, token: string) {
  await githubRequest<void>(`/repos/${repo}/git/refs/heads/${encodeBranchPath(name)}`, { method: "DELETE", token });
  invalidateRepo(repo);
}
