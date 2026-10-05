import type { TaskStatus } from "../../types";
import { normalizeChangelogUrl } from "../projects/projectUrls";

export type ChangelogSection = "added" | "changed" | "fixed" | "general";
export type ReleaseKind = "major" | "feature" | "fix";
export type ChangelogCandidate = {
  sourceUrl: string;
  title: string;
  body: string;
  section: ChangelogSection;
  releaseKind: ReleaseKind | "";
  version: string;
  suggestedStatus: TaskStatus | "";
};

const MAX_SOURCE_CHARS = 900_000;
const MAX_CANDIDATES = 100;
const MAX_BODY = 1_500;
const STATUS_DONE: TaskStatus = "Hecha";
const STATUS_PROGRESS: TaskStatus = "En curso";
const STATUS_PENDING: TaskStatus = "Pendiente";

export function normalizeTaskTitle(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function cleanText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function markdownText(value: string) {
  return cleanText(value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, ""));
}

function statusFromText(value: string): TaskStatus | "" {
  const text = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(planned|planificado|planificada|pendiente|por hacer|coming soon|upcoming|proximamente|roadmap)\b/.test(text)) return STATUS_PENDING;
  if (/\b(in progress|in development|working on|developing|implementing|en desarrollo|en curso|trabajando|implementando|en progreso)\b/.test(text)) return STATUS_PROGRESS;
  if (/\b(done|completed|released|published|fixed|implemented|added|shipped|hecho|terminado|publicado|lanzado|corregido|resuelto|implementado|agregado|anadido|nuevo|nueva|arreglo|arreglado)\b/.test(text)) return STATUS_DONE;
  return "";
}

function sectionFromHeading(value: string): ChangelogSection | null {
  const text = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(added|additions|features|new|nuevo|nuevos|nueva|nuevas|agregado|anadido|funciones|funcionalidades)\b/.test(text)) return "added";
  if (/\b(changed|changes|improved|improvements|cambios|mejoras|actualizado|actualizada)\b/.test(text)) return "changed";
  if (/\b(fixed|fixes|bug fixes|arreglos|correcciones|reparado|reparada)\b/.test(text)) return "fixed";
  return null;
}

function versionFromHeading(value: string) {
  return value.match(/\bv?(\d{1,3}\.\d{1,3}(?:\.\d{1,3})?(?:[-+][\w.-]+)?)\b/i)?.[1] ?? "";
}

/** Maps the parent release badge independently from a card's novelty section. */
export function releaseKindFromBadge(className: string, label: string): ReleaseKind | "" {
  const classes = new Set(className.split(/\s+/).filter(Boolean));
  if (classes.has("salto--grande") || classes.has("salto--major")) return "major";
  if (classes.has("salto--feature") || classes.has("salto--minor")) return "feature";
  if (classes.has("salto--arreglo") || classes.has("salto--fix") || classes.has("salto--patch")) return "fix";

  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (/^(major|grande)$/.test(normalized)) return "major";
  if (/^(feature|minor|funcion|funcionalidad)$/.test(normalized)) return "feature";
  if (/^(fix|patch|arreglo|bug fix|correccion)$/.test(normalized)) return "fix";
  return "";
}

export function isLegacyChangelogIntroTitle(value: string) {
  return normalizeTaskTitle(value) === "cada version funcion por funcion";
}

export function isChangelogBoilerplateTitle(value: string) {
  const text = normalizeTaskTitle(value);
  return [
    "changelog", "release notes", "whats new", "novedades", "updates", "actualizaciones", "features", "funciones",
  ].includes(text) || isLegacyChangelogIntroTitle(value);
}

function statusWithContext(text: string, section: ChangelogSection, context: TaskStatus | ""): TaskStatus | "" {
  const explicit = statusFromText(text);
  if (explicit) return explicit;
  if (context === STATUS_PENDING || context === STATUS_PROGRESS) return context;
  if (section === "added" || section === "fixed") return STATUS_DONE;
  return context;
}

function makeCandidate(
  sourceUrl: string, title: string, body: string, section: ChangelogSection, version: string, contextStatus: TaskStatus | "",
  releaseKind: ReleaseKind | "" = "",
): ChangelogCandidate | null {
  const cleanTitle = markdownText(title).slice(0, 300);
  const cleanBody = markdownText(body).slice(0, MAX_BODY);
  if (!cleanTitle || !normalizeTaskTitle(cleanTitle)) return null;
  return {
    sourceUrl, title: cleanTitle, body: cleanBody, section, releaseKind, version: version.slice(0, 60),
    suggestedStatus: statusWithContext(cleanTitle + " " + cleanBody + " " + version, section, contextStatus),
  };
}

function uniqueCandidates(items: ChangelogCandidate[]) {
  const byTitle = new Map<string, ChangelogCandidate>();
  for (const item of items) {
    const key = item.version + "|" + normalizeTaskTitle(item.title);
    const previous = byTitle.get(key);
    if (!previous || item.body.length > previous.body.length) byTitle.set(key, item);
  }
  return [...byTitle.values()].slice(0, MAX_CANDIDATES);
}

type ParseContext = { version?: string; status?: TaskStatus | "" };

/** Parses common CHANGELOG.md headings and bullets without executing markup. */
export function parseChangelogMarkdown(markdown: string, sourceUrl: string, initial: ParseContext = {}) {
  const lines = markdown.slice(0, MAX_SOURCE_CHARS).replace(/\r\n?/g, "\n").split("\n");
  const result: ChangelogCandidate[] = [];
  let section: ChangelogSection = "general";
  let version = initial.version ?? "";
  let contextStatus: TaskStatus | "" = initial.status ?? "";
  let pendingHeading: { title: string; section: ChangelogSection; version: string; status: TaskStatus | ""; body: string[] } | null = null;

  const flushHeading = () => {
    if (!pendingHeading) return;
    const paragraphs = pendingHeading.body.filter((line) => !/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line)).join(" ");
    const item = makeCandidate(sourceUrl, pendingHeading.title, paragraphs, pendingHeading.section, pendingHeading.version, pendingHeading.status);
    if (item && (item.body || pendingHeading.body.length === 0)) result.push(item);
    pendingHeading = null;
  };

  for (const line of lines) {
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushHeading();
      const title = markdownText(heading[2]);
      const foundVersion = versionFromHeading(title);
      const foundSection = sectionFromHeading(title);
      const foundStatus = statusFromText(title);
      if (foundVersion) {
        version = foundVersion;
        if (foundStatus) contextStatus = foundStatus;
        else if (!/\b(unreleased|upcoming|planned|proximamente|en desarrollo)\b/i.test(title)) contextStatus = STATUS_DONE;
        section = foundSection ?? "general";
        continue;
      }
      if (/unreleased|upcoming|planned|proximamente|en desarrollo|in development/i.test(title)) {
        contextStatus = foundStatus || STATUS_PROGRESS;
        if (/unreleased|proximamente|upcoming/i.test(title)) version = "Unreleased";
        section = foundSection ?? "general";
        continue;
      }
      if (foundSection) {
        section = foundSection;
        if ((foundSection === "added" || foundSection === "fixed") && contextStatus !== STATUS_PROGRESS && contextStatus !== STATUS_PENDING) contextStatus = STATUS_DONE;
        continue;
      }
      if (foundStatus) {
        contextStatus = foundStatus;
        section = foundSection ?? "general";
        continue;
      }
      if (!isChangelogBoilerplateTitle(title)) pendingHeading = { title, section, version, status: contextStatus, body: [] };
      continue;
    }

    const bullet = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (bullet) {
      flushHeading();
      const raw = bullet[1].trim();
      const titled = raw.match(/^(?:\*\*|__)(.+?)(?:\*\*|__)\s*(?::|—|–|-)\s*(.*)$/);
      const split = raw.match(/^(.+?)(?:\s+[—–-]\s+|\s*:\s+)(.+)$/);
      const title = titled?.[1] ?? split?.[1] ?? raw.split(/(?<=[.!?])\s/)[0];
      const body = titled?.[2] ?? split?.[2] ?? raw.slice(title.length).replace(/^[\s:—–-]+/, "");
      const item = makeCandidate(sourceUrl, title, body, section, version, contextStatus);
      if (item) result.push(item);
      continue;
    }
    if (pendingHeading && line.trim() && !/^[-*_]{3,}\s*$/.test(line.trim())) pendingHeading.body.push(markdownText(line));
  }
  flushHeading();
  return uniqueCandidates(result);
}

/** Uses DOMParser and textContent only; remote markup is never inserted into Cowork. */
export function parseStructuredChangelogHtml(html: string, sourceUrl: string) {
  const parsed = new DOMParser().parseFromString(html.slice(0, MAX_SOURCE_CHARS), "text/html");
  parsed.querySelectorAll("script,style,noscript,svg,nav,footer,header,form,button").forEach((element) => element.remove());

  // Public release pages commonly group real notes into version cards instead
  // of semantic headings/lists. Read only each card's titled novelty entries;
  // page-level hero text must never become a task proposal.
  const versionCards = Array.from(parsed.body.querySelectorAll(".version"));
  if (versionCards.length) {
    const result: ChangelogCandidate[] = [];
    for (const card of versionCards) {
      const versionLabel = cleanText(card.querySelector(".version-num")?.textContent ?? "");
      const statusLabel = cleanText(card.querySelector(".version-meta")?.textContent ?? "");
      const releaseBadge = card.querySelector(".version-meta .salto");
      const releaseKind = releaseKindFromBadge(
        typeof releaseBadge?.className === "string" ? releaseBadge.className : "",
        cleanText(releaseBadge?.textContent ?? statusLabel),
      );
      const version = versionFromHeading(versionLabel) || (card.id === "proxima" ? "Unreleased" : versionLabel);
      const contextStatus: TaskStatus | "" = card.id === "proxima" || statusFromText(statusLabel) === STATUS_PROGRESS
        ? STATUS_PROGRESS
        : version ? STATUS_DONE : "";

      for (const group of Array.from(card.querySelectorAll(".grupo"))) {
        const heading = cleanText(group.querySelector("h2,h3,h4")?.textContent ?? "");
        const section = sectionFromHeading(heading) ?? "general";
        for (const entry of Array.from(group.querySelectorAll(".novedad"))) {
          const titleNode = entry.querySelector("b,strong");
          const title = cleanText(titleNode?.textContent ?? "");
          if (!titleNode || !title) continue;
          const bodyNode = entry.cloneNode(true) as HTMLElement;
          bodyNode.querySelector("b,strong")?.remove();
          const item = makeCandidate(sourceUrl, title, cleanText(bodyNode.textContent ?? ""), section, version, contextStatus, releaseKind);
          if (item) {
            // A version card's release state is authoritative. Description
            // prose may mention words such as "pending" without describing
            // the status of that release item.
            if (contextStatus) item.suggestedStatus = contextStatus;
            result.push(item);
          }
        }
      }
    }
    return uniqueCandidates(result);
  }

  const result: ChangelogCandidate[] = [];
  let section: ChangelogSection = "general";
  let version = "";
  let contextStatus: TaskStatus | "" = "";
  const blocks = Array.from(parsed.body.querySelectorAll("h1,h2,h3,h4,h5,h6,li"));
  for (const block of blocks) {
    const text = cleanText(block.textContent ?? "");
    if (/^H[1-6]$/.test(block.tagName)) {
      const foundVersion = versionFromHeading(text);
      const foundSection = sectionFromHeading(text);
      const foundStatus = statusFromText(text);
      if (foundVersion) {
        version = foundVersion;
        contextStatus = foundStatus || (/unreleased|upcoming|planned|proximamente|en desarrollo/i.test(text) ? STATUS_PROGRESS : STATUS_DONE);
        section = foundSection ?? "general";
        continue;
      }
      if (/unreleased|upcoming|planned|proximamente|en desarrollo|in development/i.test(text)) {
        contextStatus = foundStatus || STATUS_PROGRESS;
        if (/unreleased|upcoming|proximamente/i.test(text)) version = "Unreleased";
        section = foundSection ?? "general";
        continue;
      }
      if (foundSection) {
        section = foundSection;
        if ((foundSection === "added" || foundSection === "fixed") && contextStatus !== STATUS_PROGRESS && contextStatus !== STATUS_PENDING) contextStatus = STATUS_DONE;
        continue;
      }
      if (foundStatus) {
        contextStatus = foundStatus;
        section = foundSection ?? "general";
        continue;
      }
      if (isChangelogBoilerplateTitle(text)) continue;
      if (block.tagName === "H1" && !version && section === "general") continue;
      let body = "";
      let next = block.nextElementSibling;
      while (next && !/^H[1-6]$/.test(next.tagName)) {
        body += " " + cleanText(next.textContent ?? "");
        next = next.nextElementSibling;
      }
      const item = makeCandidate(sourceUrl, text, body, section, version, contextStatus);
      if (item) result.push(item);
      continue;
    }
    if (block.tagName === "LI" && text) {
      const titleNode = block.querySelector("strong,b");
      const split = text.match(/^(.+?)(?:\s+[—–-]\s+|\s*:\s+)(.+)$/);
      const title = titleNode ? cleanText(titleNode.textContent ?? "") : split?.[1] ?? text.split(/(?<=[.!?])\s/)[0];
      const body = titleNode ? text.replace(title, "").replace(/^[\s:—–-]+/, "") : split?.[2] ?? text.slice(title.length).replace(/^[\s:—–-]+/, "");
      const item = makeCandidate(sourceUrl, title, body, section, version, contextStatus);
      if (item) result.push(item);
    }
  }
  return uniqueCandidates(result);
}

function githubRawUrl(value: URL) {
  const match = value.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
  return match ? "https://raw.githubusercontent.com/" + match[1] + "/" + match[2] + "/" + match[3] : "";
}

function githubReleasesApi(value: URL) {
  const match = value.pathname.match(/^\/([^/]+)\/([^/]+)\/releases(?:\/.*)?$/);
  return match && value.hostname === "github.com" ? "https://api.github.com/repos/" + match[1] + "/" + match[2] + "/releases?per_page=20" : "";
}

async function boundedResponseText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (text.length > MAX_SOURCE_CHARS) throw new Error("La página de novedades supera el límite de lectura.");
    return text;
  }
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_SOURCE_CHARS) {
      await reader.cancel();
      throw new Error("La página de novedades supera el límite de lectura.");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchText(url: string, accept: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: "GET", mode: "cors", credentials: "omit", redirect: "follow",
      signal: controller.signal, headers: { Accept: accept },
    });
    if (!response.ok) throw new Error("La página de novedades respondió con HTTP " + response.status + ".");
    if (response.url && !response.url.startsWith("https://")) throw new Error("La página redirigió a una dirección que no usa HTTPS.");
    return { text: await boundedResponseText(response), contentType: response.headers.get("content-type") ?? "" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("La página tardó demasiado en responder. Vuelve a intentarlo.");
    if (error instanceof TypeError) throw new Error("Cowork no pudo leer la página desde el navegador. Comprueba que el sitio permita CORS para " + window.location.origin + ".");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function loadChangelogCandidates(sourceValue: string) {
  const sourceUrl = normalizeChangelogUrl(sourceValue);
  if (!sourceUrl) throw new Error("Configura una URL pública HTTPS válida en los ajustes del proyecto.");
  const source = new URL(sourceUrl);
  const releasesApi = githubReleasesApi(source);
  if (releasesApi) {
    const response = await fetchText(releasesApi, "application/vnd.github+json");
    let releases: unknown;
    try { releases = JSON.parse(response.text); } catch { throw new Error("GitHub respondió con datos que no son JSON válido."); }
    if (!Array.isArray(releases)) throw new Error("GitHub no devolvió una lista pública de versiones.");
    const parsed: ChangelogCandidate[] = [];
    for (const release of releases.slice(0, 20)) {
      if (!release || typeof release !== "object") continue;
      const value = release as Record<string, unknown>;
      const title = typeof value.name === "string" && value.name.trim() ? value.name : typeof value.tag_name === "string" ? value.tag_name : "";
      const tag = typeof value.tag_name === "string" ? value.tag_name : "";
      const body = typeof value.body === "string" ? value.body : "";
      const pending = value.prerelease === true;
      const releaseUrl = typeof value.html_url === "string" && value.html_url.startsWith("https://") ? value.html_url : sourceUrl;
      const items = parseChangelogMarkdown(body, releaseUrl, { version: tag, status: pending ? STATUS_PROGRESS : STATUS_DONE });
      if (items.length) parsed.push(...items);
      else {
        const item = makeCandidate(releaseUrl, title, body, "general", tag, pending ? STATUS_PROGRESS : STATUS_DONE);
        if (item) parsed.push(item);
      }
    }
    return uniqueCandidates(parsed);
  }

  const markdownUrl = githubRawUrl(source) || sourceUrl;
  const response = await fetchText(markdownUrl, "text/html, text/markdown, text/plain;q=0.9, */*;q=0.8");
  const html = /(?:text\/html|application\/xhtml\+xml)/i.test(response.contentType) || /<html[\s>]|<!doctype html/i.test(response.text.slice(0, 500));
  return html ? parseStructuredChangelogHtml(response.text, sourceUrl) : parseChangelogMarkdown(response.text, sourceUrl);
}

export async function changelogFingerprint(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}
