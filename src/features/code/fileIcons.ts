import { useEffect, useState } from "react";

/**
 * File and folder icons of the Material Icon Theme (MIT, the VS Code extension),
 * copied to /file-icons/ by scripts/file-icons.mjs. The compact manifest maps
 * names and extensions to icon ids; each icon is an SVG fetched only when shown.
 */
export interface IconTheme {
  file: string;
  folder: string;
  folderOpen: string;
  extensions: Record<string, string>;
  names: Record<string, string>;
  folders: Record<string, string>;
}

const BASE = "/file-icons";
let loading: Promise<IconTheme | null> | null = null;

export function loadIconTheme() {
  loading ??= fetch(`${BASE}/manifest.json`)
    .then((response) => (response.ok ? response.json() as Promise<IconTheme> : null))
    .catch(() => null);
  return loading;
}

/** The theme once it has loaded; null meanwhile (or if it is missing), so the tree keeps its plain icons. */
export function useIconTheme() {
  const [theme, setTheme] = useState<IconTheme | null>(null);
  useEffect(() => {
    let active = true;
    void loadIconTheme().then((value) => { if (active) setTheme(value); });
    return () => { active = false; };
  }, []);
  return theme;
}

export function iconUrl(id: string) {
  return `${BASE}/${id}.svg`;
}

/**
 * Like VS Code: an exact file name first ("package.json", "dockerfile"), then
 * the longest matching extension ("test.tsx" before "tsx"), then the default.
 */
export function fileIconId(name: string, theme: IconTheme) {
  const lower = name.toLowerCase();
  if (theme.names[lower]) return theme.names[lower];
  const parts = lower.split(".");
  for (let index = 1; index < parts.length; index += 1) {
    const extension = parts.slice(index).join(".");
    if (theme.extensions[extension]) return theme.extensions[extension];
  }
  return theme.file;
}

/** "src", ".github" or "__tests__" share their icon with the plain name. */
export function folderIconId(name: string, open: boolean, theme: IconTheme) {
  const lower = name.toLowerCase();
  const base = lower.replace(/^__(.+)__$/, "$1").replace(/^[._-]+/, "");
  const id = theme.folders[lower] ?? theme.folders[base];
  if (!id) return open ? theme.folderOpen : theme.folder;
  return open ? `${id}-open` : id;
}
