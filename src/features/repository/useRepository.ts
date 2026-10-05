import { useCallback, useEffect, useSyncExternalStore } from "react";
import { githubRepository } from "./githubRepository";
import { attachRepository, getRepositoryState, refreshRepository, subscribeRepository } from "./repositoryStore";

/**
 * Branches, recent commits, open pull requests and metadata of the project's
 * repository. With a GitHub token private repositories work and the rate limit
 * is per account. `null` means the token is still being checked, so nothing is
 * requested yet. Every view of the same repository shares one store.
 */
export function useRepository(repositoryUrl: string, token: string | null = "") {
  const path = githubRepository(repositoryUrl)?.path ?? "";
  const subscribe = useCallback((listener: () => void) => subscribeRepository(path, listener), [path]);
  const read = useCallback(() => getRepositoryState(path), [path]);
  const state = useSyncExternalStore(subscribe, read, read);

  useEffect(() => {
    if (!path || token === null) return;
    return attachRepository(path, token);
  }, [path, token]);

  const refresh = useCallback(async () => {
    if (!path || token === null) return;
    await refreshRepository(path, token, { refresh: true });
  }, [path, token]);

  return { ...state, refresh };
}
