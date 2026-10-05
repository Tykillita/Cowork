import { describe, expect, test } from "vitest";
import { ancestorsOf, buildTree, changeBadges, cloneUrls, decodeText, findNode, formatLineRange, fuzzyFindFiles, imageType, languageFor, listFilePaths, mergeDrafts, parseLineRange } from "../../src/features/code/repoTree";

describe("repository tree", () => {
  const entries = [
    { path: "src", type: "tree" as const, sha: "t-src" },
    { path: "src/archivo10.ts", type: "blob" as const, sha: "b1", size: 10 },
    { path: "src/archivo2.ts", type: "blob" as const, sha: "b2", size: 20 },
    { path: "src/Árbol.tsx", type: "blob" as const, sha: "b3", size: 5 },
    { path: "src/lib/util.ts", type: "blob" as const, sha: "b4", size: 7 },
    { path: "README.md", type: "blob" as const, sha: "b5", size: 3 },
    { path: "docs/guia.md", type: "blob" as const, sha: "b6", size: 3 },
  ];

  test("folders first, natural order, missing folders created", () => {
    const root = buildTree(entries);
    expect(root.children.map((node) => node.name)).toEqual(["docs", "src", "README.md"]);
    const src = findNode(root, "src")!;
    expect(src.sha).toBe("t-src");
    expect(src.children.map((node) => node.name)).toEqual(["lib", "Árbol.tsx", "archivo2.ts", "archivo10.ts"]);
    expect(findNode(root, "src/lib/util.ts")?.size).toBe(7);
    expect(findNode(root, "src/nada")).toBeNull();
  });

  test("a folder listing nests under its base path", () => {
    const folder = buildTree([{ path: "util.ts", type: "blob", sha: "x" }, { path: "deep", type: "tree", sha: "y" }], "src/lib");
    expect(folder.children.map((node) => node.path)).toEqual(["src/lib/deep", "src/lib/util.ts"]);
  });

  test("ancestors reveal a file", () => {
    expect(ancestorsOf("src/lib/util.ts")).toEqual(["src", "src/lib"]);
    expect(ancestorsOf("README.md")).toEqual([]);
  });
});

describe("file kinds", () => {
  test("languages by extension and name", () => {
    expect(languageFor("src/App.tsx")).toBe("tsx");
    expect(languageFor("vite.config.ts")).toBe("typescript");
    expect(languageFor("Dockerfile")).toBe("dockerfile");
    expect(languageFor("firestore.rules")).toBe("javascript");
    expect(languageFor("styles/a.css")).toBe("css");
    expect(languageFor("LICENSE")).toBe("text");
  });

  test("images and their types", () => {
    expect(imageType("logo.SVG")).toBe("image/svg+xml");
    expect(imageType("foto.jpg")).toBe("image/jpeg");
    expect(imageType("main.ts")).toBe("");
  });

  test("text, BOM and binaries", () => {
    const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
    expect(decodeText(encode("hola ñandú"))).toEqual({ text: "hola ñandú" });
    expect(decodeText(encode("\ufeffcon BOM"))).toEqual({ text: "con BOM" });
    expect(decodeText(new Uint8Array([0x50, 0x4b, 0x00, 0x01]).buffer)).toEqual({ binary: true });
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0xfd]).buffer)).toEqual({ binary: true });
  });

  test("line ranges from the URL", () => {
    expect(parseLineRange("12")).toEqual([12, 12]);
    expect(parseLineRange("20-10")).toEqual([10, 20]);
    expect(parseLineRange("0")).toBeNull();
    expect(parseLineRange("a-b")).toBeNull();
    expect(parseLineRange(null)).toBeNull();
    expect(formatLineRange([3, 3])).toBe("3");
    expect(formatLineRange([3, 8])).toBe("3-8");
  });
});

describe("branch change marks", () => {
  test("files get A/M/D/R and folders count what changed inside", () => {
    const { byFile, folderCounts } = changeBadges([
      { filename: "src/a.ts", status: "modified" },
      { filename: "src/lib/b.ts", status: "added" },
      { filename: "old.ts", status: "removed" },
      { filename: "src/c.ts", status: "renamed" },
    ]);
    expect(Object.fromEntries(byFile)).toEqual({ "src/a.ts": "M", "src/lib/b.ts": "A", "old.ts": "D", "src/c.ts": "R" });
    expect(Object.fromEntries(folderCounts)).toEqual({ src: 3, "src/lib": 1 });
  });
});

describe("go to file", () => {
  const paths = ["src/App.tsx", "src/app/apply.ts", "docs/APPENDIX.md", "src/pages/AppShell.tsx", "tests/e2e/app.spec.ts", "package.json", "src/lib/mapper.ts"];

  test("ranks file-name matches and exact names first", () => {
    const ranked = fuzzyFindFiles(paths, "app").map((match) => match.path);
    expect(ranked[0]).toBe("src/App.tsx");
    expect(ranked.indexOf("src/pages/AppShell.tsx")).toBeLessThan(ranked.indexOf("src/lib/mapper.ts"));
    expect(fuzzyFindFiles(paths, "pkgjsn").map((match) => match.path)).toEqual(["package.json"]);
  });

  test("returns the matched positions and respects the limit", () => {
    const [match] = fuzzyFindFiles(paths, "apptsx");
    expect(match.path).toBe("src/App.tsx");
    expect(match.indices.map((index) => match.path[index]).join("").toLowerCase()).toBe("apptsx");
    expect(fuzzyFindFiles(paths, "a", 2)).toHaveLength(2);
    expect(fuzzyFindFiles(paths, "   ")).toEqual([]);
    expect(fuzzyFindFiles(paths, "zzz")).toEqual([]);
  });

  test("matches across folders when the name alone does not", () => {
    const [match] = fuzzyFindFiles(paths, "e2eapp");
    expect(match.path).toBe("tests/e2e/app.spec.ts");
  });

  test("lists every file of the tree", () => {
    const root = buildTree([{ path: "b.ts", type: "blob", sha: "1" }, { path: "src/a.ts", type: "blob", sha: "2" }, { path: "src", type: "tree", sha: "3" }]);
    expect(listFilePaths(root)).toEqual(["src/a.ts", "b.ts"]);
  });
});

describe("clone urls", () => {
  test("builds clone commands, ZIP and web links", () => {
    expect(cloneUrls("o/r", "feature/x")).toEqual({
      https: "https://github.com/o/r.git",
      ssh: "git@github.com:o/r.git",
      cli: "gh repo clone o/r",
      zip: "https://github.com/o/r/archive/refs/heads/feature/x.zip",
      web: "https://github.com/o/r/tree/feature/x",
      raw: "",
    });
    expect(cloneUrls("o/r", "v1.0", "tag").zip).toBe("https://github.com/o/r/archive/refs/tags/v1.0.zip");
    expect(cloneUrls("o/r", "main", "branch", "src/a b.ts").web).toBe("https://github.com/o/r/blob/main/src/a%20b.ts");
    expect(cloneUrls("o/r", "main", "branch", "img/logo.png").raw).toBe("https://github.com/o/r/raw/main/img/logo.png");
  });
});

describe("file drafts in the tree", () => {
  const root = buildTree([
    { path: "src", type: "tree", sha: "t1" },
    { path: "src/App.tsx", type: "blob", sha: "b1", size: 10 },
    { path: "README.md", type: "blob", sha: "b2", size: 5 },
  ]);

  test("adds new files with their folders and marks existing ones, without touching the original", () => {
    const merged = mergeDrafts(root, [
      { id: "f1", path: "src/lib/new.ts", size: 3, status: "pending" },
      { id: "f2", path: "README.md", size: 7, status: "rejected" },
      { id: "f3", path: "a.txt", size: 1, status: "pending" },
    ]);
    expect(listFilePaths(merged.root)).toEqual(["src/lib/new.ts", "src/App.tsx", "a.txt", "README.md"]);
    expect(Object.fromEntries(merged.byFile)).toEqual({ "src/lib/new.ts": "P", "README.md": "X", "a.txt": "P" });
    expect(Object.fromEntries(merged.folderCounts)).toEqual({ src: 1, "src/lib": 1 });
    expect(merged.draftIds.get("a.txt")).toBe("f3");
    expect(listFilePaths(root)).toEqual(["src/App.tsx", "README.md"]);
  });

  test("skips paths that cross an existing file and returns the same tree without drafts", () => {
    const merged = mergeDrafts(root, [{ id: "f1", path: "README.md/x.ts", size: 1, status: "pending" }]);
    expect(merged.byFile.size).toBe(0);
    expect(mergeDrafts(root, []).root).toBe(root);
  });
});
