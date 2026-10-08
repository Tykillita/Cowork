import type { ReactNode } from "react";
import type { PanelUser } from "../types";
import { AccountAccessPopover } from "./AccountAccessPopover";

import "./HeaderDock.css";
import { StreakButton } from "../features/streaks/StreakLayer";

/**
 * The account pill shown in every page header: activity (passed in as
 * `activity`), profile and sign-out. On desktop each opens a card below the
 * pill; on phones they open as centred modals.
 */
export function HeaderDock({ user, activity, profileMenu, onLinkGoogle, onUserUpdated, onSignOut }: {
  user: PanelUser;
  activity?: ReactNode;
  profileMenu?: ReactNode;
  onLinkGoogle: () => Promise<PanelUser | null>;
  onUserUpdated: (user: PanelUser) => void;
  onSignOut: () => void;
}) {
  return (
    <div className="headerDockSlot">
      <div className="headerDock">
        <StreakButton />
        {activity}
        <AccountAccessPopover user={user} onLinkGoogle={onLinkGoogle} onUserUpdated={onUserUpdated}>{profileMenu}</AccountAccessPopover>
        <span className="headerDockDivider" aria-hidden="true" />
        <button className="headerDockSignOut" type="button" onClick={onSignOut} aria-label="Cerrar sesión" title="Cerrar sesión">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h9" /></svg>
          <span aria-hidden="true">Salir</span>
        </button>
      </div>
    </div>
  );
}
