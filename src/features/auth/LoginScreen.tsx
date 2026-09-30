import { useEffect, useRef, useState } from "react";
import { CoworkMark } from "../../components/CoworkMark";
import { MorphyButton } from "../../components/ui/morphy-button";
import type { AccessContext, EntryIntent, PanelUser, WallpaperId } from "../../types";
import { completeEmailLinkSignIn, isEmailLinkSignIn, loginWithEmailPassword, loginWithGitHub, loginWithGoogle, registerWithEmailPassword, sendPasswordRecovery, storedEmailForSignIn } from "./panelAuth";
import { clearAuthActionUrl } from "./accessContext";

const WALLPAPERS: WallpaperId[] = ["silver-wave", "silver-rings"];

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function emailInitials(value: string) {
  const localPart = value.trim().split("@")[0] ?? "";
  const parts = localPart.split(/[._+-]+/).filter(Boolean);
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`
    : localPart.slice(0, 2);
  return initials.toLocaleUpperCase("es");
}

function currentWallpaper(): WallpaperId {
  try {
    const saved = localStorage.getItem("cowork-lock-wallpaper");
    return WALLPAPERS.includes(saved as WallpaperId) ? saved as WallpaperId : "silver-wave";
  } catch { return "silver-wave"; }
}

type AuthMode = "password" | "register" | "link";
type CredentialStep = "email" | "password" | "confirm";

type OAuthProviderName = "Google" | "GitHub";

function errorText(error: unknown, mode: AuthMode, provider: OAuthProviderName = "Google") {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "cowork/firebase-not-configured") return "Configura Firebase Authentication para abrir tu espacio.";
  if (code === "cowork/invalid-email") return "Escribe un correo válido.";
  if (code === "cowork/invalid-password") return "Escribe tu contraseña.";
  if (code === "cowork/weak-password" || code === "auth/weak-password") return "Usa una contraseña de al menos 6 caracteres.";
  if (code === "cowork/missing-email") return "La cuenta no compartió un correo. Inténtalo con otra cuenta.";
  if (code === "auth/email-already-in-use") return "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.";
  if (["auth/invalid-credential", "auth/invalid-login-credentials", "auth/wrong-password", "auth/user-not-found"].includes(code)) return "El correo o la contraseña no coinciden.";
  if (["auth/invalid-action-code", "auth/expired-action-code"].includes(code)) return "Este enlace venció o ya se usó. Solicita uno nuevo.";
  if (["auth/unauthorized-domain", "auth/app-not-authorized"].includes(code)) return "Este dominio todavía no está autorizado en Firebase Authentication.";
  if (code === "auth/operation-not-allowed" && provider === "GitHub") return "Activa el proveedor GitHub en Firebase Authentication.";
  if (code === "auth/operation-not-allowed") return mode === "link" ? "Activa el acceso con enlace de correo en Firebase Authentication." : "Activa Email/Password en Firebase Authentication.";
  if (code === "auth/popup-closed-by-user") return `Se cerró la ventana de ${provider} antes de terminar.`;
  if (code === "auth/popup-blocked") return `No se pudo iniciar el acceso con ${provider}. Vuelve a intentarlo o usa el acceso por correo.`;
  if (["auth/network-request-failed", "unavailable"].includes(code)) return "No se pudo conectar con Firebase. Revisa tu conexión e inténtalo de nuevo.";
  if (code === "auth/too-many-requests") return "Firebase bloqueó temporalmente los intentos. Espera antes de probar de nuevo; si acabas de crear la cuenta, confirma primero el enlace que enviamos.";
  if (code === "auth/account-exists-with-different-credential") return "Esta cuenta ya usa otro método de acceso. Entra con el método que utilizaste la primera vez para conservar tus proyectos.";
  return "No se pudo completar el acceso. Revisa el correo y vuelve a intentarlo.";
}

export function LoginScreen({ invite, intent, onAuthenticated, onBack }: {
  invite: AccessContext | null;
  intent: EntryIntent;
  onAuthenticated: (user: PanelUser) => void;
  onBack: () => void;
}) {
  const [authMode, setAuthMode] = useState<AuthMode>(() => isEmailLinkSignIn() ? "link" : "password");
  const [credentialStep, setCredentialStep] = useState<CredentialStep>("email");
  const [email, setEmail] = useState(storedEmailForSignIn);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(() => isValidEmailAddress(storedEmailForSignIn()));
  const [emailAction, setEmailAction] = useState(isEmailLinkSignIn);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [wallpaper, setWallpaper] = useState<WallpaperId>(currentWallpaper);
  const [nextWallpaper, setNextWallpaper] = useState<WallpaperId | null>(null);
  const [wallpaperFadeIn, setWallpaperFadeIn] = useState(false);
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const credentialRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const action = isEmailLinkSignIn();
    setEmailAction(action);
    if (action && storedEmailForSignIn()) void completeLink(storedEmailForSignIn());
    else if (action) requestAnimationFrame(() => credentialRef.current?.focus());
  }, []);

  async function completeLink(value: string) {
    if (busy) return;
    setBusy(true);
    setMessage("Confirmando el enlace…");
    try { onAuthenticated(await completeEmailLinkSignIn(value, invite, intent)); }
    catch (error) { setMessage(errorText(error, authMode)); setBusy(false); }
  }

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!isValidEmailAddress(email)) {
      setEmailConfirmed(false);
      setMessage("Escribe un correo válido para continuar.");
      requestAnimationFrame(() => credentialRef.current?.focus());
      return;
    }
    if (authMode === "link") {
      setBusy(true);
      setMessage("Confirmando el enlace…");
      try { onAuthenticated(await completeEmailLinkSignIn(email.trim(), invite, intent)); }
      catch (error) { setMessage(errorText(error, authMode)); }
      finally { setBusy(false); }
      return;
    }
    if (credentialStep === "email") {
      setEmailConfirmed(true);
      setCredentialStep("password");
      setMessage("");
      requestAnimationFrame(() => credentialRef.current?.focus());
      return;
    }
    if (credentialStep === "password" && authMode === "register") {
      if (password.length < 6) { setMessage("Usa una contraseña de al menos 6 caracteres."); return; }
      setCredentialStep("confirm");
      setPasswordConfirmation("");
      setMessage("");
      requestAnimationFrame(() => credentialRef.current?.focus());
      return;
    }
    if (credentialStep === "confirm" && password !== passwordConfirmation) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }
    if (!password) { setMessage("Escribe tu contraseña."); return; }
    setBusy(true);
    setMessage(authMode === "register" ? "Creando tu cuenta…" : "Iniciando sesión…");
    try {
      if (authMode === "register") {
        onAuthenticated(await registerWithEmailPassword(email.trim(), password, email.trim().split("@")[0]));
      } else {
        onAuthenticated(await loginWithEmailPassword(email.trim(), password));
      }
    } catch (error) { setMessage(errorText(error, authMode)); }
    finally { setBusy(false); }
  }

  async function recoverPassword() {
    if (!isValidEmailAddress(email)) {
      setMessage("Escribe tu correo para enviarte el enlace de recuperación.");
      requestAnimationFrame(() => credentialRef.current?.focus());
      return;
    }
    setBusy(true);
    setMessage("Enviando enlace de recuperación…");
    try {
      await sendPasswordRecovery(email);
      setMessage(`Si existe una cuenta con ${email.trim()}, recibirá un enlace para cambiar la contraseña.`);
    } catch (error) { setMessage(errorText(error, authMode)); }
    finally { setBusy(false); }
  }

  function changeAuthMode(nextMode: AuthMode) {
    setAuthMode(nextMode);
    setPassword("");
    setPasswordConfirmation("");
    if (nextMode !== "link") setCredentialStep(email ? "password" : "email");
    setMessage("");
  }

  function goBackInCredentials() {
    if (authMode === "link") { onBack(); return; }
    if (credentialStep === "confirm") {
      setCredentialStep("password");
      setPasswordConfirmation("");
      setMessage("");
      requestAnimationFrame(() => credentialRef.current?.focus());
      return;
    }
    if (credentialStep === "password") {
      setCredentialStep("email");
      setPassword("");
      setPasswordConfirmation("");
      setMessage("");
      requestAnimationFrame(() => credentialRef.current?.focus());
      return;
    }
    onBack();
  }

  async function continueWith(provider: OAuthProviderName) {
    if (busy) return;
    setBusy(true);
    setMessage(`Abriendo ${provider}…`);
    try {
      const user = await (provider === "GitHub" ? loginWithGitHub() : loginWithGoogle());
      if (!user) return;
      if (emailAction) clearAuthActionUrl(invite, intent);
      onAuthenticated(user);
    }
    catch (error) { setMessage(errorText(error, authMode, provider)); }
    finally { setBusy(false); }
  }

  function chooseWallpaper() {
    if (wallpaperBusy) return;
    const next = WALLPAPERS[(WALLPAPERS.indexOf(wallpaper) + 1) % WALLPAPERS.length];
    setNextWallpaper(next);
    setWallpaperBusy(true);
    window.requestAnimationFrame(() => setWallpaperFadeIn(true));
    window.setTimeout(() => {
      setWallpaper(next);
      setWallpaperFadeIn(false);
      window.setTimeout(() => { setNextWallpaper(null); setWallpaperBusy(false); }, 850);
    }, 850);
    try { localStorage.setItem("cowork-lock-wallpaper", next); } catch { /* Keep this session's selection. */ }
  }

  const dateLabel = new Intl.DateTimeFormat("es-PA", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Panama" }).format(now);
  const timeLabel = new Intl.DateTimeFormat("es-PA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Panama" }).format(now);
  const accountName = emailConfirmed ? email.trim().split("@")[0] : invite ? "Acceso al equipo" : "Tu espacio de trabajo";
  const accountEyebrow = invite ? "SOLICITUD DE ACCESO" : intent === "create" ? "NUEVO PROYECTO" : "COWORK";
  const credentialIsEmail = credentialStep === "email" || authMode === "link";
  const credentialValue = credentialIsEmail ? email : credentialStep === "confirm" ? passwordConfirmation : password;
  const credentialLabel = credentialIsEmail ? "Correo electrónico" : credentialStep === "confirm" ? "Confirmar contraseña" : "Contraseña";
  const submitLabel = authMode === "link" ? "Continuar con el enlace" : authMode === "register" ? credentialStep === "confirm" ? "Crear cuenta" : "Continuar" : credentialStep === "email" ? "Continuar" : "Iniciar sesión";
  const defaultMessage = authMode === "link" ? "Confirma tu acceso desde el enlace que te enviaron." : authMode === "register" ? credentialStep === "email" ? "Crea una cuenta con tu correo y contraseña." : credentialStep === "confirm" ? "Confirma tu contraseña para crear la cuenta." : "Usa al menos 6 caracteres para tu contraseña." : credentialStep === "email" ? "Inicia sesión o crea una cuenta con tu correo." : "Escribe tu contraseña para continuar.";

  return (
    <section className="lockScreen coworkAuthScreen" aria-label="Acceso a Cowork" data-auth-mode={authMode} data-wallpaper={wallpaper} data-next-wallpaper={nextWallpaper ?? undefined} data-wallpaper-fade={wallpaperFadeIn ? "in" : undefined}>
      <div className="lockWallpaperFade" aria-hidden="true" />
      <div className="lockWash" aria-hidden="true" />
      <header className="lockTopbar">
        <div className="lockBrand"><CoworkMark className="lockBrandMark" /><span className="lockBrandCopy"><strong>COWORK</strong><small>ESPACIO DE EQUIPO</small></span></div>
        <div className="lockSystem"><span className="lockSystemDot" aria-hidden="true" /><span>Espacios privados</span></div>
      </header>

      <div className="lockClock" aria-label="Hora actual"><p className="lockDate">{dateLabel}</p><time className="lockTime">{timeLabel}</time></div>

      <div className={`coworkAuthCard${emailConfirmed ? " hasIdentity" : ""}${authMode !== "link" ? " hasPasswordForm" : ""}`}>
        <>
        <div className="coworkAuthHeading">
          <span className={`coworkAuthAvatar${emailConfirmed ? " isPersonalized" : ""}`} aria-hidden="true">
            {emailConfirmed ? emailInitials(email) : <svg viewBox="0 0 48 48" focusable="false"><circle cx="24" cy="16" r="8" /><path d="M8.5 41c1.3-8.2 7.4-13 15.5-13s14.2 4.8 15.5 13" /></svg>}
          </span>
          <p className="eyebrow">{accountEyebrow}</p>
          <h1>{accountName}</h1>
          {!credentialIsEmail && <p className="coworkAuthEmailSummary">{email}</p>}
        </div>
        <form className={`coworkAuthForm is-${authMode} step-${credentialStep}`} onSubmit={submitEmail} noValidate>
          <button className="coworkAuthBack" type="button" onClick={goBackInCredentials} disabled={busy} aria-label="Volver" title="Volver">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 18-6-6 6-6M8 12h12" /></svg>
          </button>
          <label className="coworkAuthEmailField" htmlFor="cowork-auth-email">
            <span className="visuallyHidden">{credentialLabel}</span>
            <input
              ref={credentialRef}
              id="cowork-auth-email"
              name={credentialIsEmail ? "email" : credentialStep === "confirm" ? "passwordConfirmation" : "password"}
              type={credentialIsEmail ? "email" : "password"}
              autoComplete={credentialIsEmail ? "email" : authMode === "register" ? "new-password" : "current-password"}
              inputMode={credentialIsEmail ? "email" : undefined}
              autoCapitalize="none"
              spellCheck={false}
              value={credentialValue}
              onBlur={credentialIsEmail ? (event) => setEmailConfirmed(isValidEmailAddress(event.currentTarget.value)) : undefined}
              onChange={(event) => {
                if (credentialIsEmail) { setEmail(event.target.value); setEmailConfirmed(isValidEmailAddress(event.target.value)); }
                else if (credentialStep === "confirm") setPasswordConfirmation(event.target.value);
                else setPassword(event.target.value);
                setMessage("");
              }}
              placeholder={credentialIsEmail ? "Correo electrónico" : credentialStep === "confirm" ? "Repite tu contraseña" : authMode === "register" ? "Mínimo 6 caracteres" : "Contraseña"}
              aria-label={credentialLabel}
              minLength={!credentialIsEmail ? 6 : undefined}
              required
            />
          </label>
          <button className="coworkAuthEmailButton" type="submit" disabled={busy} aria-label={busy ? "Un momento" : submitLabel} title={submitLabel}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg>
          </button>
        </form>
        <div className="coworkAuthLinks">
          {authMode === "password" && <>
            {credentialStep !== "email" && <><button type="button" onClick={() => void recoverPassword()} disabled={busy}>¿Olvidaste la contraseña?</button><span aria-hidden="true">·</span></>}
            <button type="button" onClick={() => changeAuthMode("register")} disabled={busy}>Crear cuenta</button>
          </>}
          {authMode === "register" && <>
            <span>¿Ya tienes cuenta?</span><button type="button" onClick={() => changeAuthMode("password")} disabled={busy}>Inicia sesión</button>
          </>}
          {authMode === "link" && <button type="button" onClick={() => changeAuthMode("password")} disabled={busy}>Volver al inicio de sesión</button>}
        </div>
        <div className="coworkAuthProviders">
        <span>o continuar con</span>
        <button className="coworkGoogleButton" type="button" onClick={() => void continueWith("Google")} disabled={busy} aria-label="Continuar con Google">
          <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.7c3.9-3.6 6-8.8 6-14.9Z"/><path fill="#FF3D00" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5c-1.8 1.2-4.1 1.9-6.8 1.9-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z"/><path fill="#4CAF50" d="M12.8 27.9a12 12 0 0 1 0-7.8v-5.2H5.9a20 20 0 0 0 0 18.2l6.9-5.2Z"/><path fill="#1976D2" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.9 29.5 4 24 4A20 20 0 0 0 5.9 14.9l6.9 5.2c1.6-4.7 6-8.2 11.2-8.2Z"/></svg>
          <span>Google</span>
        </button>
        <button className="coworkGoogleButton" type="button" onClick={() => void continueWith("GitHub")} disabled={busy} aria-label="Continuar con GitHub">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
          <span>GitHub</span>
        </button>
        </div>
        <p className={`coworkAuthMessage${message && !message.startsWith("Enviamos") && !message.startsWith("Cuenta creada.") && !message.startsWith("Si existe") ? " isError" : ""}`} role="status" aria-live="polite">{message || defaultMessage}</p>
        </>
      </div>

      <footer className="lockFooter">COWORK <span>·</span> TUS PROYECTOS, CON ACCESO POR EQUIPO</footer>
      <MorphyButton className="wallpaperButton" type="button" onClick={chooseWallpaper} disabled={wallpaperBusy} aria-label="Cambiar fondo de pantalla" title="Cambiar fondo de pantalla">Cambiar fondo</MorphyButton>
    </section>
  );
}
