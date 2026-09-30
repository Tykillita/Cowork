import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { CoworkMark } from "../../components/CoworkMark";
import CardSwap, { Card } from "../../components/ui/CardSwap";
import ScrambledText from "../../components/ui/ScrambledText";
import SpecularButton from "../../components/ui/SpecularButton";
import { readAccessContext } from "./accessContext";
import { LEGACY_INVITE_MESSAGE } from "../access/AccessRequestDialog";
import type { AccessContext } from "../../types";

export function EntryPortal({ onCreate, onJoin }: { onCreate: () => void; onJoin: (context: AccessContext) => void }) {
  const [joining, setJoining] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState("");
  const teamButtonRef = useRef<HTMLButtonElement>(null);
  const inviteInputRef = useRef<HTMLInputElement>(null);
  const inviteDialogRef = useRef<HTMLElement>(null);

  // Same root background as the picker, also visible under the browser bars and when overscrolling.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.safeSurface = "projects";
    return () => { delete root.dataset.safeSurface; };
  }, []);

  useEffect(() => {
    if (!joining) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => inviteInputRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setJoining(false);
        setError("");
        return;
      }
      if (event.key !== "Tab" || !inviteDialogRef.current) return;
      const focusable = inviteDialogRef.current.querySelectorAll<HTMLElement>("button, input:not([disabled]), a[href]");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      teamButtonRef.current?.focus();
    };
  }, [joining]);

  function closeInvite() {
    setJoining(false);
    setError("");
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const context = readAccessContext(inviteLink.trim());
    if (!context) {
      setError("Ese enlace no es un enlace de acceso de Cowork. Pega el enlace completo que te compartieron.");
      return;
    }
    if (context.kind === "legacy") {
      setError(LEGACY_INVITE_MESSAGE);
      return;
    }
    setError("");
    onJoin(context);
  }

  return (
    <main className="projectPicker entryPortal" aria-labelledby="entry-title">
      <header className="projectPickerHeader">
        <a className="projectPickerBrand" href="/" aria-label="Cowork, inicio">
          <CoworkMark className="projectPickerMark" />
          <span><strong>COWORK</strong><small>ESPACIO DE EQUIPO</small></span>
        </a>
        <span className="projectPrivacy"><i aria-hidden="true" /> Proyectos privados</span>
      </header>

      <section className="projectPickerContent entryPortalContent">
        <section className="entryPortalShowcase" aria-label="Acciones de Cowork">
          <div className="entryPortalCopy">
            <p className="eyebrow">UN ESPACIO PARA CADA EQUIPO</p>
            <h1 id="entry-title"><ScrambledText>Tus proyectos empiezan aquí.</ScrambledText></h1>
            <p>Organiza el trabajo de tu equipo en espacios separados. Crea uno propio o entra al que te compartieron.</p>
            <div className="entryPortalActions">
              <SpecularButton className="entryPortalCreateButton" size="sm" onClick={onCreate}>Crear un proyecto</SpecularButton>
              <SpecularButton
                className="entryPortalJoinButton"
                size="sm"
                onClick={() => { setJoining(true); setError(""); }}
                buttonRef={(node) => { teamButtonRef.current = node; }}
                aria-label="Unirme a un proyecto"
                aria-haspopup="dialog"
                title="Unirme a un proyecto"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </SpecularButton>
            </div>
            {joining && <div className="entryInviteOverlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeInvite(); }}>
              <section className="entryInviteDialog" ref={inviteDialogRef} role="dialog" aria-modal="true" aria-labelledby="entry-invite-title" aria-describedby="entry-invite-description">
                <div className="entryInviteDialogHead">
                  <div><p className="eyebrow">ACCESO AL EQUIPO</p><h2 id="entry-invite-title">Unirte a un proyecto</h2></div>
                  <SpecularButton className="entryInviteClose" size="sm" type="button" onClick={closeInvite} aria-label="Cerrar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg>
                  </SpecularButton>
                </div>
                <p className="entryInviteIntro" id="entry-invite-description">Pega el enlace que te compartió el propietario o escanea su QR. Después de iniciar sesión podrás solicitar acceso.</p>
                <form className="entryInviteForm" id="entry-invite-form" onSubmit={submitInvite}>
                  <label className="controlField" htmlFor="entry-invite-link"><span>Enlace de acceso</span><input ref={inviteInputRef} id="entry-invite-link" name="inviteLink" type="text" inputMode="url" autoComplete="url" value={inviteLink} onChange={(event) => { setInviteLink(event.target.value); setError(""); }} placeholder="https://…" required /></label>
                  {error && <p className="projectFormError" role="alert">{error}</p>}
                  <SpecularButton className="entryInviteSubmit" size="sm" type="submit">Continuar</SpecularButton>
                </form>
                <p className="projectCreateHint">El enlace no concede acceso por sí solo: el propietario debe aprobar tu solicitud.</p>
              </section>
            </div>}
            {!joining && <p className="entryPortalPrivacy">La portada no muestra información de los equipos. Tus proyectos aparecen después de verificar tu acceso.</p>}
          </div>

          <div className="entryPortalVisual" aria-hidden="true">
            <div className="projectPreviewStage entryPreviewStage">
              <CardSwap width={500} height={400} cardDistance={75} verticalDistance={70} delay={5000} pauseOnHover skewAmount={6} easing="elastic">
                <Card customClass="entryBrowserCard">
                  <div className="entryBrowserBar"><span className="projectBrowserDots"><i /><i /><i /></span><span className="entryBrowserTitle">Nuevo proyecto</span></div>
                  <div className="entryBrowserBody"><span className="entryBrowserEyebrow">TU ESPACIO</span><strong>Empieza con una idea.</strong><span>Organiza objetivos, tareas y avances del equipo.</span><div className="entryBrowserMockButton"><i /> Crear proyecto</div></div>
                </Card>
                <Card customClass="entryBrowserCard">
                  <div className="entryBrowserBar"><span className="projectBrowserDots"><i /><i /><i /></span><span className="entryBrowserTitle">Acceso del equipo</span></div>
                  <div className="entryBrowserBody"><span className="entryBrowserEyebrow">CON APROBACIÓN</span><strong>Comparte el trabajo con quien tú elijas.</strong><span>El propietario decide quién entra a cada espacio.</span><div className="entryBrowserMockMembers"><i>U</i><i>+</i><small>Miembros del proyecto</small></div></div>
                </Card>
                <Card customClass="entryBrowserCard">
                  <div className="entryBrowserBar"><span className="projectBrowserDots"><i /><i /><i /></span><span className="entryBrowserTitle">Tus espacios privados</span></div>
                  <div className="entryBrowserBody"><span className="entryBrowserEyebrow">CADA PROYECTO, SUS PERMISOS</span><strong>Tu rol cambia con cada equipo.</strong><span>Propietario en uno. Miembro en otro. Un mismo acceso.</span><div className="entryBrowserMockRoles"><span>PROPIETARIO <i /></span><span>MIEMBRO <i /></span></div></div>
                </Card>
              </CardSwap>
            </div>
          </div>
        </section>
      </section>
      <footer className="projectPickerFooter">COWORK <span>·</span> TU EQUIPO, SUS PROYECTOS, SUS PERMISOS</footer>
    </main>
  );
}
