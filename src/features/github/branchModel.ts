import type { BranchEntry, GitHubBranch, GitHubPull, Task } from "../../types";

/** Branch names match regardless of case, surrounding spaces and slashes vs. tildes (as the reward rules do). */
export function sameBranch(a: string, b: string) {
  const normal = (name: string) => name.trim().toLowerCase().replaceAll("/", "~");
  return normal(a) === normal(b);
}

/**
 * - `both`: registered in Cowork and present on GitHub.
 * - `cowork`: only in the register (no repository, or not on GitHub).
 * - `github`: on GitHub but nobody registered it.
 * - `unknown`: registered, but GitHub could not be read.
 */
export type BranchPresence = "both" | "cowork" | "github" | "unknown";

export interface UnifiedBranch {
  key: string;
  name: string;
  presence: BranchPresence;
  entry: BranchEntry | null;
  github: GitHubBranch | null;
  isDefault: boolean;
  protected: boolean;
  /** Created in GitHub from Cowork and no longer there. */
  deletedInGitHub: boolean;
  pull: GitHubPull | null;
  tasks: Task[];
}

/**
 * One list out of the team register and the repository: the default branch
 * first, then registered branches (newest first), then GitHub-only ones by
 * name. `github` is null when the repository could not be read (or there is none).
 */
export function reconcileBranches({ register, github, hasRepository, pulls, defaultBranch, tasks }: {
  register: BranchEntry[];
  github: GitHubBranch[] | null;
  hasRepository: boolean;
  pulls: GitHubPull[];
  defaultBranch: string;
  tasks: Task[];
}): UnifiedBranch[] {
  const linkedTasks = (name: string) => tasks.filter((task) => task.branch && sameBranch(task.branch, name));
  const pullFor = (name: string) => pulls.find((pull) => pull.head?.ref && sameBranch(pull.head.ref, name)) ?? null;
  const used = new Set<string>();

  const registered = [...register]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((entry): UnifiedBranch => {
      const remote = github?.find((branch) => sameBranch(branch.name, entry.name)) ?? null;
      if (remote) used.add(remote.name);
      const presence: BranchPresence = remote ? "both" : !hasRepository ? "cowork" : github === null ? "unknown" : "cowork";
      return {
        key: `cowork:${entry.id}`,
        name: remote?.name ?? entry.name,
        presence,
        entry,
        github: remote,
        isDefault: Boolean(defaultBranch) && sameBranch(entry.name, defaultBranch),
        protected: Boolean(remote?.protected),
        deletedInGitHub: presence === "cowork" && hasRepository && Boolean(entry.githubCreated),
        pull: pullFor(entry.name),
        tasks: linkedTasks(entry.name),
      };
    });

  const remoteOnly = (github ?? [])
    .filter((branch) => !used.has(branch.name))
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((branch): UnifiedBranch => ({
      key: `github:${branch.name}`,
      name: branch.name,
      presence: "github",
      entry: null,
      github: branch,
      isDefault: branch.name === defaultBranch,
      protected: Boolean(branch.protected),
      deletedInGitHub: false,
      pull: pullFor(branch.name),
      tasks: linkedTasks(branch.name),
    }));

  const all = [...registered, ...remoteOnly];
  const main = all.filter((branch) => branch.isDefault);
  return [...main, ...all.filter((branch) => !branch.isDefault)];
}

export type BranchFilter = "all" | "cowork" | "github" | "pulls";

export function filterBranches(branches: UnifiedBranch[], filter: BranchFilter, query: string) {
  const text = query.trim().toLowerCase();
  return branches.filter((branch) => {
    if (filter === "cowork" && !branch.entry) return false;
    if (filter === "github" && branch.presence !== "github") return false;
    if (filter === "pulls" && !branch.pull) return false;
    if (text && !`${branch.name} ${branch.entry?.reason ?? ""}`.toLowerCase().includes(text)) return false;
    return true;
  });
}
