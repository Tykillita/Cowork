import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import SpecularButton from "../../components/ui/SpecularButton";
import type { PersonalPreferences, Project, ProjectSort } from "../../types";
import { usePersonal } from "../personal/PersonalContext";
import { normalizePreviewUrl } from "./projectUrls";
import { SiteFavicon } from "./SiteFavicon";

import "./ProjectSearchDock.css";

type Phase = "closed" | "expanding" | "opening" | "open" | "closing" | "collapsing";
const MOBILE_QUERY = "(max-width: 640px)";

/** Wraps accent/case-insensitive matches of `query` in <mark>, keeping the original characters. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (!needle) return <>{text}</>;
  const folded = Array.from(text, (char) => char.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().charAt(0) || char).join("");
  const chars = Array.from(text);
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = folded.indexOf(needle); at !== -1; at = folded.indexOf(needle, at + needle.length)) {
    if (at > from) parts.push(chars.slice(from, at).join(""));
    parts.push(<mark key={at}>{chars.slice(at, at + needle.length).join("")}</mark>);
    from = at + needle.length;
  }
  if (from < chars.length) parts.push(chars.slice(from).join(""));
  return <>{parts}</>;
}

/** The trigger finishes stretching before the inline panel or mobile dialog enters. */
export function ProjectSearchDock({ open, onOpenChange, actions, query, onQueryChange, projects, totalCount, preferences, onFilterChange, onSortChange, onEditOrder, onSelect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: ReactNode;
  query: string;
  onQueryChange: (query: string) => void;
  projects: Project[];
  totalCount: number;
  preferences: PersonalPreferences;
  onFilterChange: (filter: PersonalPreferences["filter"]) => void;
  onSortChange: (sort: ProjectSort) => void;
  onEditOrder: () => void;
  onSelect: (project: Project) => void;
}) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [activeIndex, setActiveIndex] = useState(0);
  const groupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const afterCloseRef = useRef<(() => void) | null>(null);
  const restoreFocusRef = useRef(false);
  const { reducedMotion } = usePersonal();
  const contentVisible = phase === "opening" || phase === "open" || phase === "closing";
  const expanded = phase !== "closed" && phase !== "collapsing";
  const activeProject = projects[Math.min(activeIndex, projects.length - 1)];

  // Restart keyboard selection whenever the visible result set changes.
  useEffect(() => { setActiveIndex(0); }, [query, preferences.filter, preferences.sort, projects.length]);

  useEffect(() => {
    if (activeProject) document.getElementById(`project-search-option-${activeProject.id}`)?.scrollIntoView({ block: "nearest" });
  }, [activeProject]);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    if (open) {
      if (phase === "closed" || phase === "collapsing") setPhase("expanding");
      else if (phase === "closing") setPhase("opening");
    } else {
      if (phase === "opening" || phase === "open") setPhase("closing");
      else if (phase === "expanding") setPhase("collapsing");
    }
  }, [open, phase]);

  useLayoutEffect(() => {
    if (!mobile || !contentVisible) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    dialog.showModal();
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      root.style.overflow = previousOverflow;
    };
  }, [mobile, contentVisible]);

  useLayoutEffect(() => {
    if (phase === "closed" || phase === "open") return;
    const triggerStage = phase === "expanding" || phase === "collapsing";
    const element = triggerStage ? triggerRef.current : mobile ? dialogRef.current : panelRef.current;
    if (!element) return;
    // Flush styles so CSS transitions are available. Waiting on their finished
    // promises also settles cancelled/zero-duration animations without a timer.
    void window.getComputedStyle(element).width;
    const animations = reducedMotion ? [] : element.getAnimations().filter((animation) =>
      !triggerStage || !("transitionProperty" in animation) || animation.transitionProperty === "width");
    let active = true;
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!active) return;
      if (phase === "expanding") setPhase("opening");
      else if (phase === "opening") setPhase("open");
      else if (phase === "closing") setPhase("collapsing");
      else {
        setPhase("closed");
        if (restoreFocusRef.current) triggerRef.current?.focus({ preventScroll: true });
        restoreFocusRef.current = false;
        const action = afterCloseRef.current;
        afterCloseRef.current = null;
        action?.();
      }
    });
    return () => { active = false; };
  }, [phase, mobile, reducedMotion]);

  useEffect(() => {
    if (phase === "open") inputRef.current?.focus({ preventScroll: true });
  }, [phase, mobile]);

  function close(afterClose?: () => void) {
    restoreFocusRef.current = true;
    afterCloseRef.current = afterClose ?? null;
    onOpenChange(false);
  }

  useEffect(() => {
    if (phase === "closed" || (mobile && contentVisible)) return;
    const dismiss = () => { restoreFocusRef.current = true; onOpenChange(false); };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !groupRef.current?.contains(event.target)) dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); dismiss(); }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [phase, mobile, contentVisible, onOpenChange]);

  const content = <div className="projectSearchDockInner" inert={phase === "closing"}>
    <div className="projectSearchDockMeta">
      <div className="projectSearchDockHeading">
        <h2 id="project-search-dock-title">Buscar proyectos</h2>
        <p className="projectResultsStatus projectSearchDockCount" id="project-search-dock-count" role="status">{projects.length} de {totalCount} proyectos</p>
      </div>
      <button className="projectSearchDockClose" type="button" aria-label="Cerrar búsqueda" onClick={() => close()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>
    </div>
    <div className="projectSearchField" role="search" aria-label="Buscar proyectos">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>
      <input ref={inputRef} type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Nombre o descripción" aria-label="Buscar proyectos por nombre o descripción" aria-describedby="project-search-dock-count" autoComplete="off"
        aria-controls="project-search-dock-results" aria-activedescendant={activeProject ? `project-search-option-${activeProject.id}` : undefined}
        onKeyDown={(event) => {
          if (!projects.length) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActiveIndex((index) => (Math.min(index, projects.length - 1) + step + projects.length) % projects.length);
          } else if (event.key === "Enter" && activeProject) {
            event.preventDefault();
            close(() => onSelect(activeProject));
          }
        }} />
      {query && <button className="projectSearchDockClear" type="button" onClick={() => { onQueryChange(""); inputRef.current?.focus(); }}>Limpiar</button>}
    </div>
    <div className="projectToolbar" aria-label="Filtros de proyectos">
      <div className="projectToolbarRow">
        <div className="segmented" role="group" aria-label="Mostrar">
          <button type="button" aria-pressed={preferences.filter === "all"} className={preferences.filter === "all" ? "isActive" : ""} onClick={() => onFilterChange("all")}>Todos</button>
          <button type="button" aria-pressed={preferences.filter === "favorites"} className={preferences.filter === "favorites" ? "isActive" : ""} onClick={() => onFilterChange("favorites")}>Favoritos</button>
        </div>
        <label className="controlField projectSort"><span className="visuallyHidden">Ordenar por</span>
          <select value={preferences.sort} onChange={(event) => onSortChange(event.target.value as ProjectSort)} aria-label="Ordenar por">
            <option value="recent">Más recientes</option><option value="name">Nombre</option><option value="custom">Mi orden</option>
          </select>
        </label>
        {preferences.sort === "custom" && <button className="plain projectOrderButton" type="button" onClick={() => close(onEditOrder)}>Editar mi orden</button>}
      </div>
    </div>
    {projects.length > 0 ? <ul className="projectSearchDockResults" id="project-search-dock-results" aria-label="Proyectos encontrados">
      {projects.map((project, index) => <li key={project.id}>
        <button className="projectSearchDockResult" id={`project-search-option-${project.id}`} type="button" data-active={project === activeProject}
          onPointerMove={() => { if (index !== activeIndex) setActiveIndex(index); }} onClick={() => close(() => onSelect(project))}>
          <span className="projectSearchDockMark" aria-hidden="true">
            <SiteFavicon previewUrl={normalizePreviewUrl(project.previewUrl)} iconUrl={project.iconUrl} name={project.name} className="projectSearchDockIcon" />
          </span>
          <span className="projectSearchDockResultCopy">
            <strong><Highlight text={project.name} query={query} /></strong>
            <span><Highlight text={project.description || project.repositoryUrl || "Abrir espacio de trabajo"} query={query} /></span>
          </span>
          {preferences.favorites.includes(project.id) && <span className="projectSearchDockFavorite" aria-label="Favorito">★</span>}
          <svg className="projectSearchDockArrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </li>)}
    </ul> : <div className="projectSearchDockEmpty" role="status">
      <span className="projectSearchDockEmptyIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2M8.5 10.8h4.6" /></svg></span>
      <p>{preferences.filter === "favorites" && !query.trim() ? "Todavía no tienes favoritos." : "Ningún proyecto coincide con la búsqueda."}</p>
      <button className="plain" type="button" onClick={() => { onQueryChange(""); onFilterChange("all"); }}>Mostrar todos los proyectos</button>
    </div>}
    {!mobile && <div className="projectSearchDockHints" aria-hidden="true">
      <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
      <span><kbd>Enter</kbd> abrir</span>
      <span><kbd>Esc</kbd> cerrar</span>
    </div>}
  </div>;

  return <div className="projectPickerActionGroup" ref={groupRef} data-search-phase={phase} data-reduced-motion={reducedMotion}>
    <div className="projectPickerActions">
      {actions}
      {totalCount > 0 && <div className="projectSearchControl" data-expanded={expanded}>
        <SpecularButton className="projectSearchDockToggle" size="sm" radius={14}
          buttonRef={(node) => { triggerRef.current = node; }}
          onClick={() => {
            if (open) close();
            else { afterCloseRef.current = null; restoreFocusRef.current = false; onOpenChange(true); }
          }}
          aria-label="Buscar proyectos" aria-expanded={open} aria-controls="project-search-dock-panel" aria-haspopup={mobile ? "dialog" : undefined} title="Buscar proyectos">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>
          <span className="projectSearchDockTriggerText" aria-hidden="true">Buscar</span>
        </SpecularButton>
      </div>}
    </div>
    {contentVisible && (mobile
      ? <dialog ref={dialogRef} className="projectSearchDockDialog" id="project-search-dock-panel" aria-labelledby="project-search-dock-title" data-phase={phase}
          onCancel={(event) => { event.preventDefault(); close(); }}
          onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const box = event.currentTarget.getBoundingClientRect();
            if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
          }}>{content}</dialog>
      : <section ref={panelRef} className="projectSearchDockPanel" id="project-search-dock-panel" aria-labelledby="project-search-dock-title" data-phase={phase}>
          <div className="projectSearchDockClip">{content}</div>
        </section>)}
  </div>;
}
