import type { ReactNode } from "react";
import CardNav, { type CardNavItem } from "./CardNav";
import { HeaderDock } from "./HeaderDock";
import { usePersonal } from "../features/personal/PersonalContext";
import type { PageId, PanelUser, Project, WorkboardMode } from "../types";

const NAV_CARDS: CardNavItem[] = [
  {
    label: "Trabajo",
    bgColor: "rgba(52,52,55,.96)",
    textColor: "#f5f5f7",
    links: [
      { label: "Resumen", href: "#home", ariaLabel: "Abrir el resumen del proyecto" },
      { label: "Plan de trabajo", href: "#work", ariaLabel: "Abrir el plan de trabajo" },
    ],
  },
  {
    label: "Código",
    bgColor: "rgba(42,42,45,.96)",
    textColor: "#f5f5f7",
    links: [
      { label: "Ramas y cambios", href: "#branches-page", ariaLabel: "Abrir las ramas del equipo" },
      { label: "Explorar código", href: "#code", ariaLabel: "Abrir el explorador de código" },
    ],
  },
  {
    label: "Proyecto",
    bgColor: "rgba(34,34,37,.96)",
    textColor: "#f5f5f7",
    links: [
      { label: "Configuración", href: "#settings-page", ariaLabel: "Abrir la configuración del proyecto" },
      { label: "Cambiar proyecto", href: "#projects", ariaLabel: "Volver a la lista de proyectos" },
    ],
  },
];

function connectionLabel(mode: WorkboardMode) {
  if (mode === "remote") return <>Conectado a Firestore<span className="pillDetail"> · sincronización en tiempo real</span></>;
  if (mode === "offline") return "Sin conexión con la base de datos";
  return "Conectando…";
}

export function AppShell({
  page,
  project,
  user,
  mode,
  onLock,
  onSwitchProject,
  onLinkGoogle,
  headerActions,
  profileMenu,
  children,
}: {
  page: PageId;
  project: Project;
  user: PanelUser;
  mode: WorkboardMode;
  onLock: () => void;
  onSwitchProject: () => void;
  onLinkGoogle: () => Promise<PanelUser | null>;
  headerActions?: ReactNode;
  profileMenu?: ReactNode;
  children: ReactNode;
}) {
  const { reducedMotion } = usePersonal();
  function navigate(href: string) {
    if (href === "/resumen" || href === "#projects") {
      onSwitchProject();
      return;
    }
    if (href === "#logout") {
      onLock();
      return;
    }
    if (href.startsWith("#")) window.location.hash = href;
  }

  return (
    <div className="app-shell">
      <div className="projectCardNav">
        <CardNav
          logo="/cowork-card-nav-logo.svg"
          logoAlt="Cowork · Espacio de equipo"
          items={NAV_CARDS}
          activeHref={`#${page}`}
          baseColor="rgba(20,20,22,.76)"
          menuColor="#f5f5f7"
          buttonBgColor="rgba(255,255,255,.12)"
          buttonTextColor="#f5f5f7"
          buttonLabel="Cambiar proyecto"
          mobileButtonLabel="Cambiar"
          ease="circ.out"
          reducedMotion={reducedMotion}
          onNavigate={navigate}
        />
      </div>

      <main>
        <div className="topbar">
          <div className="topbarStatus">
            <p className="eyebrow">{project.name} · CONEXIÓN DEL EQUIPO</p>
            <span className={`pill${mode === "remote" ? "" : " local"}`} id="sync">{connectionLabel(mode)}</span>
          </div>
          <div className="topActions">
            <HeaderDock user={user} activity={headerActions} profileMenu={profileMenu} onLinkGoogle={onLinkGoogle} onSignOut={onLock} />
          </div>
        </div>
        <div data-page={page}>{children}</div>
      </main>
    </div>
  );
}
