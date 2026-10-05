import type { GitHubBranch, GitHubCommit, GitHubPull, GitHubRepo, GitHubTag } from "../../types";
import { GitHubError, getRepo, listAllBranches, listAllTags, listCommits, listPulls } from "../github/githubApi";
import { onGitHubReset } from "../github/githubCache";

/**
 * Repository data shared by every view of the open project (summary, branches,
 * code), so moving between them neither refetches nor goes back to skeletons.
 * One slot per repository path; each source has its own ready flag and error.
 */
export interface RepositoryState {
  repo: GitHubRepo | null;
  repoReady: boolean;
  repoError: string;
  branches: GitHubBranch[];
  branchesReady: boolean;
  branchError: string;
  /** More than the pages we read: the list is incomplete. */
  branchesTruncated: boolean;
  commits: GitHubCommit[];
  commitsReady: boolean;
  commitError: string;
  pulls: GitHubPull[];
  pullsReady: boolean;
  pullError: string;
  tags: GitHubTag[];
  tagsReady: boolean;
  tagsTruncated: boolean;
  loading: boolean;
  updatedAt: Date | null;
}

export const EMPTY_REPOSITORY: RepositoryState = {
  repo: null, repoReady: false, repoError: "",
  branches: [], branchesReady: false, branchError: "", branchesTruncated: false,
  commits: [], commitsReady: false, commitError: "",
  pulls: [], pullsReady: false, pullError: "",
  tags: [], tagsReady: false, tagsTruncated: false,
  loading: false, updatedAt: null,
};

const POLL_MS = 300_000;

interface Slot {
  state: RepositoryState;
  listeners: Set<() => void>;
  subscribers: number;
  token: string;
  request: number;
  timer: number | null;
}

const slots = new Map<string, Slot>();

function slotFor(path: string) {
  let slot = slots.get(path);
  if (!slot) {
    slot = { state: EMPTY_REPOSITORY, listeners: new Set(), subscribers: 0, token: "", request: 0, timer: null };
    slots.set(path, slot);
  }
  return slot;
}

function update(slot: Slot, patch: Partial<RepositoryState>) {
  slot.state = { ...slot.state, ...patch };
  slot.listeners.forEach((listener) => listener());
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

export function getRepositoryState(path: string) {
  return path ? slotFor(path).state : EMPTY_REPOSITORY;
}

export function subscribeRepository(path: string, listener: () => void) {
  if (!path) return () => undefined;
  const slot = slotFor(path);
  slot.listeners.add(listener);
  return () => { slot.listeners.delete(listener); };
}

/** Fetches every source; `refresh` asks GitHub even if the cached answer is still fresh. */
export async function refreshRepository(path: string, token: string, { refresh = false }: { refresh?: boolean } = {}) {
  if (!path) return;
  const slot = slotFor(path);
  slot.token = token;
  const request = ++slot.request;
  update(slot, { loading: true });
  const auth = token || undefined;
  const [repoResult, branchResult, commitResult, pullResult, tagResult] = await Promise.allSettled([
    getRepo(path, auth, { refresh }),
    listAllBranches(path, auth, { refresh }),
    listCommits(path, auth, { refresh }),
    listPulls(path, auth, { refresh }),
    listAllTags(path, auth, { refresh }),
  ]);
  if (request !== slot.request) return;
  const patch: Partial<RepositoryState> = { loading: false, repoReady: true, branchesReady: true, commitsReady: true, pullsReady: true, tagsReady: true };
  // Tags are optional: an error only leaves the list empty.
  if (tagResult.status === "fulfilled") { patch.tags = tagResult.value.tags; patch.tagsTruncated = tagResult.value.truncated; }

  if (repoResult.status === "fulfilled" && repoResult.value) { patch.repo = repoResult.value; patch.repoError = ""; }
  else {
    // A temporary quota failure must not erase the last successful repository.
    // Access failures still clear it, and an account reset clears the whole slot.
    const rateLimited = repoResult.status === "rejected" && repoResult.reason instanceof GitHubError && repoResult.reason.kind === "rate-limited";
    if (!rateLimited) patch.repo = null;
    patch.repoError = repoResult.status === "rejected" ? errorMessage(repoResult.reason, "No se pudo consultar el repositorio.") : "GitHub devolvió un formato inesperado para el repositorio.";
  }

  if (branchResult.status === "fulfilled") { patch.branches = branchResult.value.branches; patch.branchesTruncated = branchResult.value.truncated; patch.branchError = ""; }
  else patch.branchError = errorMessage(branchResult.reason, "No se pudieron cargar las ramas.");

  if (commitResult.status === "fulfilled" && Array.isArray(commitResult.value)) { patch.commits = commitResult.value; patch.commitError = ""; }
  else patch.commitError = commitResult.status === "rejected" ? errorMessage(commitResult.reason, "No se pudieron cargar los cambios.") : "GitHub devolvió un formato inesperado para los cambios.";

  if (pullResult.status === "fulfilled" && Array.isArray(pullResult.value)) { patch.pulls = pullResult.value; patch.pullError = ""; }
  else patch.pullError = pullResult.status === "rejected" ? errorMessage(pullResult.reason, "No se pudieron cargar los pull requests.") : "GitHub devolvió un formato inesperado para los pull requests.";

  if (branchResult.status === "fulfilled" || commitResult.status === "fulfilled") patch.updatedAt = new Date();
  update(slot, patch);
}

/**
 * A view starts using the repository. The first one starts a 5-minute refresh
 * that only runs while the tab is visible; the last one to leave stops it.
 */
export function attachRepository(path: string, token: string) {
  if (!path) return () => undefined;
  const slot = slotFor(path);
  slot.subscribers += 1;
  void refreshRepository(path, token);
  if (slot.timer === null && typeof window !== "undefined") {
    slot.timer = window.setInterval(() => {
      if (!document.hidden) void refreshRepository(path, slot.token);
    }, POLL_MS);
  }
  return () => {
    slot.subscribers -= 1;
    if (slot.subscribers <= 0 && slot.timer !== null) {
      window.clearInterval(slot.timer);
      slot.timer = null;
    }
  };
}

// Signing out, unlinking or a revoked token: nothing from the previous account stays on screen.
onGitHubReset(() => {
  for (const slot of slots.values()) {
    slot.request += 1;
    update(slot, EMPTY_REPOSITORY);
  }
});
