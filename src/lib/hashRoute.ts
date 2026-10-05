import type { PageId } from "../types";

export const PAGES: PageId[] = ["home", "work", "branches-page", "code", "settings-page"];

export function isPageId(value: string): value is PageId {
  return (PAGES as string[]).includes(value);
}

/**
 * `#code?ref=feature/x&path=src/App.tsx` → page plus its parameters. The page
 * part decides the view; the parameters only refine it (a file, a filter, a task).
 */
export function parseHash(hash: string): { page: PageId | null; params: URLSearchParams } {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const split = raw.indexOf("?");
  const pagePart = split === -1 ? raw : raw.slice(0, split);
  const params = new URLSearchParams(split === -1 ? "" : raw.slice(split + 1));
  return { page: isPageId(pagePart) ? pagePart : null, params };
}

/** Values are encoded, but slashes stay readable: `#code?path=src/App.tsx`. */
export function buildHash(page: PageId, params?: URLSearchParams | Record<string, string | undefined | null>) {
  const entries = params instanceof URLSearchParams
    ? [...params.entries()]
    : Object.entries(params ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "");
  if (!entries.length) return `#${page}`;
  const query = entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value).replaceAll("%2F", "/")}`).join("&");
  return `#${page}?${query}`;
}
