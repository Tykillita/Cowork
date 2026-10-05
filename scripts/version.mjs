// Cowork's version, kept in step everywhere it appears (rules in AGENTS.md, «Versiones»).
//
//   node scripts/version.mjs check                    → every copy matches VERSION (exit 1 if not)
//   node scripts/version.mjs bump <major|minor|patch> → raises VERSION and every copy at once
//   node scripts/version.mjs notes <vX.Y.Z>           → the CHANGELOG section of that tag (for the release draft)
//
// VERSION is the single source. Its copies: package.json, package-lock.json, the version badge of
// README.md and README.en.md, the CHANGELOG section and the newest entry of
// src/features/changelog/releases.ts (the public /novedades page).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const READMES = ["README.md", "README.en.md"];
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Text with LF line endings; `restore` puts back the file's own (CRLF on some checkouts). */
function load(path) {
  const raw = readFileSync(path, "utf8");
  const crlf = raw.includes("\r\n");
  return { text: crlf ? raw.replace(/\r\n/g, "\n") : raw, restore: (text) => (crlf ? text.replace(/\n/g, "\r\n") : text) };
}

export function readVersion(root) {
  const version = readFileSync(join(root, "VERSION"), "utf8").trim();
  if (!SEMVER.test(version)) throw new Error(`VERSION debe ser MAJOR.MINOR.PATCH y es «${version}».`);
  return version;
}

/** Problems found, in Spanish; empty when every copy matches VERSION. */
export function versionProblems(root) {
  const version = readVersion(root);
  const read = (file) => load(join(root, file)).text;
  const problems = [];
  const pkg = JSON.parse(read("package.json"));
  if (pkg.version !== version) problems.push(`package.json tiene ${pkg.version}.`);
  const lock = JSON.parse(read("package-lock.json"));
  if (lock.version !== version || lock.packages?.[""]?.version !== version) problems.push("package-lock.json no tiene la misma versión (npm install --package-lock-only).");
  for (const file of READMES) {
    const text = read(file);
    if (!text.includes(`badge/version-${version}-`) || !text.includes(`alt="version ${version}"`)) problems.push(`${file}: la placa de versión no dice ${version}.`);
  }
  const changelog = read("CHANGELOG.md");
  if (!/^## \[Unreleased\]$/m.test(changelog)) problems.push("CHANGELOG.md no tiene la sección ## [Unreleased].");
  if (!new RegExp(`^## \\[${escape(version)}\\] — \\d{4}-\\d{2}-\\d{2}$`, "m").test(changelog)) problems.push(`CHANGELOG.md no tiene la sección ## [${version}] — AAAA-MM-DD.`);
  const releases = read("src/features/changelog/releases.ts");
  const newest = releases.match(/version:\s*"([^"]+)"/)?.[1];
  if (newest !== version) problems.push(`La entrada más nueva de releases.ts (/novedades) es ${newest ?? "ninguna"}, no ${version}.`);
  return problems;
}

export function nextVersion(version, kind) {
  const [, major, minor, patch] = version.match(SEMVER).map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error("Usa major, minor o patch.");
}

/** The CHANGELOG section of a version, without its heading. */
export function releaseNotes(changelog, version) {
  const match = changelog.match(new RegExp(`^## \\[${escape(version)}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|^\\[[^\\]]+\\]: )`, "m"));
  if (!match) throw new Error(`CHANGELOG.md no tiene la sección ${version}.`);
  return match[1].trim();
}

function bump(root, kind) {
  const from = readVersion(root);
  const to = nextVersion(from, kind);
  // The local calendar day, as the CHANGELOG reads it.
  const now = new Date();
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
  const edit = (file, change) => {
    const { text, restore } = load(join(root, file));
    writeFileSync(join(root, file), restore(change(text)));
  };
  edit("VERSION", () => `${to}\n`);
  edit("package.json", (text) => text.replace(/("version":\s*")[^"]+(")/, `$1${to}$2`));
  edit("package-lock.json", (text) => {
    const lock = JSON.parse(text);
    lock.version = to;
    if (lock.packages?.[""]) lock.packages[""].version = to;
    return `${JSON.stringify(lock, null, 2)}\n`;
  });
  for (const file of READMES) edit(file, (text) => text.replaceAll(`badge/version-${from}-`, `badge/version-${to}-`).replaceAll(`alt="version ${from}"`, `alt="version ${to}"`));
  edit("CHANGELOG.md", (text) => text
    .replace(/^## \[Unreleased\]\n/m, `## [Unreleased]\n\n## [${to}] — ${today}\n`)
    .replace(/^\[Unreleased\]: (.+)\/compare\/v[^.]+\.[^.]+\.[^.]+\.\.\.HEAD$/m, `[Unreleased]: $1/compare/v${to}...HEAD\n[${to}]: $1/compare/v${from}...v${to}`));
  console.log(`Versión ${from} → ${to}.`);
  console.log("Falta, en el mismo trabajo (AGENTS.md): la entrada de releases.ts para /novedades (mueve NEXT), las");
  console.log("funciones nuevas en README.md y README.en.md, y revisar la sección del CHANGELOG. Luego: npm run version:check.");
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const [command, arg] = process.argv.slice(2);
  try {
    if (command === "check") {
      const problems = versionProblems(root);
      if (problems.length) {
        console.error(`La versión ${readVersion(root)} no coincide en todas partes:\n- ${problems.join("\n- ")}`);
        process.exit(1);
      }
      console.log(`Versión ${readVersion(root)}: coincide en VERSION, package.json, README, CHANGELOG y /novedades.`);
    } else if (command === "bump") {
      bump(root, arg);
    } else if (command === "notes") {
      const version = String(arg ?? "").replace(/^v/, "");
      if (version !== readVersion(root)) throw new Error(`La etiqueta ${arg} no coincide con VERSION (${readVersion(root)}).`);
      const problems = versionProblems(root);
      if (problems.length) throw new Error(problems.join(" "));
      process.stdout.write(`${releaseNotes(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version)}\n`);
    } else {
      console.error("Uso: node scripts/version.mjs check | bump <major|minor|patch> | notes <vX.Y.Z>");
      process.exit(2);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
