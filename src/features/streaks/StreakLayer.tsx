import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { PanelUser } from "../../types";
import type { Celebration } from "./streakModel";
import { usePersonal } from "../personal/PersonalContext";
import { streakCommand } from "./streakClient";
import { watchPendingRequests } from "./friendRequestClient";
import { PixelFlame } from "./PixelFlame";
import { Sk } from "../../components/Skeleton";
import { LazyDialogSkeleton } from "../../components/LazyDialogSkeleton";
import { ReceivedNudge } from "./NudgeUI";
import type { NudgeView } from "./streakModel";
import "./streaks.css";

const loadStreakPanel = () => import("./StreakPanel");
const StreakPanel = lazy(() => loadStreakPanel().then(({ StreakPanel }) => ({ default: StreakPanel })));

export const openStreaks = () => window.dispatchEvent(new Event("cowork:open-streaks"));
/**
 * Counter that ticks from `value - 1` to `value` in step with the ignite bounce
 * (the celebration's "+1"). With reduced motion it shows the final value at once.
 */
function RollingCount({ value }: { value: number }) {
  const { reducedMotion } = usePersonal();
  const [shown, setShown] = useState(reducedMotion ? value : Math.max(0, value - 1));
  useEffect(() => {
    if (reducedMotion) { setShown(value); return; }
    const timer = window.setTimeout(() => setShown(value), 450);
    return () => window.clearTimeout(timer);
  }, [value, reducedMotion]);
  return <span className="rollingCount"><span key={shown} className={shown === value && !reducedMotion ? "isRolling" : undefined}>{shown}</span></span>;
}

export function StreakButton() {
  const { progress, wallet, progressReady, walletReady, userId, sourceUids, today, streak, reducedMotion, nudges } = usePersonal();
  const [requests, setRequests] = useState(0);
  const unread = nudges.filter((entry) => !entry.read && entry.day >= today - 7).length;
  const active = progress.days.includes(today);
  const frozen = !active && !!streak?.calendar.some((entry) => entry.day === today - 1 && entry.kind === "protected");
  // Hop (and roll the number) when the streak goes up or today's activity lands while the pill is on screen.
  const [popKey, setPopKey] = useState(0);
  const previous = useRef<{ current: number; active: boolean } | null>(null);
  useEffect(() => {
    if (!progressReady) return;
    const last = previous.current;
    previous.current = { current: progress.currentStreak, active };
    if (last && !reducedMotion && (progress.currentStreak > last.current || (active && !last.active))) setPopKey((key) => key + 1);
  }, [progressReady, progress.currentStreak, active, reducedMotion]);
  useEffect(() => {
    let alive = true, stop: (() => void) | undefined;
    setRequests(0);
    if (userId) void watchPendingRequests(sourceUids, (count) => { if (alive) setRequests(count); }, () => undefined)
      .then((fn) => { if (alive) stop = fn; else fn(); }).catch(() => undefined);
    return () => { alive = false; stop?.(); };
  }, [userId, sourceUids]);
  return <button type="button" className="streakHeaderButton" onPointerEnter={() => { void loadStreakPanel(); }} onFocus={() => { void loadStreakPanel(); }} onClick={openStreaks} aria-label={`Abrir rachas y puntos: ${progress.currentStreak} días, ${wallet.balance} puntos${unread ? `, ${unread} toques pendientes` : ""}${requests ? `, ${requests} solicitudes recibidas` : ""}`} title="Rachas y puntos">
    {/* Nudges are counted by the notifications bell; the flame only flags friend requests. */}
    {requests > 0 && <span className="streakUnread" aria-hidden="true">{requests}</span>}
    <PixelFlame small state={active ? "lit" : frozen ? "frozen" : "dim"} motion={active || frozen ? "idle" : "breathe"} burst={popKey ? "pop" : undefined} burstKey={popKey} />
    <b key={popKey} className={popKey ? "isRolling" : undefined}>{progressReady ? progress.currentStreak : <Sk inline w="1ch" />}</b><span aria-hidden="true">·</span><span className="streakHeaderBalance">{walletReady ? wallet.balance : <Sk inline w="1.5ch" />}<i aria-hidden="true">◆</i></span>
  </button>;
}

function LegacyInviteDialog({ onDone }: { onDone: (friends: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog className="streakDialog streakInviteDialog" ref={ref} aria-labelledby="friend-invite-title" onClose={() => onDone(false)}>
    <PixelFlame /><h2 id="friend-invite-title">Las invitaciones ahora funcionan con códigos de amigo</h2>
    <p>Este enlace ya no está disponible. Comparte tu código o introduce el de tu amigo en Amigos.</p>
    <div className="streakInviteActions">
      <button type="button" className="streakPrimary" onClick={() => onDone(true)}>Ir a Amigos</button>
      <button type="button" onClick={() => onDone(false)}>Cerrar</button>
    </div>
  </dialog>;
}

export function StreakLayer({ user, legacyInvite = false }: { user: PanelUser | null; legacyInvite?: boolean }) {
  const { streak, progress, today, refreshStreak, nudges } = usePersonal();
  const [open, setOpen] = useState(false), [token, setToken] = useState(legacyInvite);
  const [initialTab, setInitialTab] = useState<"personal" | "friends">("personal");
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const attempted = useRef(""), previousUid = useRef(""), uid = user?.id ?? "";
  // Live notice for a nudge received today: each one is announced once per session.
  const announced = useRef(new Set<string>());
  const [nudgeNotice, setNudgeNotice] = useState<NudgeView | null>(null);
  useEffect(() => {
    if (open) return; // The Amigos tab already shows it.
    const fresh = nudges.find((entry) => !entry.read && entry.day === today && !announced.current.has(entry.id));
    if (!fresh) return;
    announced.current.add(fresh.id);
    setNudgeNotice(fresh);
  }, [nudges, today, open]);
  // Answered or read elsewhere (bell, Amigos, another device): drop the notice.
  useEffect(() => { if (nudgeNotice && !nudges.some((entry) => entry.id === nudgeNotice.id && !entry.read)) setNudgeNotice(null); }, [nudges, nudgeNotice]);
  const ready = !!streak, activeToday = progress.days.includes(today);
  useEffect(() => {
    const show = () => { setOpen(true); void refreshStreak(); };
    window.addEventListener("cowork:open-streaks", show);
    return () => window.removeEventListener("cowork:open-streaks", show);
  }, [refreshStreak]);
  useEffect(() => {
    if (previousUid.current !== uid && previousUid.current) {
      setOpen(false); setCelebration(null); setNudgeNotice(null); attempted.current = ""; announced.current.clear();
    }
    previousUid.current = uid;
  }, [uid]);
  useEffect(() => {
    const key = `${uid}:${today}`;
    if (!uid || !ready || token || !activeToday || attempted.current === key) return;
    let active = true;
    const timer = window.setTimeout(() => {
      attempted.current = key;
      void streakCommand<Celebration | null>("claimCelebration").then((value) => { if (active && value) setCelebration(value); })
        .catch(() => { if (active) attempted.current = ""; });
    }, 900);
    return () => { active = false; window.clearTimeout(timer); };
  }, [uid, today, ready, activeToday, token]);
  function dismissInvite(accepted: boolean) {
    const url = new URL(window.location.href); url.searchParams.delete("streakInvite"); url.searchParams.delete("streakCodeNotice"); window.history.replaceState({}, "", url);
    setToken(false);
    if (accepted) { setInitialTab("friends"); setOpen(true); void refreshStreak(); }
  }
  if (!user) return null;
  return <>
    {open && <Suspense fallback={<LazyDialogSkeleton kind="streak" onClose={() => setOpen(false)} />}><StreakPanel initialTab={initialTab} onClose={() => setOpen(false)} /></Suspense>}
    {token && <LegacyInviteDialog onDone={dismissInvite} />}
    {celebration && <aside className={`streakCelebration${celebration.resumed ? " isThawing" : ""}`} role="status" aria-label="Racha actualizada">
      <PixelFlame state="lit" motion="idle" burst="ignite" igniteFrom={celebration.resumed ? "frozen" : "dim"} />
      <div className="streakCelebrationCopy">
        <p className="eyebrow">{celebration.resumed ? "LA LLAMA VUELVE A ENCENDERSE" : "UN DÍA MÁS CONTIGO"}</p>
        <div className="streakCelebrationMain">
          <strong><RollingCount value={celebration.current} /> {celebration.current === 1 ? "día de racha" : "días de racha"}</strong>
          <button type="button" className="streakCelebrationAction" onClick={() => { setCelebration(null); openStreaks(); }}>Ver mi progreso</button>
        </div>
        {celebration.badges.length > 0 && <p className="streakCelebrationBadges">{celebration.badges.join(" · ")}</p>}
      </div>
      <button type="button" className="streakCelebrationClose" aria-label="Cerrar celebración" onClick={() => setCelebration(null)}>×</button>
    </aside>}
    {nudgeNotice && !celebration && <aside className="nudgeNotice" role="status" aria-label={`Toque de ${nudgeNotice.name}`}>
      <button type="button" className="streakCelebrationClose" aria-label="Cerrar aviso de toque" onClick={() => setNudgeNotice(null)}>×</button>
      <ReceivedNudge nudge={nudgeNotice} onDone={() => setNudgeNotice(null)} />
      <button type="button" className="nudgeNoticeOpen" onClick={() => { setNudgeNotice(null); setInitialTab("friends"); setOpen(true); void refreshStreak(); }}>Ver en Amigos</button>
    </aside>}
  </>;
}
