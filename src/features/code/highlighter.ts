/**
 * Syntax highlighting with Shiki, loaded only when a file is opened: the core,
 * the JavaScript regex engine (no WebAssembly) and one grammar per language as
 * it is needed. Nothing here is part of the main bundle.
 */
import type { HighlighterCore, ThemedToken } from "shiki/core";

export type CodeTheme = "dark" | "light";
export type HighlightedLine = { content: string; color?: string; fontStyle?: number }[];

const LANGS: Record<string, () => Promise<unknown>> = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  dockerfile: () => import("shiki/langs/dockerfile.mjs"),
};

const THEMES: Record<CodeTheme, { name: string; load: () => Promise<unknown> }> = {
  dark: { name: "github-dark-default", load: () => import("shiki/themes/github-dark-default.mjs") },
  light: { name: "github-light-default", load: () => import("shiki/themes/github-light-default.mjs") },
};

/** Larger files are shown as plain text: tokenizing them would block the page. */
export const HIGHLIGHT_LIMITS = { lines: 5000, characters: 300_000 };

let highlighter: Promise<HighlighterCore> | null = null;
const loadedLangs = new Map<string, Promise<void>>();
const loadedThemes = new Map<CodeTheme, Promise<void>>();

function core() {
  highlighter ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
    createHighlighterCore({ themes: [], langs: [], engine: createJavaScriptRegexEngine({ forgiving: true }) }));
  return highlighter;
}

function moduleDefault(module: unknown) {
  return (module as { default: unknown }).default as never;
}

async function ensure(language: string, theme: CodeTheme) {
  const instance = await core();
  if (!loadedThemes.has(theme)) loadedThemes.set(theme, THEMES[theme].load().then((module) => instance.loadTheme(moduleDefault(module))));
  if (!loadedLangs.has(language)) loadedLangs.set(language, LANGS[language]().then((module) => instance.loadLanguage(moduleDefault(module))));
  await Promise.all([loadedThemes.get(theme), loadedLangs.get(language)]);
  return instance;
}

export function canHighlight(language: string, code: string) {
  return language in LANGS && code.length <= HIGHLIGHT_LIMITS.characters && code.split("\n").length <= HIGHLIGHT_LIMITS.lines;
}

/** Coloured tokens per line, or null when the file stays as plain text. */
export async function highlight(code: string, language: string, theme: CodeTheme): Promise<HighlightedLine[] | null> {
  if (!canHighlight(language, code)) return null;
  const instance = await ensure(language, theme);
  const { tokens } = instance.codeToTokens(code, { lang: language, theme: THEMES[theme].name });
  return tokens.map((line: ThemedToken[]) => line.map((token) => ({ content: token.content, color: token.color, fontStyle: token.fontStyle })));
}
