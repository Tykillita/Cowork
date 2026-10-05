import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { describeGitHubFailure, getBlobRaw, getRepo, githubFetch, listAllBranches, parseLinkHeader } from "../../src/features/github/githubApi";
import { clearGitHubCache, tokenFingerprint } from "../../src/features/github/githubCache";
import { branchAccess, branchAccessMessage, branchWritePolicy, canDeleteBranch } from "../../src/features/github/branchPermissions";
import { branchNameProblem, encodeBranchPath } from "../../src/features/github/githubRefs";
import { getRepositoryState, refreshRepository } from "../../src/features/repository/repositoryStore";

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

describe("GitHub client", () => {
  let calls: { url: string; headers: Record<string, string> }[];
  let respond: (url: string) => Response;

  beforeEach(() => {
    clearGitHubCache();
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return respond(url);
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); clearGitHubCache(); });

  const json = (body: unknown, extra: Record<string, string> = {}, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });
  const repo = { full_name: "a/b", default_branch: "main", private: false, html_url: "" };

  test("parses Link headers", () => {
    expect(parseLinkHeader('<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=5>; rel="last"')).toEqual({ next: "https://api.github.com/x?page=2", last: "https://api.github.com/x?page=5" });
    expect(parseLinkHeader(null)).toEqual({});
  });

  test("a fresh answer is reused and concurrent requests share one call", async () => {
    respond = () => json(repo, { etag: '"v1"' });
    const [first, second] = await Promise.all([getRepo("a/b", "t"), getRepo("a/b", "t")]);
    expect(first.full_name).toBe("a/b");
    expect(second.full_name).toBe("a/b");
    await getRepo("a/b", "t");
    expect(calls).toHaveLength(1);
  });

  test("a refresh sends If-None-Match and a 304 keeps the cached data", async () => {
    respond = () => json(repo, { etag: '"v1"' });
    await getRepo("a/b", "t");
    respond = () => new Response(null, { status: 304 });
    const again = await getRepo("a/b", "t", { refresh: true });
    expect(calls[1].headers["if-none-match"]).toBe('"v1"');
    expect(again.default_branch).toBe("main");
  });

  test("different accounts never share answers", async () => {
    respond = () => json(repo);
    await getRepo("a/b", "one");
    await getRepo("a/b", "two");
    expect(calls).toHaveLength(2);
    expect(tokenFingerprint("one")).not.toBe(tokenFingerprint("two"));
    expect(tokenFingerprint("")).toBe("anon");
  });

  test("blobs by SHA are fetched once and raw", async () => {
    respond = () => new Response(new TextEncoder().encode("hola"), { status: 200 });
    const first = await getBlobRaw("a/b", "abc", "t");
    await getBlobRaw("a/b", "abc", "t");
    expect(new TextDecoder().decode(first)).toBe("hola");
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.accept).toBe("application/vnd.github.raw+json");
  });

  test("follows branch pages and reports when it stops early", async () => {
    respond = (url) => {
      const page = Number(new URL(url).searchParams.get("page") || "1");
      const next = page < 3 ? { link: `<https://api.github.com/repos/a/b/branches?per_page=100&page=${page + 1}>; rel="next"` } : {};
      return json([{ name: `b${page}` }], next);
    };
    expect(await listAllBranches("a/b", "t")).toEqual({ branches: [{ name: "b1" }, { name: "b2" }, { name: "b3" }], truncated: false });
    clearGitHubCache();
    expect((await listAllBranches("a/b", "t", { maxPages: 2 })).truncated).toBe(true);
  });

  test("while rate limited, nothing else is sent until the reset", async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    respond = () => json({ message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }, 403);
    await expect(githubFetch("/repos/a/b", { token: "t" })).rejects.toMatchObject({ kind: "rate-limited" });
    await expect(githubFetch("/repos/a/b/branches", { token: "t" })).rejects.toMatchObject({ kind: "rate-limited" });
    expect(calls).toHaveLength(1);
  });

  test("a quota blocks requests but keeps fresh metadata and downloaded blobs readable", async () => {
    respond = (url) => url.includes("/git/blobs/")
      ? new Response(new TextEncoder().encode("hola"), { status: 200 })
      : json(repo);
    await getRepo("a/b", "t");
    await getBlobRaw("a/b", "abc", "t");
    const reset = Math.floor(Date.now() / 1000) + 600;
    respond = () => json({ message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }, 403);
    await expect(getRepo("a/b", "t", { refresh: true })).rejects.toMatchObject({ kind: "rate-limited" });
    const sent = calls.length;
    expect((await getRepo("a/b", "t")).default_branch).toBe("main");
    expect(new TextDecoder().decode(await getBlobRaw("a/b", "abc", "t"))).toBe("hola");
    await expect(getBlobRaw("a/b", "unread", "t")).rejects.toMatchObject({ kind: "rate-limited" });
    await expect(githubFetch("/repos/a/b", { method: "POST", token: "t", cache: "immutable" })).rejects.toMatchObject({ kind: "rate-limited" });
    expect(calls).toHaveLength(sent);
    // An unrelated account cannot use this account's cached blob.
    await expect(getBlobRaw("a/b", "abc", "other")).rejects.toMatchObject({ kind: "rate-limited" });
    expect(calls).toHaveLength(sent + 1);
  });

  test("a quota refresh preserves repository data, while access failures and resets clear it", async () => {
    respond = (url) => url.endsWith("/repos/a/b") ? json(repo)
      : json(url.includes("/branches?") ? [{ name: "main", commit: { sha: "abc" } }] : []);
    await refreshRepository("a/b", "t");
    const loaded = getRepositoryState("a/b");
    expect(loaded.repo?.default_branch).toBe("main");
    const reset = Math.floor(Date.now() / 1000) + 600;
    respond = () => json({ message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }, 403);
    await refreshRepository("a/b", "t", { refresh: true });
    expect(getRepositoryState("a/b")).toMatchObject({ repo: loaded.repo, branches: loaded.branches, loading: false, repoError: expect.stringContaining("límite de consultas") });
    clearGitHubCache();
    expect(getRepositoryState("a/b").repo).toBeNull();
    respond = (url) => url.endsWith("/repos/a/b") ? json(repo) : json([]);
    await refreshRepository("a/b", "t");
    respond = () => json({ message: "Not Found" }, {}, 404);
    await refreshRepository("a/b", "t", { refresh: true });
    expect(getRepositoryState("a/b").repo).toBeNull();
    expect(getRepositoryState("a/b").repoError).toContain("no tiene acceso");
  });
});

describe("repository access when GitHub fails", () => {
  test("a failed repository request is reported instead of waiting forever", () => {
    const access = branchAccess({ hasRepository: true, githubStatus: "ready", repo: null, repoError: "GitHub respondió 500.", policy: "owner", isOwner: true });
    expect(access).toEqual({ allowed: false, reason: "repo-unavailable", error: "GitHub respondió 500." });
    expect(branchAccessMessage(access)).toContain("GitHub respondió 500.");
  });
});
