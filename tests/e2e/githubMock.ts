import type { Page } from "@playwright/test";
import type { TestAccount } from "./helpers";

// GitHub is never contacted: every api.github.com request is answered here.
export const REPO = "equipo/cowork";

export type FakeBranch = { name: string; sha: string; protected?: boolean };
export type FakeCommit = { sha: string; message: string; author: string; date: string };
export type FakePull = { number: number; title: string; head: string; draft?: boolean };
export type FakeFile = { path: string; content: string | Uint8Array };
export type FakeTag = { name: string; sha: string };
export type FakeUpload = { path: string; branch: string; message: string; content: string; sha?: string };

export type FakeGitHub = {
  branches: FakeBranch[];
  commits: FakeCommit[];
  /** Commits of one branch (`/commits?sha=`); falls back to `commits`. */
  branchCommits: Record<string, FakeCommit[]>;
  pulls: FakePull[];
  /** `compare/main...<head>` answers. */
  compare: Record<string, { ahead: number; behind: number; files?: { filename: string; status: string; previous_filename?: string }[] }>;
  /** Files per branch for trees and blobs. */
  files: Record<string, FakeFile[]>;
  truncatedTree: boolean;
  tags: FakeTag[];
  /** Files written with `PUT /contents` (content decoded from base64). */
  uploaded: FakeUpload[];
  created: { ref: string; sha: string }[];
  deleted: string[];
  push: boolean;
  repoStatus: number;
  /** Branch pages of this size, linked with `Link: rel="next"`. */
  branchPageSize: number;
  rateLimited: boolean;
  /** Requests that reached the mock, as "METHOD /path?query". */
  requests: string[];
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, accept, content-type, x-github-api-version, if-none-match",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-expose-headers": "x-oauth-scopes, x-ratelimit-remaining, x-ratelimit-reset, x-ratelimit-limit, etag, link",
};

const encoder = new TextEncoder();
function bytesOf(content: string | Uint8Array) {
  return typeof content === "string" ? encoder.encode(content) : content;
}
/** Stable fake SHA for a file's content on a branch. */
function blobSha(branch: string, path: string) {
  let hash = 0;
  for (const char of `${branch}:${path}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash.toString(16).padStart(8, "0").repeat(5);
}

export async function fakeGitHub(page: Page, accounts: TestAccount[], { push = true, token = true }: { push?: boolean; token?: boolean } = {}): Promise<FakeGitHub> {
  const state: FakeGitHub = {
    branches: [{ name: "main", sha: "a".repeat(40) }, { name: "release", sha: "b".repeat(40), protected: true }, { name: "feature/vieja", sha: "c".repeat(40) }],
    commits: [],
    branchCommits: {},
    pulls: [],
    compare: {},
    files: {},
    truncatedTree: false,
    tags: [],
    uploaded: [],
    created: [],
    deleted: [],
    push,
    repoStatus: 200,
    branchPageSize: 100,
    rateLimited: false,
    requests: [],
  };
  // The token lives in the tab's sessionStorage, as after a real GitHub sign-in.
  if (token) await page.addInitScript((uids) => { for (const uid of uids) sessionStorage.setItem(`cowork.github.${uid}`, "gho_prueba"); }, accounts.map((account) => account.uid));
  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    state.requests.push(`${request.method()} ${path}${url.search}`);
    if (state.rateLimited) return json(403, { message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0", "x-ratelimit-limit": "5000", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1800) });
    const commitsJson = (list: FakeCommit[]) => list.map((commit) => ({ sha: commit.sha, commit: { message: commit.message, author: { name: commit.author, date: commit.date } }, author: { login: commit.author } }));
    const prefix = `/repos/${REPO}`;

    if (path === "/user") return json(200, { login: "ana-gh", avatar_url: "" }, { "x-oauth-scopes": "repo, read:user, user:email" });
    if (path === prefix && state.repoStatus !== 200) return json(state.repoStatus, { message: "Server Error" });
    if (path === prefix) {
      const etag = `"repo-${state.push}"`;
      if (request.headers()["if-none-match"] === etag) return route.fulfill({ status: 304, headers: { ...CORS, etag } });
      return json(200, { full_name: REPO, default_branch: "main", private: true, html_url: `https://github.com/${REPO}`, permissions: { push: state.push } }, { etag });
    }
    if (path === `${prefix}/branches`) {
      const size = state.branchPageSize;
      const pageNumber = Number(url.searchParams.get("page") || "1");
      const slice = state.branches.slice((pageNumber - 1) * size, pageNumber * size);
      const more = pageNumber * size < state.branches.length;
      return json(200, slice.map((branch) => ({ name: branch.name, commit: { sha: branch.sha }, protected: Boolean(branch.protected) })), more ? { link: `<https://api.github.com${prefix}/branches?per_page=100&page=${pageNumber + 1}>; rel="next"` } : {});
    }
    if (path === `${prefix}/tags`) return json(200, state.tags.map((tag) => ({ name: tag.name, commit: { sha: tag.sha } })));
    const contentsPrefix = `${prefix}/contents/`;
    if (path.startsWith(contentsPrefix)) {
      const filePath = path.slice(contentsPrefix.length).split("/").map(decodeURIComponent).join("/");
      if (request.method() === "GET") {
        const ref = url.searchParams.get("ref") ?? "main";
        const found = (state.files[ref] ?? []).find((file) => file.path === filePath);
        return found ? json(200, { type: "file", path: filePath, sha: blobSha(ref, filePath) }) : json(404, { message: "Not Found" });
      }
      if (request.method() === "PUT") {
        const body = request.postDataJSON() as { message: string; content: string; branch: string; sha?: string };
        const content = Buffer.from(body.content, "base64").toString("utf8");
        state.uploaded.push({ path: filePath, branch: body.branch, message: body.message, content, sha: body.sha });
        const files = (state.files[body.branch] ??= []);
        const existing = files.findIndex((file) => file.path === filePath);
        if (existing >= 0) files[existing] = { path: filePath, content };
        else files.push({ path: filePath, content });
        // The branch moves to a new commit, so its tree is read again.
        const branch = state.branches.find((entry) => entry.name === body.branch);
        if (branch) branch.sha = String(state.uploaded.length).padStart(40, "e");
        return json(existing >= 0 ? 200 : 201, { commit: { sha: branch?.sha ?? "" } });
      }
    }
    if (path === `${prefix}/commits`) {
      const sha = url.searchParams.get("sha");
      return json(200, commitsJson(sha ? state.branchCommits[sha] ?? state.commits : state.commits));
    }
    if (path.startsWith(`${prefix}/commits/`)) {
      const ref = decodeURIComponent(path.slice(`${prefix}/commits/`.length));
      const tag = state.tags.find((entry) => entry.name === ref);
      const branch = state.branches.find((entry) => entry.name === ref || entry.sha === ref || entry.sha === tag?.sha);
      if (!branch) return json(422, { message: "No commit found for SHA" });
      return json(200, { sha: branch.sha, commit: { message: "Último cambio", tree: { sha: `tree-${branch.name}` } } });
    }
    if (path === `${prefix}/pulls`) return json(200, state.pulls.map((pull) => ({ number: pull.number, title: pull.title, html_url: `https://github.com/${REPO}/pull/${pull.number}`, draft: Boolean(pull.draft), head: { ref: pull.head }, base: { ref: "main" } })));
    if (path.startsWith(`${prefix}/compare/`)) {
      const [, head] = decodeURIComponent(path.slice(`${prefix}/compare/`.length)).split("...");
      const answer = state.compare[head];
      if (!answer) return json(404, { message: "Not Found" });
      return json(200, { ahead_by: answer.ahead, behind_by: answer.behind, total_commits: answer.ahead, files: answer.files ?? [] });
    }
    if (path.startsWith(`${prefix}/git/trees/`)) {
      const sha = decodeURIComponent(path.slice(`${prefix}/git/trees/`.length));
      // A tree is a branch's commit (its root) or a folder of a branch.
      let branchName = state.branches.find((entry) => entry.sha === sha || `tree-${entry.name}` === sha)?.name ?? "";
      let base = "";
      if (!branchName) {
        for (const [name, files] of Object.entries(state.files)) {
          for (const file of files) {
            const parts = file.path.split("/");
            for (let index = 1; index < parts.length; index += 1) {
              const folder = parts.slice(0, index).join("/");
              if (blobSha(name, `${folder}/`) === sha) { branchName = name; base = folder; }
            }
          }
        }
      }
      if (!branchName) return json(404, { message: "Not Found" });
      const files = state.files[branchName] ?? [];
      const folders = new Set<string>();
      for (const file of files) {
        const parts = file.path.split("/");
        for (let index = 1; index < parts.length; index += 1) folders.add(parts.slice(0, index).join("/"));
      }
      const recursive = url.searchParams.get("recursive") === "1";
      const inside = (entry: string) => base ? entry.startsWith(`${base}/`) : true;
      const direct = (entry: string) => inside(entry) && !entry.slice(base ? base.length + 1 : 0).includes("/");
      const pick = (entry: string) => recursive ? inside(entry) : direct(entry);
      const relative = (entry: string) => base ? entry.slice(base.length + 1) : entry;
      const tree = [
        ...[...folders].filter(pick).map((folder) => ({ path: relative(folder), type: "tree", sha: blobSha(branchName, `${folder}/`), mode: "040000" })),
        ...files.filter((file) => pick(file.path)).map((file) => ({ path: relative(file.path), type: "blob", sha: blobSha(branchName, file.path), size: bytesOf(file.content).length, mode: "100644" })),
      ];
      return json(200, { sha, tree, truncated: recursive && state.truncatedTree });
    }
    if (path.startsWith(`${prefix}/git/blobs/`)) {
      const sha = path.slice(`${prefix}/git/blobs/`.length);
      for (const [branch, files] of Object.entries(state.files)) {
        const file = files.find((entry) => blobSha(branch, entry.path) === sha);
        if (file) return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/octet-stream" }, body: Buffer.from(bytesOf(file.content)) });
      }
      return json(404, { message: "Not Found" });
    }
    if (path === `${prefix}/git/refs` && request.method() === "POST") {
      const body = request.postDataJSON() as { ref: string; sha: string };
      state.created.push(body);
      state.branches.push({ name: body.ref.replace(/^refs\/heads\//, ""), sha: "d".repeat(40) });
      return json(201, { ref: body.ref });
    }
    const refPrefix = `${prefix}/git/refs/heads/`;
    if (path.startsWith(refPrefix) && request.method() === "DELETE") {
      const name = path.slice(refPrefix.length).split("/").map(decodeURIComponent).join("/");
      state.deleted.push(name);
      state.branches = state.branches.filter((branch) => branch.name !== name);
      return route.fulfill({ status: 204, headers: CORS });
    }
    return json(404, { message: "Not Found" });
  });
  return state;
}
