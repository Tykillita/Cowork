import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "../../components/Avatar";
import { usePresence } from "../../components/usePresence";
import type { ActivityEvent } from "../../types";
import { describeEvent } from "./activityEvents";
import type { ActivityCenterState, ForYouItem } from "./useActivityCenter";
import { usePersonal } from "../personal/PersonalContext";
import { ReceivedNudge } from "../streaks/NudgeUI";
import { repeat, Sk, SkGroup } from "../../components/Skeleton";

/** Entries while the feeds load: avatar (Actividad) or status chip (Para ti), a line and its meta. */
function ActivitySkeleton({ tab }: { tab: "for-you" | "activity" }) {
  return <SkGroup label={tab === "for-you" ? "Cargando pendientes" : "Cargando actividad"} className="activitySkeleton">
    {repeat(tab === "for-you" ? 3 : 5, (index) => <div className="activityEntry isSkeleton" key={index}>
      {tab === "activity" ? <Sk shape="circle" w={24} h={24} /> : <Sk shape="pill" w={[64, 58, 52][index % 3]} h={19} />}
      <span className="activityEntryText"><strong><Sk w={["74%", "58%", "66%"][index % 3]} /></strong><small><Sk w={["42%", "36%", "48%"][index % 3]} /></small></span>
    </div>)}
  </SkGroup>;
}

type Tab = "for-you" | "activity";

function when(value: string) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 60 * 24) return `hace ${Math.round(minutes / 60)} h`;
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(time);
}

function eventTarget(event: ActivityEvent) {
  return event.targetType === "branch" ? "#branches-page" : "#work";
}

export function ActivityCenter({ state, projectIds, onOpen }: {
  state: ActivityCenterState;
  /** Projects the person can open; others (pending requests) are shown but not linked. */
  projectIds: string[];
  onOpen: (projectId: string, hash: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("for-you");
  const [projectFilter, setProjectFilter] = useState("");
  const [error, setError] = useState("");
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { mounted, closing, ref: panelRef } = usePresence<HTMLElement>(open);
  const { events, forYou, pendingRequestCount, unreadCount } = state;
  // Friend nudges from the last week are notifications too: listed first in "Para ti" and counted by the bell.
  const { nudges, today } = usePersonal();
  const unreadNudges = nudges.filter((entry) => !entry.read && entry.day >= today - 7);
  const totalUnread = unreadCount + unreadNudges.length;

  useEffect(() => {
    if (!open) return;
    state.refreshNow();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    const onPointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointer); };
    // refreshNow is stable; only opening should recompute notices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filteredEvents = events.filter((event) => !projectFilter || event.projectId === projectFilter);
  const filteredForYou = forYou.filter((item) => !projectFilter || item.projectId === projectFilter);
  const projectOptions = [...new Set([...events.map((event) => event.projectId), ...forYou.map((item) => item.projectId)])];

  async function openItem(item: ForYouItem) {
    setError("");
    if (item.unreadable && state.isUnreadItem(item)) await state.markRead(item.projectId, item.id).catch(() => setError("No se pudo guardar el estado de lectura."));
    if (item.target && projectIds.includes(item.projectId)) { setOpen(false); onOpen(item.projectId, item.target); }
  }

  async function openEvent(event: ActivityEvent) {
    setError("");
    if (state.isUnreadEvent(event)) await state.markRead(event.projectId, event.id).catch(() => setError("No se pudo guardar el estado de lectura."));
    if (projectIds.includes(event.projectId)) { setOpen(false); onOpen(event.projectId, eventTarget(event)); }
  }

  async function markAll() {
    setError("");
    try { await state.markAllRead(projectFilter || null); }
    catch { setError("No se pudo marcar como leído. Revisa tu conexión."); }
  }

  const emptyIcon = <span className="activityEmptyIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg></span>;
  const label = `Actividad${totalUnread ? `, ${totalUnread} sin leer` : ""}${pendingRequestCount ? `, ${pendingRequestCount} solicitudes pendientes` : ""}`;

  return (
    <div className="activityCenter" ref={rootRef}>
      <button ref={buttonRef} type="button" className="activityButton" aria-label={label} title="Actividad" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((value) => !value)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {pendingRequestCount > 0 && <span className="activityCount" aria-hidden="true">{pendingRequestCount}</span>}
        {totalUnread > 0 && <span className="activityDot" aria-hidden="true" />}
      </button>
      {mounted && <section ref={panelRef} className="activityPanel" id={panelId} role="dialog" aria-label="Centro de actividad" data-state={closing ? "closing" : "open"} inert={closing}>
        <div className="activityPanelHeader">
          <div className="activityPanelTitle">
            <h2>Notificaciones</h2>
            {totalUnread > 0 && <span className="activityPanelCount">{totalUnread} sin leer</span>}
          </div>
          <button className="activityPanelClose" type="button" aria-label="Cerrar notificaciones" onClick={() => { setOpen(false); buttonRef.current?.focus(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
          </button>
        </div>
        <div className="activityPanelHead">
          <div className="segmented" role="tablist" aria-label="Secciones">
            <button type="button" role="tab" aria-selected={tab === "for-you"} className={tab === "for-you" ? "isActive" : ""} onClick={() => setTab("for-you")}>Para ti</button>
            <button type="button" role="tab" aria-selected={tab === "activity"} className={tab === "activity" ? "isActive" : ""} onClick={() => setTab("activity")}>Actividad</button>
          </div>
          <button className="activityMarkAll" type="button" onClick={() => void markAll()} disabled={!unreadCount}>Marcar como leído</button>
        </div>
        {projectOptions.length > 1 && <label className="controlField activityFilter"><span>Proyecto</span>
          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="">Todos los proyectos</option>
            {projectOptions.map((id) => <option key={id} value={id}>{state.projectName(id)}</option>)}
          </select>
        </label>}
        {error && <p className="projectFormError" role="alert">{error}</p>}
        <div className="activityList" role="tabpanel" aria-label={tab === "for-you" ? "Para ti" : "Actividad"}>
          {tab === "for-you" && unreadNudges.length > 0 && <section className="activityNudges" aria-label="Toques">
            <h3>Toques</h3>
            {unreadNudges.map((entry) => <ReceivedNudge key={entry.id} nudge={entry} className="isCompact" />)}
          </section>}
          {!state.ready ? <ActivitySkeleton tab={tab} /> : tab === "for-you" ? (
            filteredForYou.length ? filteredForYou.map((item) => (
              <button key={item.id} type="button" className={`activityEntry${state.isUnreadItem(item) ? " isUnread" : ""}`} onClick={() => void openItem(item)} disabled={!item.target && !(item.unreadable && state.isUnreadItem(item))}>
                <span className="accessStatusChip" data-tone={item.tone}>{item.kind === "request" ? "Solicitud" : item.kind === "decision" ? "Decisión" : item.kind === "task" ? "Tu tarea" : "Entrega"}</span>
                <span className="activityEntryText"><strong>{item.title}</strong><small>{item.detail}</small></span>
                {state.isUnreadItem(item) && <span className="activityUnread" aria-label="Sin leer" />}
              </button>
            )) : !unreadNudges.length && <div className="activityEmpty">{emptyIcon}<p>No tienes pendientes. Aquí verás solicitudes, decisiones, tus tareas y avisos de entrega.</p></div>
          ) : (
            filteredEvents.length ? filteredEvents.map((event) => (
              <button key={`${event.projectId}:${event.id}`} type="button" className={`activityEntry${state.isUnreadEvent(event) ? " isUnread" : ""}`} onClick={() => void openEvent(event)}>
                <Avatar name={event.actorName} size={24} />
                <span className="activityEntryText">
                  <strong>{event.actorName}</strong> <span>{describeEvent(event, state.milestoneTitle)}</span>
                  <small>{state.projectName(event.projectId)} · <time dateTime={event.createdAt}>{when(event.createdAt)}</time></small>
                </span>
                {state.isUnreadEvent(event) && <span className="activityUnread" aria-label="Sin leer" />}
              </button>
            )) : <div className="activityEmpty">{emptyIcon}<p>Todavía no hay actividad registrada.</p></div>
          )}
        </div>
        {tab === "activity" && state.canLoadMore(projectFilter || null) && <button className="activityMore" type="button" onClick={() => state.loadMore(projectFilter || null)}>Cargar actividad anterior</button>}
      </section>}
    </div>
  );
}
