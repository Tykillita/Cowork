import { useEffect, useState } from "react";
import type { PageId } from "../types";

const PAGES: PageId[] = ["home", "work", "branches-page", "settings-page"];

function readPage(): PageId {
  const requested = window.location.hash.slice(1) as PageId;
  return PAGES.includes(requested) ? requested : "home";
}

export function useHashRoute() {
  const [page, setPage] = useState<PageId>(readPage);

  useEffect(() => {
    if (!PAGES.includes(window.location.hash.slice(1) as PageId)) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#home`);
    }
    const updatePage = () => {
      const next = readPage();
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

export function pageTitle(page: PageId) {
  const titles: Record<PageId, string> = {
    home: "Resumen",
    work: "Plan de trabajo",
    "branches-page": "Registro de ramas",
    "settings-page": "Configuración del proyecto",
  };
  return titles[page];
}
