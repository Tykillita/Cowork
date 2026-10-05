// Copies the Material Icon Theme file and folder icons (MIT) into public/file-icons/
// and writes a compact manifest for the code page. Generated output is git-ignored;
// it runs before every build and dev server.
//
//   node scripts/file-icons.mjs
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const manifestPath = require.resolve("material-icon-theme/dist/material-icons.json");
const packageRoot = join(dirname(manifestPath), "..");
const theme = JSON.parse(readFileSync(manifestPath, "utf8"));
const out = join(process.cwd(), "public", "file-icons");

const iconFile = (id) => theme.iconDefinitions[id]?.iconPath?.split("/").pop();
const used = new Set();
const keep = (id) => { if (iconFile(id)) used.add(id); return id; };

// Folder names come in variants (".rust", "_rust", "-rust", "__rust__"); keep the base
// name only when the variant uses the same icon. The client strips the same decoration.
const baseName = (name) => name.replace(/^__(.+)__$/, "$1").replace(/^[._-]+/, "");
const folders = {};
for (const [name, id] of Object.entries(theme.folderNames)) {
  const base = baseName(name);
  if (base !== name && theme.folderNames[base] === id) continue;
  folders[name.toLowerCase()] = keep(id);
  keep(`${id}-open`);
}

const lower = (map) => Object.fromEntries(Object.entries(map).map(([key, id]) => [key.toLowerCase(), keep(id)]));
const compact = {
  file: keep(theme.file),
  folder: keep(theme.folder),
  folderOpen: keep(theme.folderExpanded),
  extensions: lower(theme.fileExtensions),
  names: lower(theme.fileNames),
  folders,
  // VS Code language ids for the common extensions the theme maps through languages.
  languages: lower(theme.languageIds),
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const id of used) {
  const file = iconFile(id);
  const source = join(packageRoot, "icons", file);
  if (existsSync(source)) copyFileSync(source, join(out, `${id}.svg`));
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(compact));
copyFileSync(join(packageRoot, "LICENSE"), join(out, "LICENSE.txt"));
console.log(`file-icons: ${used.size} icons, manifest ${(JSON.stringify(compact).length / 1024).toFixed(0)} KB`);
