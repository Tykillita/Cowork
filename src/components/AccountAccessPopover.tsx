import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePersonal } from "../features/personal/PersonalContext";
import type { MotionPreference, PanelUser } from "../types";
import { usePresence } from "./usePresence";
import { Sk, SkImg } from "./Skeleton";
import { useGitHubSession, syncGitHubSession } from "../features/github/githubSession";
import { linkGitHubProvider, reconnectGitHub, unlinkGitHub } from "../features/auth/panelAuth";

function describeLinkError(error: unknown, provider = "Google") {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["auth/credential-already-in-use", "auth/account-exists-with-different-credential"].includes(code)) {
    return `Ese ${provider} ya está vinculado a otra identidad de Firebase. Entra con la cuenta que contiene tus proyectos; Cowork no fusiona cuentas automáticamente.`;
  }
  if (code === "auth/user-mismatch") return `Esa cuenta de ${provider} no es la que está vinculada a tu perfil. Vuelve a intentarlo con la misma cuenta.`;
  if (code === "auth/popup-closed-by-user") return `Se cerró la ventana de ${provider} antes de terminar.`;
  if (code === "auth/popup-blocked") return `No se pudo iniciar ${provider}. Vuelve a intentarlo.`;
  if (code === "auth/unauthorized-domain") return "Este dominio todavía no está autorizado en Firebase Authentication.";
  if (code === "auth/operation-not-allowed") return `Activa el proveedor ${provider} en Firebase Authentication.`;
  return error instanceof Error ? error.message : `No se pudo vincular ${provider} a esta cuenta.`;
}

function isErrorMessage(message: string) {
  return /^(Ese |Esa |No se pudo|Se cerró|Activa |Este dominio|GitHub es tu único)/.test(message);
}

const MOTION_OPTIONS: { value: MotionPreference; label: string }[] = [
  { value: "system", label: "Sistema" },
  { value: "full", label: "Activado" },
  { value: "reduced", label: "Reducido" },
];

export function AccountAccessPopover({ user, onLinkGoogle, children }: { user: PanelUser; onLinkGoogle: () => Promise<PanelUser | null>; children?: ReactNode }) {
  const { preferences, savePreferences, streak } = usePersonal();
  const hasFrame = streak?.state.badges.some((badge) => badge.id === "streak-100") ?? false;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const { mounted, closing, ref: panelRef } = usePresence<HTMLElement>(open);
  const hasGoogle = user.authProviders.includes("google.com");
  const github = useGitHubSession(user);
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const closeOnOutside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnOutside);
    return () => { window.removeEventListener("keydown", closeOnEscape); window.removeEventListener("pointerdown", closeOnOutside); };
  }, [open]);

  // Keyed on `mounted` (not `open`) so a phone modal keeps its layout while it animates out.
  useLayoutEffect(() => {
    if (!mounted) return;
    const panel = panelRef.current;
    if (!panel) return;

    // On phones the panel is a centred modal laid out entirely by CSS (auth.css).
    const positionPanel = () => {
      panel.classList.toggle("isViewportAnchored", window.matchMedia("(max-width: 640px)").matches);
    };

    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
      panel.classList.remove("isViewportAnchored");
    };
  }, [mounted, panelRef, message, busy, hasGoogle, github.linked, github.status, user.name, user.email]);

  async function linkGoogle() {
    if (busy || hasGoogle) return;
    setBusy(true);
    setMessage("");
    try {
      const linkedUser = await onLinkGoogle();
      if (!linkedUser) return;
      setMessage("Google quedó vinculado a esta cuenta. Los proyectos conservan sus mismos permisos.");
    } catch (error) {
      setMessage(describeLinkError(error));
    } finally { setBusy(false); }
  }

  async function connectGitHub() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const linked = github.linked;
      const result = await (linked ? reconnectGitHub() : linkGitHubProvider());
      if (!result) return;
      syncGitHubSession(user.id);
      setMessage(linked ? "GitHub volvió a conectarse en esta pestaña." : "GitHub quedó vinculado. Ya puedes ver los repositorios privados a los que tienes acceso.");
    } catch (error) {
      setMessage(describeLinkError(error, "GitHub"));
    } finally { setBusy(false); }
  }

  async function disconnectGitHub() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await unlinkGitHub();
      syncGitHubSession(user.id);
      setMessage("GitHub se desvinculó de esta cuenta. Cowork ya no usará tu acceso a GitHub.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo desvincular GitHub.");
    } finally { setBusy(false); }
  }

  const githubLabel = github.status === "checking" ? <Sk inline w="9ch" /> : github.status === "ready" ? (github.login ? `@${github.login}` : "Conectado") : github.linked ? "Sin conexión" : null;

  return (
    <div className="accountAccess" ref={rootRef}>
      <button className={`identityBadge accountAccessTrigger${hasFrame ? " hasStreakFrame" : ""}`} type="button" aria-label={`Abrir perfil de ${user.name}`} title="Abrir perfil" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen((value) => !value); setMessage(""); }}>
        <span className="identityMark">{user.photoURL ? <SkImg src={user.photoURL} alt="" /> : initials}</span>
      </button>
      {mounted && <section ref={panelRef} className="accountAccessPanel" role="dialog" aria-label="Cuenta y métodos de acceso" data-state={closing ? "closing" : "open"} inert={closing}>
        <div className="accountAccessHeader">
          <span className={`accountAccessAvatar${hasFrame ? " hasStreakFrame" : ""}`} aria-hidden="true">{user.photoURL ? <SkImg src={user.photoURL} alt="" /> : initials}</span>
          <div className="accountAccessIdentity"><strong>{user.name}</strong><span>{user.email}</span></div>
          <button className="accountAccessClose" type="button" aria-label="Cerrar perfil" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
          </button>
        </div>
        {children && <div className="accountAccessMenu" onClick={() => setOpen(false)}>{children}</div>}
        <div className="accountAccessMotion" role="group" aria-labelledby="motion-label">
          <span className="accountAccessMethodsLabel" id="motion-label">ANIMACIONES</span>
          <div className="segmented">
            {MOTION_OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={preferences.motion === option.value} className={preferences.motion === option.value ? "isActive" : ""} onClick={() => void savePreferences({ motion: option.value }).catch(() => undefined)}>{option.label}</button>)}
          </div>
          <small>“Sistema” sigue la opción de movimiento reducido de tu dispositivo.</small>
        </div>
        <div className="accountAccessMethods">
          <span className="accountAccessMethodsLabel">MÉTODOS DE ACCESO</span>
          <div className="accountAccessMethod"><i className={user.authProviders.includes("password") ? "isConnected" : ""} /> Enlace de correo {user.authProviders.includes("password") && <em>Conectado</em>}</div>
          <div className="accountAccessMethod"><i className={hasGoogle ? "isConnected" : ""} /> Google {hasGoogle && <em>Conectado</em>}</div>
          <div className="accountAccessMethod"><i className={github.status === "ready" ? "isConnected" : ""} /> GitHub {githubLabel && <em>{githubLabel}</em>}</div>
        </div>
        {!hasGoogle && <button className="accountAccessLinkButton" type="button" onClick={() => void linkGoogle()} disabled={busy}>{busy ? "Conectando…" : "Vincular Google a esta cuenta"}</button>}
        {github.status === "none" && <button className="accountAccessLinkButton" type="button" onClick={() => void connectGitHub()} disabled={busy}>{busy ? "Conectando…" : github.linked ? "Reconectar GitHub" : "Vincular GitHub a esta cuenta"}</button>}
        {github.canUnlink && github.status === "ready" && <button className="accountAccessUnlink" type="button" onClick={() => void disconnectGitHub()} disabled={busy}>Desvincular GitHub</button>}
        <p className="accountAccessHelp">Conectar un método no cambia tu rol ni los proyectos a los que tienes acceso.</p>
        {message && <p className={`accountAccessMessage${isErrorMessage(message) ? " isError" : ""}`} role="status">{message}</p>}
      </section>}
    </div>
  );
}
