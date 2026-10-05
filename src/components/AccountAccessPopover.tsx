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
        {(!hasGoogle || github.status === "none") && <div className="accountAccessLinkActions">
          {!hasGoogle && <button className="accountAccessLinkButton" type="button" onClick={() => void linkGoogle()} disabled={busy} aria-busy={busy} aria-label="Vincular Google a esta cuenta" title="Vincular Google a esta cuenta">
            <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.7c3.9-3.6 6-8.8 6-14.9Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5c-1.8 1.2-4.1 1.9-6.8 1.9-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.8 27.9a12 12 0 0 1 0-7.8v-5.2H5.9a20 20 0 0 0 0 18.2l6.9-5.2Z"/><path fill="#EA4335" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.9 29.5 4 24 4A20 20 0 0 0 5.9 14.9l6.9 5.2c1.6-4.7 6-8.2 11.2-8.2Z"/></svg>
          </button>}
          {github.status === "none" && <button className="accountAccessLinkButton" type="button" onClick={() => void connectGitHub()} disabled={busy} aria-busy={busy} aria-label={github.linked ? "Reconectar GitHub" : "Vincular GitHub a esta cuenta"} title={github.linked ? "Reconectar GitHub" : "Vincular GitHub a esta cuenta"}>
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
          </button>}
        </div>}
        {github.canUnlink && github.status === "ready" && <button className="accountAccessUnlink" type="button" onClick={() => void disconnectGitHub()} disabled={busy}>Desvincular GitHub</button>}
        <p className="accountAccessHelp">Conectar un método no cambia tu rol ni los proyectos a los que tienes acceso.</p>
        {message && <p className={`accountAccessMessage${isErrorMessage(message) ? " isError" : ""}`} role="status">{message}</p>}
      </section>}
    </div>
  );
}
