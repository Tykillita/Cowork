import { useLayoutEffect } from "react";
import { CoworkMark } from "./CoworkMark";
import { repeat, Sk } from "./Skeleton";
import "./ui/CardSwap.css";
import { HomePageSkeleton, TaskBoardSkeleton, BranchesPageSkeleton, ProjectSettingsSkeleton } from "./PageSkeletons";
import type { PageId } from "../types";

/** Which screen the app showed last, so the boot placeholder takes the shape of the next one. */
export type BootSurface = "portal" | "picker" | "project";

const BOOT_KEY = "cowork.boot";

export function readBootSurface(): BootSurface {
  try {
    const value = window.localStorage.getItem(BOOT_KEY);
    return value === "picker" || value === "project" ? value : "portal";
  } catch { return "portal"; }
}

export function rememberBootSurface(surface: BootSurface) {
  try { window.localStorage.setItem(BOOT_KEY, surface); } catch { /* private mode: boot stays neutral */ }
}

/** The project selector: real header and copy, placeholder actions and the card stack. */
function PickerSkeleton({ label }: { label: string }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.safeSurface = "projects";
    return () => { delete root.dataset.safeSurface; };
  }, []);
  return <main className="projectPicker" role="status" aria-busy="true" aria-label={label}>
    <header className="projectPickerHeader" aria-hidden="true">
      <span className="projectPickerBrand">
        <CoworkMark className="projectPickerMark" />
        <span><strong>COWORK</strong><small>ESPACIO DE EQUIPO</small></span>
      </span>
      <div className="projectPickerHeaderActions">
        <span className="projectPrivacy"><i /> Espacio privado</span>
        <Sk shape="pill" h={46} className="skHeaderDock" />
      </div>
    </header>
    <section className="projectPickerContent" aria-hidden="true">
      <section className="projectShowcase">
        <div className="projectShowcaseCopy">
          <p className="eyebrow">ELIGE TU ESPACIO</p>
          <h1>¿En qué proyecto vas a trabajar?</h1>
          <p>Abre un proyecto para revisar su plan, actividad y notas de equipo.</p>
          <div className="projectPickerActionGroup skGroup">
            <div className="projectPickerActions">
              <Sk shape="block" w={154} h={44} r={14} />
              <Sk shape="block" w={44} h={44} r={14} />
              <Sk shape="block" w={44} h={44} r={14} />
            </div>
          </div>
        </div>
        <div className="projectPreviewColumn skGroup">
          <div className="projectPreviewStage">
            <div className="card-swap-container" style={{ width: 500, height: 400 }}>
              {repeat(3, (index) => <div key={index} className="card projectBrowserCard" style={{ width: 500, height: 400, zIndex: 3 - index, transform: `translate(-50%, -50%) translate3d(${index * 75}px, ${-index * 70}px, ${-index * 112.5}px) skewY(6deg)` }}>
                <header className="projectBrowserBar">
                  <span className="projectBrowserDots"><i /><i /><i /></span>
                  <span className="projectBrowserTab"><Sk shape="block" w={16} h={16} r={4} /><Sk w={[120, 96, 140][index]} /></span>
                </header>
                <div className="projectBrowserViewport"><Sk shape="block" className="skFill" r={0} /></div>
              </div>)}
            </div>
          </div>
        </div>
      </section>
    </section>
  </main>;
}

/** The project shell: navigation bar, status row and the page the hash points to. */
function ProjectSkeleton({ label, page }: { label: string; page: PageId }) {
  return <div className="app-shell skGroup" role="status" aria-busy="true" aria-label={label}>
    <div className="projectCardNav" aria-hidden="true">
      <div className="card-nav-container"><Sk shape="block" h={60} r={12} /></div>
    </div>
    <main aria-hidden="true">
      <div className="topbar">
        <div className="topbarStatus"><p className="eyebrow"><Sk w={220} /></p><Sk shape="pill" w={170} h={24} /></div>
        <div className="topActions"><Sk shape="pill" h={46} className="skHeaderDock" /></div>
      </div>
      <div>
        {page === "work" ? <TaskBoardSkeleton />
          : page === "branches-page" ? <BranchesPageSkeleton />
          : page === "settings-page" ? <ProjectSettingsSkeleton />
          : <HomePageSkeleton />}
      </div>
    </main>
  </div>;
}

/**
 * Shown while the session and the project catalog load. It takes the shape of
 * the screen that comes next instead of a centred "Cargando…" line.
 */
export function BootSkeleton({ surface, page = "home", label }: { surface: BootSurface; page?: PageId; label: string }) {
  if (surface === "picker") return <PickerSkeleton label={label} />;
  if (surface === "project") return <ProjectSkeleton label={label} page={page} />;
  return <main className="authLoading" role="status" aria-label={label} />;
}
