import { describe, expect, test } from "vitest";
import { describeGitHubFailure } from "../../src/features/github/githubApi";
import { branchAccess, branchAccessMessage, branchWritePolicy, canDeleteBranch } from "../../src/features/github/branchPermissions";
import { branchNameProblem, encodeBranchPath } from "../../src/features/github/githubRefs";

describe("branch names", () => {
  test("accepts ordinary branch names", () => {
    for (const name of ["main", "feature/login-github", "fix/issue-12", "release/2026.10", "équipe/ñandú"]) expect(branchNameProblem(name)).toBe("");
  });

  test("rejects what git check-ref-format refuses", () => {
    for (const name of ["", "   ", "con espacio", "a..b", "a~1", "a^", "a:b", "a?", "a*", "a[b", "a\\b", "@", "a@{1}", "/a", "a/", "a//b", "-a", "a.", ".a", "a/.b", "a.lock", "a/b.lock", "x".repeat(121)]) {
      expect(branchNameProblem(name), name).not.toBe("");
    }
  });

  test("encodes each path segment but keeps the slashes", () => {
    expect(encodeBranchPath("feature/añadir #1")).toBe("feature/a%C3%B1adir%20%231");
  });
});

describe("branch permissions", () => {
  const writable = { permissions: { push: true } };
  const base = { hasRepository: true, githubStatus: "ready" as const, repo: writable, policy: "owner" as const, isOwner: true };

  test("projects default to owner-only", () => {
    expect(branchWritePolicy({})).toBe("owner");
    expect(branchWritePolicy({ githubPolicy: { branchWrite: "members" } })).toBe("members");
  });

  test("owner / member × policy × GitHub push", () => {
    expect(branchAccess(base)).toEqual({ allowed: true });
    expect(branchAccess({ ...base, isOwner: false })).toEqual({ allowed: false, reason: "policy" });
    expect(branchAccess({ ...base, isOwner: false, policy: "members" })).toEqual({ allowed: true });
    expect(branchAccess({ ...base, repo: { permissions: { push: false } } })).toEqual({ allowed: false, reason: "no-push" });
    expect(branchAccess({ ...base, repo: {} })).toEqual({ allowed: false, reason: "no-push" });
    expect(branchAccess({ ...base, githubStatus: "none" })).toEqual({ allowed: false, reason: "not-connected" });
    expect(branchAccess({ ...base, githubStatus: "checking" })).toEqual({ allowed: false, reason: "checking" });
    expect(branchAccess({ ...base, repo: null })).toEqual({ allowed: false, reason: "checking" });
    expect(branchAccess({ ...base, hasRepository: false })).toEqual({ allowed: false, reason: "no-repository" });
  });

  test("the policy message wins over the connection state for members", () => {
    const access = branchAccess({ ...base, isOwner: false, githubStatus: "none" });
    expect(branchAccessMessage(access)).toMatch(/Solo el propietario/);
    expect(branchAccessMessage(branchAccess({ ...base, githubStatus: "checking" }))).toBe("");
  });

  test("default and protected branches are never deletable", () => {
    const access = branchAccess(base);
    expect(canDeleteBranch(access, { name: "feature/x" }, "main")).toBe(true);
    expect(canDeleteBranch(access, { name: "main" }, "main")).toBe(false);
    expect(canDeleteBranch(access, { name: "release", protected: true }, "main")).toBe(false);
    expect(canDeleteBranch(branchAccess({ ...base, isOwner: false }), { name: "feature/x" }, "main")).toBe(false);
  });
});
import { githubRepository, repositoryLabel } from "../../src/features/repository/githubRepository";

const headers = (values: Record<string, string> = {}) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });

describe("GitHub repository URLs", () => {
  test("accepts github.com repositories and exposes the owner/name path", () => {
    expect(githubRepository("https://github.com/equipo/cowork")).toEqual({ url: "https://github.com/equipo/cowork", path: "equipo/cowork" });
    expect(githubRepository("https://github.com/equipo/cowork.git")?.path).toBe("equipo/cowork");
    expect(repositoryLabel("https://github.com/equipo/cowork")).toBe("equipo/cowork");
  });

  test("rejects other hosts, deeper paths and unsafe names", () => {
    expect(githubRepository("https://gitlab.com/equipo/cowork")).toBeNull();
    expect(githubRepository("https://github.com/equipo/cowork/tree/main")).toBeNull();
    expect(githubRepository("https://github.com/equipo")).toBeNull();
    expect(githubRepository("https://github.com/equ%20ipo/cowork")).toBeNull();
    expect(githubRepository("no es una url")).toBeNull();
  });
});

describe("GitHub error messages", () => {
  test("401 asks to reconnect", () => {
    const error = describeGitHubFailure(401, headers(), "Bad credentials", true);
    expect(error.kind).toBe("unauthorized");
    expect(error.message).toMatch(/Vuelve a conectar/);
  });

  test("an exhausted rate limit is not a permission error", () => {
    const reset = String(Date.UTC(2026, 8, 29, 17, 5) / 1000);
    const anonymous = describeGitHubFailure(403, headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset }), "API rate limit exceeded", false);
    expect(anonymous.kind).toBe("rate-limited");
    expect(anonymous.message).toContain("12:05");
    expect(anonymous.message).toContain("Conectar GitHub");
    const signedIn = describeGitHubFailure(403, headers({ "x-ratelimit-remaining": "0" }), "", true);
    expect(signedIn.message).not.toContain("Conectar GitHub");
    expect(describeGitHubFailure(429, headers(), "", true).kind).toBe("rate-limited");
  });

  test("a plain 403 keeps GitHub's own explanation", () => {
    const error = describeGitHubFailure(403, headers({ "x-ratelimit-remaining": "4999" }), "Resource not accessible by integration", true);
    expect(error.kind).toBe("forbidden");
    expect(error.message).toBe("Resource not accessible by integration");
  });

  test("404 suggests connecting only when the request was anonymous", () => {
    expect(describeGitHubFailure(404, headers(), "Not Found", false).message).toMatch(/Si es privado, conecta/);
    expect(describeGitHubFailure(404, headers(), "Not Found", true).message).toMatch(/no tiene acceso/);
  });

  test("409 and 422 surface GitHub's message as a conflict", () => {
    const error = describeGitHubFailure(422, headers(), "Reference already exists", true);
    expect(error.kind).toBe("conflict");
    expect(error.message).toBe("Reference already exists");
  });
});
