import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubBranch, GitHubCommit, GitHubRepo } from "../../types";
import { getRepo, listBranches, listCommits } from "../github/githubApi";
import { githubRepository } from "./githubRepository";

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

/**
 * Branches, recent commits and metadata of the project's repository. With a
 * GitHub token private repositories work and the rate limit is per account.
 * `null` means the token is still being checked, so nothing is requested yet.
 */
export function useRepository(repositoryUrl: string, token: string | null = "") {
  const repository = githubRepository(repositoryUrl);
  const path = repository?.path ?? "";
  const [repo, setRepo] = useState<GitHubRepo | null>(null);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [branchError, setBranchError] = useState("");
  const [commitError, setCommitError] = useState("");
  // One flag per source: false until its first answer (data or error) arrives.
  const [branchesReady, setBranchesReady] = useState(false);
  const [commitsReady, setCommitsReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestRef = useRef(0);

  // A different repository starts from placeholders; a new token keeps what is on screen.
  useEffect(() => {
    requestRef.current += 1;
    setRepo(null);
    setBranches([]);
    setCommits([]);
    setBranchError("");
    setCommitError("");
    setBranchesReady(false);
    setCommitsReady(false);
    setUpdatedAt(null);
    setLoading(false);
  }, [path]);

  const refresh = useCallback(async () => {
    if (!path || token === null) return;
    const request = ++requestRef.current;
    setLoading(true);
    const [repoResult, branchResult, commitResult] = await Promise.allSettled([
      getRepo(path, token || undefined),
      listBranches(path, token || undefined),
      listCommits(path, token || undefined),
    ]);
    if (request !== requestRef.current) return;

    setRepo(repoResult.status === "fulfilled" ? repoResult.value : null);

    if (branchResult.status === "fulfilled" && Array.isArray(branchResult.value)) { setBranches(branchResult.value); setBranchError(""); }
    else setBranchError(branchResult.status === "rejected" ? errorMessage(branchResult.reason, "No se pudieron cargar las ramas.") : "GitHub devolvió un formato inesperado para las ramas.");

    if (commitResult.status === "fulfilled" && Array.isArray(commitResult.value)) { setCommits(commitResult.value); setCommitError(""); }
    else setCommitError(commitResult.status === "rejected" ? errorMessage(commitResult.reason, "No se pudieron cargar los cambios.") : "GitHub devolvió un formato inesperado para los cambios.");

    setBranchesReady(true);
    setCommitsReady(true);
    if (branchResult.status === "fulfilled" || commitResult.status === "fulfilled") setUpdatedAt(new Date());
    setLoading(false);
  }, [path, token]);

  useEffect(() => {
    if (!path || token === null) return;
    void refresh();
    const interval = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 300_000);
    return () => window.clearInterval(interval);
  }, [refresh, path, token]);

  return { repo, branches, commits, branchError, commitError, branchesReady, commitsReady, loading, updatedAt, refresh };
}
