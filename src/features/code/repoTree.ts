import type { GitHubCompareFile, GitHubTreeEntry } from "../../types";

export interface TreeNode {
  /** Full path; "" for the root. */
  path: string;
  name: string;
  kind: "folder" | "file";
  sha: string;
  size: number;
  children: TreeNode[];
  /** Folder whose content is not listed yet (large repositories load it on demand). */
  partial?: boolean;
}

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

function sortNodes(nodes: TreeNode[]) {
  nodes.sort((a, b) => (a.kind === b.kind ? collator.compare(a.name, b.name) : a.kind === "folder" ? -1 : 1));
  for (const node of nodes) if (node.children.length) sortNodes(node.children);
  return nodes;
}

/**
 * Nested tree out of GitHub's flat listing (`git/trees?recursive=1`): folders
 * first, then natural order ("archivo2" before "archivo10"). Submodules are
 * shown as files without content. Missing parent folders are created.
 */
export function buildTree(entries: Pick<GitHubTreeEntry, "path" | "type" | "sha" | "size">[], base = ""): TreeNode {
  const root: TreeNode = { path: base, name: base.split("/").pop() ?? "", kind: "folder", sha: "", size: 0, children: [] };
  const folders = new Map<string, TreeNode>([[base, root]]);
  const folderFor = (path: string): TreeNode => {
    const existing = folders.get(path);
    if (existing) return existing;
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const parent = folderFor(parentPath.length >= base.length ? parentPath : base);
    const node: TreeNode = { path, name: path.slice(path.lastIndexOf("/") + 1), kind: "folder", sha: "", size: 0, children: [] };
    parent.children.push(node);
    folders.set(path, node);
    return node;
  };
  for (const entry of entries) {
    const path = base ? `${base}/${entry.path}` : entry.path;
    if (entry.type === "tree") { folderFor(path).sha = entry.sha; continue; }
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    folderFor(parentPath).children.push({ path, name: path.slice(path.lastIndexOf("/") + 1), kind: "file", sha: entry.sha, size: entry.size ?? 0, children: [] });
  }
  sortNodes(root.children);
  return root;
}

export function findNode(root: TreeNode, path: string): TreeNode | null {
  if (root.path === path) return root;
  for (const child of root.children) {
    if (path === child.path) return child;
    if (child.kind === "folder" && path.startsWith(`${child.path}/`)) return findNode(child, path);
  }
  return null;
}

/** "src/a/b.ts" → ["src", "src/a"]: the folders to open to reveal a file. */
export function ancestorsOf(path: string) {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

const LANGUAGES: Record<string, string> = {
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  json: "json", jsonc: "json", webmanifest: "json",
  css: "css", html: "html", htm: "html", svg: "xml", xml: "xml",
  md: "markdown", markdown: "markdown", mdx: "markdown",
  yml: "yaml", yaml: "yaml", toml: "toml",
  sh: "shellscript", bash: "shellscript", zsh: "shellscript",
  py: "python", sql: "sql", diff: "diff", patch: "diff", rules: "javascript",
};
const NAMES: Record<string, string> = { dockerfile: "dockerfile", ".bashrc": "shellscript", ".zshrc": "shellscript", "firestore.rules": "javascript" };

/** Shiki language id for a path, or "text". */
export function languageFor(path: string) {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (NAMES[name]) return NAMES[name];
  if (name.startsWith("dockerfile")) return "dockerfile";
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return LANGUAGES[extension] ?? "text";
}

const LANGUAGE_LABEL: Record<string, string> = {
  typescript: "TypeScript", tsx: "TSX", javascript: "JavaScript", jsx: "JSX", json: "JSON", css: "CSS", html: "HTML", xml: "XML",
  markdown: "Markdown", yaml: "YAML", toml: "TOML", shellscript: "Shell", python: "Python", sql: "SQL", diff: "Diff", dockerfile: "Dockerfile", text: "Texto",
};
export function languageLabel(language: string) {
  return LANGUAGE_LABEL[language] ?? language.toUpperCase();
}

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon", svg: "image/svg+xml", bmp: "image/bmp" };

/** MIME type when the file can be shown as an image (SVG only through <img>, so its scripts never run). */
export function imageType(path: string) {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return IMAGE_TYPES[extension] ?? "";
}

/** UTF-8 text, or binary when there is a NUL byte early on or the bytes are not valid UTF-8. */
export function decodeText(buffer: ArrayBuffer): { text: string } | { binary: true } {
  const bytes = new Uint8Array(buffer);
  const sample = bytes.subarray(0, 8000);
  if (sample.includes(0)) return { binary: true };
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text };
  } catch {
    return { binary: true };
  }
}

/** "10" → [10, 10], "10-20" → [10, 20]; anything else → null. */
export function parseLineRange(value: string | null): [number, number] | null {
  const match = value?.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (!start || !end) return null;
  return [Math.min(start, end), Math.max(start, end)];
}

export function formatLineRange(range: [number, number]) {
  return range[0] === range[1] ? String(range[0]) : `${range[0]}-${range[1]}`;
}

export type ChangeBadge = "A" | "M" | "D" | "R";

/**
 * Change marks of a branch against the default one: per file, and the number
 * of changed files inside each folder.
 */
export function changeBadges(files: Pick<GitHubCompareFile, "filename" | "status">[]) {
  const byFile = new Map<string, ChangeBadge>();
  const folderCounts = new Map<string, number>();
  for (const file of files) {
    const badge: ChangeBadge = file.status === "added" ? "A" : file.status === "removed" ? "D" : file.status === "renamed" ? "R" : "M";
    byFile.set(file.filename, badge);
    if (badge === "D") continue;
    for (const folder of ancestorsOf(file.filename)) folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1);
  }
  return { byFile, folderCounts };
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} KB`;
  return `${(size / 1024 / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} MB`;
}

/** Files above this size are not opened in Cowork. */
export const MAX_VIEW_BYTES = 1024 * 1024;

/** Every file path under a folder, in tree order (folders first, natural order). */
export function listFilePaths(root: TreeNode) {
  const paths: string[] = [];
  const walk = (node: TreeNode) => {
    for (const child of node.children) {
      if (child.kind === "file") paths.push(child.path);
      else walk(child);
    }
  };
  walk(root);
  return paths;
}

export interface FileMatch {
  path: string;
  score: number;
  /** Positions of the matched characters in `path`, for highlighting. */
  indices: number[];
}

const SEPARATORS = "/._- ";

function subsequence(text: string, query: string, from: number, backward: boolean) {
  const indices: number[] = [];
  if (backward) {
    let position = text.length - 1;
    for (let index = query.length - 1; index >= 0; index -= 1) {
      position = text.lastIndexOf(query[index], position);
      if (position < from) return null;
      indices.unshift(position);
      position -= 1;
    }
  } else {
    let position = from;
    for (const character of query) {
      position = text.indexOf(character, position);
      if (position < 0) return null;
      indices.push(position);
      position += 1;
    }
  }
  return indices;
}

function contiguous(text: string, query: string, from: number, last: boolean) {
  const start = last ? text.lastIndexOf(query) : text.indexOf(query, from);
  return start < from ? null : Array.from(query, (_, index) => start + index);
}

/**
 * GitHub's "Go to file": the letters of the query in order, anywhere in the path.
 * Matches inside the file name, at word starts and in runs rank first; shorter
 * paths win ties. Spaces in the query are ignored.
 */
export function fuzzyFindFiles(paths: string[], query: string, limit = 20): FileMatch[] {
  const needle = query.toLowerCase().replace(/\s+/g, "");
  if (!needle) return [];
  const matches: FileMatch[] = [];
  for (const path of paths) {
    const lower = path.toLowerCase();
    const nameStart = lower.lastIndexOf("/") + 1;
    const indices = contiguous(lower, needle, nameStart, false)
      ?? subsequence(lower, needle, nameStart, false)
      ?? contiguous(lower, needle, 0, true)
      ?? subsequence(lower, needle, 0, true);
    if (!indices) continue;
    let score = 0;
    indices.forEach((position, index) => {
      score += 1;
      if (index > 0 && indices[index - 1] === position - 1) score += 5;
      if (position === 0 || SEPARATORS.includes(path[position - 1]) || (/[A-Z]/.test(path[position]) && /[a-z]/.test(path[position - 1]))) score += 3;
      if (position >= nameStart) score += 4;
    });
    const name = lower.slice(nameStart);
    const stem = name.includes(".") ? name.slice(0, name.indexOf(".")) : name;
    if (name === needle || stem === needle) score += 20;
    else if (name.startsWith(needle)) score += 10;
    score -= (indices[indices.length - 1] - indices[0]) * 0.05 + path.length * 0.01;
    matches.push({ path, score, indices });
  }
  return matches
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length || collator.compare(a.path, b.path))
    .slice(0, limit);
}

export type CloneKind = "https" | "ssh" | "cli";

/** Clone commands, the ZIP download of `ref` and its page on github.com. */
export function cloneUrls(repoPath: string, ref: string, refKind: "branch" | "tag" = "branch", path = "") {
  const encodedRef = ref.split("/").map(encodeURIComponent).join("/");
  const filePath = path ? `/${path.split("/").map(encodeURIComponent).join("/")}` : "";
  return {
    https: `https://github.com/${repoPath}.git`,
    ssh: `git@github.com:${repoPath}.git`,
    cli: `gh repo clone ${repoPath}`,
    zip: ref ? `https://github.com/${repoPath}/archive/refs/${refKind === "tag" ? "tags" : "heads"}/${encodedRef}.zip` : "",
    web: ref ? `https://github.com/${repoPath}/${path ? "blob" : "tree"}/${encodedRef}${filePath}` : `https://github.com/${repoPath}`,
    /** The file's bytes through github.com (works for private repositories with a GitHub session). */
    raw: ref && path ? `https://github.com/${repoPath}/raw/${encodedRef}${filePath}` : "",
  };
}

export type DraftBadge = "P" | "X";

/**
 * The tree with the proposed files of its branch added: new paths become file
 * nodes (creating their folders), existing ones keep their node. Only the
 * folders on the way are copied, so `root` itself is never changed.
 */
export function mergeDrafts(root: TreeNode, drafts: { id: string; path: string; size: number; status: "pending" | "rejected" }[]) {
  const byFile = new Map<string, DraftBadge>();
  const folderCounts = new Map<string, number>();
  const draftIds = new Map<string, string>();
  if (!drafts.length) return { root, byFile, folderCounts, draftIds };
  const copies = new Map<string, TreeNode>();
  const touched = new Set<TreeNode>();
  const copy = (node: TreeNode): TreeNode => {
    const existing = copies.get(node.path);
    if (existing) return existing;
    const clone = { ...node, children: [...node.children] };
    copies.set(node.path, clone);
    return clone;
  };
  const next = copy(root);
  drafts: for (const draft of drafts) {
    const folders = ancestorsOf(draft.path);
    // A path that runs through an existing file cannot be shown in the tree.
    if (folders.some((folderPath) => findNode(root, folderPath)?.kind === "file") || findNode(root, draft.path)?.kind === "folder") continue drafts;
    byFile.set(draft.path, draft.status === "rejected" ? "X" : "P");
    draftIds.set(draft.path, draft.id);
    let folder = next;
    for (const folderPath of folders) {
      folderCounts.set(folderPath, (folderCounts.get(folderPath) ?? 0) + 1);
      const index = folder.children.findIndex((child) => child.path === folderPath);
      const child = index >= 0 ? copy(folder.children[index]) : { path: folderPath, name: folderPath.slice(folderPath.lastIndexOf("/") + 1), kind: "folder" as const, sha: "", size: 0, children: [] };
      if (index >= 0) folder.children[index] = child;
      else { folder.children.push(child); copies.set(folderPath, child); touched.add(folder); }
      folder = child;
    }
    if (folder.children.some((child) => child.path === draft.path)) continue drafts;
    folder.children.push({ path: draft.path, name: draft.path.slice(draft.path.lastIndexOf("/") + 1), kind: "file", sha: "", size: draft.size, children: [] });
    touched.add(folder);
  }
  for (const folder of touched) folder.children.sort((a, b) => (a.kind === b.kind ? collator.compare(a.name, b.name) : a.kind === "folder" ? -1 : 1));
  return { root: next, byFile, folderCounts, draftIds };
}
