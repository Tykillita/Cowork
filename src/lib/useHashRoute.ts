import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { PageId } from "../types";
import { buildHash, parseHash } from "./hashRoute";

function readPage(): PageId {
  return parseHash(window.location.hash).page ?? "home";
}

export function useHashRoute() {
  const [page, setPage] = useState<PageId>(readPage);

  useEffect(() => {
    if (!parseHash(window.location.hash).page) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#home`);
    }
    let current: PageId | null = null;
    const updatePage = () => {
      const next = readPage();
      // Only a different page starts at the top; a parameter (a file, a filter) keeps the scroll.
      if (next === current) return;
      current = next;
      setPage(next);
      document.title = `${pageTitle(next)} · Cowork`;
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", updatePage);
    updatePage();
    return () => window.removeEventListener("hashchange", updatePage);
  }, []);

  return page;
}

function subscribeToHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

function readHash() {
  return window.location.hash;
}

/**
 * Parameters of the current page (`#work?task=t1`). `setParams` writes a new
 * history entry by default, so Back undoes it; `{ replace: true }` does not.
 */
export function useHashParams() {
  const hash = useSyncExternalStore(subscribeToHash, readHash, () => "");
  const { page, params } = parseHash(hash);
  const setParams = useCallback((next: Record<string, string | undefined | null>, { replace = false }: { replace?: boolean } = {}) => {
    const target = buildHash(readPage(), next);
    if (target === window.location.hash) return;
    const url = `${window.location.pathname}${window.location.search}${target}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    // pushState and replaceState do not fire hashchange on their own.
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);
  return { page: page ?? "home", params, setParams };
}

export function pageTitle(page: PageId) {
  const titles: Record<PageId, string> = {
    home: "Resumen",
    work: "Plan de trabajo",
    "branches-page": "Registro de ramas",
    code: "Código",
    "settings-page": "Configuración del proyecto",
  };
  return titles[page];
}
