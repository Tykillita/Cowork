import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubBranch } from "../../types";
import { compareRefs, getCommit, getTree } from "../github/githubApi";
import { buildTree, changeBadges, findNode, type ChangeBadge, type TreeNode } from "./repoTree";

export interface RepoTreeState {
  root: TreeNode | null;
  ready: boolean;
  error: string;
  /** GitHub cut the recursive listing: folders load when opened. */
  lazy: boolean;
  /** Folders whose content is being fetched. */
  loading: ReadonlySet<string>;
}

function message(reason: unknown, fallback: string) {
  if (reason && typeof reason === "object" && "status" in reason && (reason as { status: number }).status === 409) return "El repositorio todavía no tiene archivos.";
  return reason instanceof Error ? reason.message : fallback;
}

/**
 * Files of `ref` (a branch name or commit). The branch's commit comes from the
 * shared branch list when possible; trees are fetched by SHA, so they are
 * cached for good. Large repositories (truncated listing) load folder by folder.
 */
export function useRepoTree(repoPath: string, ref: string, token: string | null, branches: GitHubBranch[], branchesReady: boolean) {
  const [state, setState] = useState<RepoTreeState>({ root: null, ready: false, error: "", lazy: false, loading: new Set() });
  /** Bumped when a lazily loaded folder fills in (the root object stays the same). */
  const [version, setVersion] = useState(0);
  const request = useRef(0);
  const [nonce, setNonce] = useState(0);
  /** Same repository and ref: a reload or a moved branch keeps the tree on screen until the new one arrives. */
  const shown = useRef("");
  const branchSha = branches.find((branch) => branch.name === ref)?.commit?.sha ?? "";

  useEffect(() => {
    if (!repoPath || !ref || token === null || !branchesReady) return;
    const run = ++request.current;
    const key = `${repoPath}#${ref}`;
    const soft = key === shown.current;
    if (!soft) setState({ root: null, ready: false, error: "", lazy: false, loading: new Set() });
    shown.current = key;
    void (async () => {
      try {
        const sha = branchSha || (await getCommit(repoPath, ref, token || undefined)).sha;
        const full = await getTree(repoPath, sha, token || undefined, true);
        if (run !== request.current) return;
        if (!full.truncated) { setState({ root: buildTree(full.tree), ready: true, error: "", lazy: false, loading: new Set() }); return; }
        const top = await getTree(repoPath, sha, token || undefined, false);
        if (run !== request.current) return;
        const root = buildTree(top.tree);
        for (const node of root.children) if (node.kind === "folder") node.partial = true;
        setState({ root, ready: true, error: "", lazy: true, loading: new Set() });
      } catch (reason) {
        const error = message(reason, "No se pudieron cargar los archivos.");
        if (run === request.current) setState((current) => (soft && current.root ? { ...current, error } : { root: null, ready: true, error, lazy: false, loading: new Set() }));
      }
    })();
  }, [branchSha, branchesReady, nonce, ref, repoPath, token]);

  /** Reads the tree again (after the branch moved); open folders are reloaded by the caller. */
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  /** Lazy mode: fetch a folder's direct content the first time it is opened. */
  const loadFolder = useCallback(async (path: string) => {
    const root = state.root;
    if (!root || !state.lazy) return;
    const node = findNode(root, path);
    if (!node || node.kind !== "folder" || !node.partial || !node.sha) return;
    setState((current) => ({ ...current, loading: new Set(current.loading).add(path) }));
    try {
      const tree = await getTree(repoPath, node.sha, token || undefined, false);
      const loaded = buildTree(tree.tree, path);
      for (const child of loaded.children) if (child.kind === "folder") child.partial = true;
      node.children = loaded.children;
      node.partial = false;
      setVersion((version) => version + 1);
    } catch (reason) {
      setState((current) => ({ ...current, error: message(reason, "No se pudo abrir la carpeta.") }));
    } finally {
      setState((current) => { const loading = new Set(current.loading); loading.delete(path); return { ...current, loading }; });
    }
  }, [repoPath, state.lazy, state.root, token]);

  return { ...state, version, loadFolder, reload };
}

export interface BranchChanges {
  byFile: Map<string, ChangeBadge>;
  folderCounts: Map<string, number>;
  deleted: string[];
  /** GitHub lists at most 300 files per comparison. */
  incomplete: boolean;
  ready: boolean;
}

const NO_CHANGES: BranchChanges = { byFile: new Map(), folderCounts: new Map(), deleted: [], incomplete: false, ready: true };

/** Marks of what `ref` changed compared with the default branch. */
export function useBranchChanges(repoPath: string, base: string, ref: string, token: string | null): BranchChanges {
  const [changes, setChanges] = useState<BranchChanges>(NO_CHANGES);
  useEffect(() => {
    if (!repoPath || !base || !ref || base === ref || token === null) { setChanges(NO_CHANGES); return; }
    let active = true;
    setChanges({ ...NO_CHANGES, ready: false });
    compareRefs(repoPath, base, ref, token || undefined).then((compare) => {
      if (!active) return;
      const files = compare.files ?? [];
      const { byFile, folderCounts } = changeBadges(files);
      setChanges({ byFile, folderCounts, deleted: files.filter((file) => file.status === "removed").map((file) => file.filename), incomplete: files.length >= 300, ready: true });
    }).catch(() => { if (active) setChanges(NO_CHANGES); });
    return () => { active = false; };
  }, [base, ref, repoPath, token]);
  return changes;
}
