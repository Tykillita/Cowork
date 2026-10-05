import { describe, expect, test } from "vitest";
import type { BranchEntry, GitHubPull, Task } from "../../src/types";
import { filterBranches, reconcileBranches } from "../../src/features/github/branchModel";
import { EMPTY_TASK_DETAILS } from "../../src/features/workboard/taskModel";

const entry = (id: string, name: string, createdAt: string, githubCreated = false): BranchEntry => ({ id, name, reason: `Objetivo ${name}`, by: "Ana", createdAt, ...(githubCreated ? { githubCreated } : {}) });
const task = (id: string, branch: string): Task => ({ id, order: 1, phase: "General", title: id, status: "Pendiente", assignee: "", assigneeUid: "", milestoneId: "", revision: 1, ...EMPTY_TASK_DETAILS, branch });
const pull = (number: number, head: string): GitHubPull => ({ number, title: `PR ${number}`, html_url: `https://github.com/a/b/pull/${number}`, head: { ref: head } });

describe("branch reconciliation", () => {
  const register = [entry("1", "Feature/Login", "2026-10-01T10:00:00.000Z"), entry("2", "feature/old", "2026-10-02T10:00:00.000Z", true), entry("3", "fix/typo", "2026-09-30T10:00:00.000Z")];
  const github = [{ name: "main", commit: { sha: "a" } }, { name: "feature/login", commit: { sha: "b" }, protected: true }, { name: "fix/typo" }, { name: "zeta" }, { name: "beta" }];

  test("the default first, then registered (newest first), then GitHub-only by name", () => {
    const list = reconcileBranches({ register, github, hasRepository: true, pulls: [], defaultBranch: "main", tasks: [] });
    expect(list.map((branch) => [branch.name, branch.presence])).toEqual([
      ["main", "github"],
      ["feature/old", "cowork"],
      ["feature/login", "both"],
      ["fix/typo", "both"],
      ["beta", "github"],
      ["zeta", "github"],
    ]);
  });

  test("names match ignoring case; created-from-Cowork branches gone from GitHub are flagged", () => {
    const list = reconcileBranches({ register, github, hasRepository: true, pulls: [], defaultBranch: "main", tasks: [] });
    const login = list.find((branch) => branch.entry?.id === "1")!;
    expect(login.github?.name).toBe("feature/login");
    expect(login.protected).toBe(true);
    expect(list.find((branch) => branch.entry?.id === "2")!.deletedInGitHub).toBe(true);
    expect(list.find((branch) => branch.entry?.id === "3")!.deletedInGitHub).toBe(false);
  });

  test("without GitHub data the register is shown as unknown; without a repository, as Cowork only", () => {
    expect(reconcileBranches({ register, github: null, hasRepository: true, pulls: [], defaultBranch: "", tasks: [] }).every((branch) => branch.presence === "unknown" && !branch.deletedInGitHub)).toBe(true);
    expect(reconcileBranches({ register, github: null, hasRepository: false, pulls: [], defaultBranch: "", tasks: [] }).every((branch) => branch.presence === "cowork" && !branch.deletedInGitHub)).toBe(true);
  });

  test("pull requests and tasks attach to their branch", () => {
    const list = reconcileBranches({ register, github, hasRepository: true, pulls: [pull(7, "feature/login")], defaultBranch: "main", tasks: [task("t1", "feature/LOGIN"), task("t2", "zeta"), task("t3", "")] });
    expect(list.find((branch) => branch.name === "feature/login")!.pull?.number).toBe(7);
    expect(list.find((branch) => branch.name === "feature/login")!.tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(list.find((branch) => branch.name === "zeta")!.tasks.map((t) => t.id)).toEqual(["t2"]);
  });

  test("filters", () => {
    const list = reconcileBranches({ register, github, hasRepository: true, pulls: [pull(7, "feature/login")], defaultBranch: "main", tasks: [] });
    expect(filterBranches(list, "cowork", "").map((branch) => branch.name)).toEqual(["feature/old", "feature/login", "fix/typo"]);
    expect(filterBranches(list, "github", "").map((branch) => branch.name)).toEqual(["main", "beta", "zeta"]);
    expect(filterBranches(list, "pulls", "").map((branch) => branch.name)).toEqual(["feature/login"]);
    expect(filterBranches(list, "all", "objetivo fix").map((branch) => branch.name)).toEqual(["fix/typo"]);
    expect(filterBranches(list, "all", "nada").map((branch) => branch.name)).toEqual([]);
    expect(filterBranches(list, "all", "typo").map((branch) => branch.name)).toEqual(["fix/typo"]);
  });
});
