import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DAY_MS, milestoneDays, timingMessage, weekStart } from "./streakModel";
import { usePersonal } from "../personal/PersonalContext";
import { SceneCanvas } from "../ambient/AmbientScene";
import { nextUnlock } from "../ambient/sceneCatalog";
import { nextUtcDayStart } from "../progress/progressStore";
import { PixelFlame } from "./PixelFlame";
import { ProtectionShop } from "./ProtectionShop";
import { StreakCalendar } from "./StreakCalendar";
import { StreakFriends } from "./StreakFriends";
import { shareStreak } from "./shareStreak";
import { repeat, Sk } from "../../components/Skeleton";
import "./streaks.css";

export function StreakPanel({ onClose, initialTab = "personal" }: { onClose: () => void; initialTab?: "personal" | "friends" }) {
  const { streak, streakError, refreshStreak, progress, progressReady, wallet, walletReady, scene, today } = usePersonal();
  // Each value keeps its place while it loads: the number, line or tile becomes a shaped block.
  const historyReady = !!streak || !!streakError;
  const ready = progressReady && historyReady;
  const [tab, setTab] = useState<"personal" | "friends">(initialTab), [shareError, setShareError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { dialog.current?.showModal(); return () => { dialog.current?.close(); }; }, []);
  const active = progress.days.includes(today);
  const frozen = !active && streak?.calendar.some((entry) => entry.day === today - 1 && entry.kind === "protected");
  const title = active ? "Hoy ya cuidaste tu racha" : frozen ? "Tu racha está a salvo" : progress.currentStreak ? "Un paso más hoy" : progress.bestStreak > 0 ? "Tu racha se interrumpió" : "Hoy puede ser el primer día";
  const goals = milestoneDays(progress.bestStreak);
  const next = goals.find((goal) => goal > progress.currentStreak) ?? goals[goals.length - 1];
  const badges = streak?.state.badges ?? [];
  const longStreak = badges.some((badge) => badge.id === "streak-100");
  const upcoming = nextUnlock(progress.activeDays);
  const message = streak ? timingMessage(streak.calendar, today) : null;
  const first = weekStart(today);
  const week = Array.from({ length: 7 }, (_, i) => first + i);
  async function share() {
    setShareError("");
    try { await shareStreak(progress.currentStreak, scene.characterId, scene.landscapeId, longStreak ? "Sociedad de rachas extensas" : badges.at(-1)?.label); }
    catch (error) { if ((error as Error).name !== "AbortError") setShareError("No se pudo compartir. Vuelve a intentarlo."); }
  }
  async function retry() { setRefreshing(true); await refreshStreak(); setRefreshing(false); }
  return <dialog ref={dialog} className="streakDialog" aria-labelledby="streak-title" onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <header className="streakDialogHeader"><div><p className="eyebrow">TU CAMINO EN COWORK</p><h2 id="streak-title">Rachas y puntos</h2></div>
      <div className="streakHeaderActions">
        <button type="button" className="streakShare" onClick={() => void share()} aria-label="Compartir mi racha">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4" /><path d="m8 8 4-4 4 4" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
          <span>Compartir</span>
        </button>
        <button type="button" className="streakClose" onClick={onClose} aria-label="Cerrar rachas">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
        </button>
      </div>
    </header>
    <div className="segmented streakTabs" role="tablist" aria-label="Rachas">
      {(["personal", "friends"] as const).map((value) => <button type="button" role="tab" id={`streak-tab-${value}`} aria-controls={`streak-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} key={value}
        onKeyDown={(e) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const target = e.key === "Home" ? "personal" : e.key === "End" ? "friends" : tab === "personal" ? "friends" : "personal"; setTab(target); document.getElementById(`streak-tab-${target}`)?.focus(); } }}
        className={tab === value ? "isActive" : ""} onClick={() => setTab(value)}>{value === "personal" ? "Personal" : "Amigos"}</button>)}
    </div>
    {shareError && <p role="alert" className="streakError">{shareError}</p>}
    {streakError && <div className="streakError" role="alert">{streakError} <button type="button" disabled={refreshing} onClick={() => void retry()}>{refreshing ? "Actualizando…" : "Reintentar"}</button></div>}
    {tab === "personal" ? <div id="streak-panel-personal" role="tabpanel" aria-labelledby="streak-tab-personal" aria-busy={!ready || !walletReady}>
      <div className={`streakHero${!ready ? " isPending" : frozen ? " isFrozen" : active ? "" : " isPending"}`}>
        <div className="streakHeroCopy">
          {longStreak && <span className="streakSociety">✦ Sociedad de rachas extensas</span>}
          {ready ? <>
            <div className="streakHeroMain"><PixelFlame state={active ? "lit" : frozen ? "frozen" : "dim"} motion={active || frozen ? "idle" : "breathe"} /><div><b>{progress.currentStreak}</b><span>{progress.currentStreak === 1 ? "día de racha" : "días de racha"}</span></div></div>
            <h3>{title}</h3><p>{message || (active ? "Tu actividad de hoy cuenta. Mañana seguimos." : frozen ? "Registra actividad para volver a encender la llama." : "Crea un proyecto o una tarea, cambia su estado o registra una rama nueva.")}</p>
          </> : <>
            <div className="streakHeroMain"><Sk shape="block" w={80} h={100} r={14} /><div><b><Sk shape="block" w={46} h={56} r={10} /></b><span><Sk shape="block" w={78} h={10} /></span></div></div>
            <h3><Sk w="38%" /></h3><p><Sk w="72%" /></p>
          </>}
        </div>
        <SceneCanvas characterId={scene.characterId} landscapeId={scene.landscapeId} className="streakScene" />
      </div>
      <div className="streakStats"><div><b>{progressReady ? progress.bestStreak : <Sk w="2ch" />}</b><span>Mejor racha</span></div><div><b>{progressReady ? progress.activeDays : <Sk w="2ch" />}</b><span>Días activos</span></div><div><b>{walletReady ? wallet.balance : <Sk w="2ch" />}</b><span>Puntos disponibles</span></div></div>
      <div className="streakDaily"><span>{!progressReady ? <Sk inline w="24ch" /> : active ? "✓ Actividad de hoy registrada" : "Actividad de hoy pendiente"}</span><strong>{walletReady ? wallet.pointsToday : <Sk inline w="1ch" />}/3 puntos hoy</strong></div>
      <div className="streakWeek" aria-label="Actividad de esta semana">{week.map((day, i) => {
        const kind = streak?.calendar.find((entry) => entry.day === day)?.kind;
        if (!historyReady) return <div key={day}><span>{["D", "L", "M", "X", "J", "V", "S"][i]}</span><Sk shape="block" w={34} h={34} r={10} /></div>;
        return <div key={day} className={kind === "active" ? "isActive" : kind === "protected" ? "isProtected" : ""} style={{ "--i": i } as CSSProperties}><span>{["D", "L", "M", "X", "J", "V", "S"][i]}</span><b aria-label={`${new Date(day * DAY_MS).toISOString().slice(0, 10)}: ${kind === "active" ? "activo" : kind === "protected" ? "protegido" : day > today ? "futuro" : "sin actividad"}`}>{kind === "active" ? "✓" : kind === "protected" ? "◇" : "·"}</b></div>;
      })}</div>
      <p className="streakHint">Siete días con actividad, de domingo a sábado, ganan una insignia de semana perfecta. El próximo día empieza el {new Intl.DateTimeFormat("es", { weekday: "long", hour: "2-digit", minute: "2-digit" }).format(nextUtcDayStart())}, hora local.</p>
      <div className="streakColumns"><StreakCalendar /><section className="streakGoals" aria-labelledby="streak-goals-title">
        <div className="streakSectionHead"><h3 id="streak-goals-title">Tu próxima meta</h3><span>{ready ? `${progress.currentStreak}/${next}` : <Sk inline w="3ch" />}</span></div>
        {ready ? <progress value={progress.currentStreak} max={next} aria-label={`Meta de ${next} días`} /> : <Sk shape="block" h={8} r={8} />}
        <p>{ready ? `${next - progress.currentStreak} días con actividad para llegar a ${next}.` : <Sk w="70%" />}</p>
        <div className="streakMilestones">{goals.filter((goal) => goal <= Math.max(100, next)).map((goal) => ready
          ? <span key={goal} className={badges.some((badge) => badge.id === `streak-${goal}`) ? "isEarned" : ""}><b>{goal}</b><small>{badges.some((badge) => badge.id === `streak-${goal}`) ? "Logrado" : "días"}</small></span>
          : <span key={goal}><b><Sk w="2ch" /></b><small><Sk w="3.5ch" /></small></span>)}</div>
        <p className="streakHint">Las insignias ganadas son permanentes. Los días protegidos conservan el camino, pero no acercan la meta.</p>
        {upcoming && <div className="streakNextReward"><strong>Próximo objeto de colección</strong>{progressReady
          ? <><span>{upcoming.name}</span><small>Faltan {upcoming.unlockDays - progress.activeDays} días activos acumulados.</small></>
          : <><span><Sk w="45%" /></span><small><Sk w="65%" /></small></>}</div>}
        {longStreak && <div className="streakLongBadge"><span>✦</span><strong>Marco de constancia desbloqueado</strong><p>Tu perfil muestra el marco de rachas extensas.</p></div>}
      </section></div>
      <ProtectionShop />
      <section className="streakBadges"><h3>Insignias ganadas</h3>{!historyReady ? <ul aria-hidden="true">{repeat(2, (index) => <li key={index}><Sk shape="block" w={22} h={22} r={6} /><strong><Sk w="70%" /></strong><small><Sk w="45%" /></small></li>)}</ul> : badges.length ? <ul>{badges.slice().reverse().map((badge) => <li key={badge.id}><span aria-hidden="true">{badge.id.startsWith("week-") ? "✧" : "✦"}</span><strong>{badge.label}</strong><small>{new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(badge.day * DAY_MS))}</small></li>)}</ul> : <p className="streakHint">Tu primera insignia llega a los tres días de racha.</p>}</section>
    </div> : <div id="streak-panel-friends" role="tabpanel" aria-labelledby="streak-tab-friends"><StreakFriends /></div>}
  </dialog>;
}
