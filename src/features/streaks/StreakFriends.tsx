import { useEffect, useRef, useState } from "react";
import { FRIEND_LIMIT, type FriendView, type NudgeView } from "./streakModel";
import { usePersonal } from "../personal/PersonalContext";
import { streakCommand, streakError, watchSocial } from "./streakClient";
import { PixelFlame, type FlameState } from "./PixelFlame";
import { AddFriendCard, PendingIncoming, RequestHistory } from "./FriendRequests";
import { ReceivedNudge } from "./NudgeUI";
import { nudgeText, randomNudge, replyText } from "./nudgeCatalog";
import { Sk, SkGroup, SkImg } from "../../components/Skeleton";

type Status = FriendView["mine"];
const statusLabels: Record<Status, string> = { active: "Actividad registrada", protected: "Pendiente · con protección", pending: "Actividad pendiente" };
const statusMarks: Record<Status, string> = { active: "✓", protected: "◇", pending: "·" };

/** Shared flame: lit only when both acted today; ice while protection covers the gap; grey otherwise. */
function pairFlame(friend: FriendView): FlameState {
  if (friend.mine === "active" && friend.theirs === "active") return "lit";
  if (friend.mine !== "pending" && friend.theirs !== "pending") return "frozen";
  return "dim";
}

function StatusChip({ who, status }: { who: string; status: Status }) {
  return <span className={`friendStatusChip is-${status}`} title={`${who}: ${statusLabels[status].toLowerCase()}`} aria-label={`${who}: ${statusLabels[status].toLowerCase()}`}>
    <i aria-hidden="true">{statusMarks[status]}</i>{who}
  </span>;
}

/** A pair card while the list loads: same identity row, "Hoy" chips and actions. */
function FriendSkeleton() {
  return <SkGroup as="ul" className="streakFriendList" label="Cargando tus rachas compartidas">
    <li className="streakFriend">
      <div className="streakFriendIdentity">
        <Sk shape="block" w={36} h={36} r={11} />
        <div><h4><Sk w="45%" /></h4><small><Sk w="30%" /></small></div>
        <b className="streakFriendCount"><Sk shape="block" w={20} h={25} r={4} /><Sk w="1.2ch" /></b>
      </div>
      <div className="friendToday"><span className="friendTodayLabel">Hoy</span><Sk shape="pill" w={58} h={26} /><Sk shape="pill" w={76} h={26} /></div>
      <div className="streakFriendActions"><Sk shape="block" w={92} h={36} r={11} /><span className="streakFriendSecondary"><Sk shape="block" w={112} h={36} r={11} /><Sk shape="block" w={72} h={36} r={11} /></span></div>
    </li>
  </SkGroup>;
}

/** Last known pairs per account, so reopening the panel shows them at once instead of an empty state. */
const lastKnown = new Map<string, FriendView[]>();

/**
 * Today's nudge in this pair, closing the loop: what you sent, whether it was seen,
 * their reply, and whether they acted afterwards — or what they sent you.
 */
function NudgeLoop({ friend, firstName }: { friend: FriendView; firstName: string }) {
  const nudge = friend.nudge;
  if (!nudge) return null;
  if (!nudge.fromMe) return <p className="nudgeLoop"><span aria-hidden="true">👋</span> {firstName} te dio un toque: <q>{nudgeText(nudge.message)}</q>{nudge.reply && <> · Respondiste <q>{replyText(nudge.reply)}</q></>}</p>;
  const reply = replyText(nudge.reply);
  return <div className="nudgeLoop isMine">
    <p>Enviaste <q>{nudgeText(nudge.message)}</q>{nudge.seen && <span className="nudgeSeen"> · Visto</span>}</p>
    {reply && <p>{firstName} respondió: <q>{reply}</q></p>}
    {friend.theirs === "active" && <p className="nudgeHelped">{firstName} cuidó la racha después de tu toque 🔥</p>}
  </div>;
}

export function StreakFriends() {
  const { userId, today } = usePersonal();
  const [friends, setFriendsState] = useState<FriendView[]>(() => lastKnown.get(userId) ?? []), [nudges, setNudges] = useState<NudgeView[]>([]);
  // "Loaded" only once the server has answered (or the live feed has pairs): the listener's first
  // snapshot can be an empty local cache, which would flash "no friends" before the real list.
  const [loaded, setLoaded] = useState(() => lastKnown.has(userId));
  const setFriends = (update: FriendView[] | ((value: FriendView[]) => FriendView[])) => setFriendsState((value) => {
    const next = typeof update === "function" ? update(value) : update;
    lastKnown.set(userId, next);
    return next;
  });
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  // Feedback lives next to what caused it: per friend card, or "nudges" for the banner.
  const [feedback, setFeedback] = useState<{ target: string; text: string; tone: "ok" | "error" } | null>(null);
  const [ending, setEnding] = useState("");
  const sent = useRef(new Set<string>());
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true, stop: (() => void) | undefined;
    sent.current.clear();
    setFriendsState(lastKnown.get(userId) ?? []); setLoaded(lastKnown.has(userId));
    void watchSocial(userId, (value) => { if (active && (value.length || lastKnown.has(userId))) { setFriends(value.map((entry) => ({ ...entry, nudged: entry.nudged || sent.current.has(entry.id) }))); setLoaded(true); } },
      (value) => { if (active) setNudges(value); },
      (reason) => { if (active) { setError(streakError(reason)); setLoaded(true); } }).then((fn) => { if (active) stop = fn; else fn(); }).catch((reason) => { if (active) { setError(streakError(reason)); setLoaded(true); } });
    const refresh = () => { void streakCommand<FriendView[]>("friends").then((value) => { if (active) { value.filter((f) => f.nudged).forEach((f) => sent.current.add(f.id)); setFriends(value); setLoaded(true); } }).catch((reason) => { if (active) { setError(streakError(reason)); setLoaded(true); } }); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; stop?.(); window.removeEventListener("focus", refresh); };
  }, [userId, today]);

  async function action(kind: string, target: string, data: Record<string, unknown> = {}, label = "") {
    if (busy) return;
    setBusy(kind); setFeedback(null);
    try {
      await streakCommand(kind, data);
      if (kind === "nudge") {
        sent.current.add(String(data.pairId));
        setFriends((value) => value.map((f) => f.id === data.pairId ? { ...f, nudged: true, nudge: { fromMe: true, message: String(data.message), seen: false, reply: null } } : f));
      }
      setEnding("");
      if (label) setFeedback({ target, text: label, tone: "ok" });
    } catch (reason) { setFeedback({ target, text: streakError(reason), tone: "error" }); }
    finally { setBusy(""); }
  }
  const note = (target: string) => feedback?.target === target
    ? <p role={feedback.tone === "error" ? "alert" : "status"} className={feedback.tone === "error" ? "streakError" : "streakSuccess"}>{feedback.text}</p> : null;
  const inviteSomeone = () => { search.current?.scrollIntoView({ block: "center", behavior: "smooth" }); search.current?.focus({ preventScroll: true }); };
  const freeSlots = Math.max(0, FRIEND_LIMIT - friends.length);
  const unreadNudges = nudges.filter((entry) => !entry.read && entry.day >= today - 7);

  return <section className="streakFriends">
    {unreadNudges.map((entry) => <ReceivedNudge key={entry.id} nudge={entry} />)}
    <PendingIncoming key={`pending-${userId}`} uid={userId} />

    <div className="streakSectionHead"><h3>Constancia compartida</h3><span>{loaded ? friends.length : <Sk inline w="1ch" />}/{FRIEND_LIMIT} parejas</span></div>
    <p className="streakHint">La racha crece cuando ambos actúan en el mismo día UTC. La protección conserva el contador, sin aumentarlo.</p>
    {!loaded && <FriendSkeleton />}
    {loaded && friends.length === 0 && <div className="streakEmpty"><PixelFlame state="dim" motion="breathe" /><h4>Un camino para recorrer juntos</h4><p>Comparte tu código de amigo o introduce el suyo. Cada uno conserva su actividad privada.</p>
      <button type="button" className="streakPrimary" onClick={inviteSomeone}>Añadir un amigo</button></div>}
    {friends.length > 0 && <ul className="streakFriendList">
      {friends.map((friend) => {
        const flame = pairFlame(friend);
        const firstName = friend.name.split(/\s+/)[0] || friend.name;
        return <li key={friend.id} className="streakFriend">
          <div className="streakFriendIdentity">
            {friend.photoURL ? <SkImg src={friend.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="streakFriendInitial" aria-hidden="true">{friend.name.slice(0, 1).toUpperCase()}</span>}
            <div><h4>{friend.name}</h4><small>Mejor racha: {friend.best}</small></div>
            <b className={`streakFriendCount is-${flame}`} aria-label={`Racha compartida: ${friend.current}`}><PixelFlame small state={flame} motion={flame === "dim" ? "breathe" : "idle"} />{friend.current}</b>
          </div>
          <div className="friendToday"><span className="friendTodayLabel">Hoy</span><StatusChip who="Tú" status={friend.mine} /><StatusChip who={firstName} status={friend.theirs} /></div>
          <div className="streakFriendActions">
            {/* The phrase is picked at random (nudgeCatalog.randomNudge); the loop line below shows which one went out. */}
            <button type="button" className={friend.theirs === "active" || friend.nudged ? undefined : "streakPrimary"} disabled={!!busy || friend.theirs === "active" || friend.nudged}
              onClick={() => void action("nudge", friend.id, { pairId: friend.id, message: randomNudge() })}>{friend.nudge && !friend.nudge.fromMe ? "Ya hubo toque hoy" : friend.nudged ? "Toque enviado hoy" : friend.theirs === "active" ? "Actividad lista" : "Dar toque"}</button>
            <span className="streakFriendSecondary">
              <button type="button" className="streakQuiet" disabled={!!busy} onClick={() => void action(friend.muted ? "unmute" : "mute", friend.id, { pairId: friend.id }, friend.muted ? "Toques activados." : "Toques silenciados.")}>{friend.muted ? "Activar toques" : "Silenciar toques"}</button>
              <button type="button" className="streakQuiet isDanger" disabled={!!busy} onClick={() => setEnding(friend.id)}>Finalizar</button>
            </span>
          </div>
          <NudgeLoop friend={friend} firstName={firstName} />
          {ending === friend.id && <div className="protectionConfirm isDanger"><p>Se cerrará la racha compartida con {friend.name}. Tu racha personal se conserva.</p>
            <button type="button" disabled={!!busy} onClick={() => void action("end", friend.id, { pairId: friend.id }, "Racha compartida finalizada.")}>Finalizar racha compartida</button>
            <button type="button" className="streakQuiet" disabled={!!busy} onClick={() => setEnding("")}>Cancelar</button></div>}
          {note(friend.id)}
        </li>;
      })}
      {freeSlots > 0 && <li className="friendSlot">
        <button type="button" onClick={inviteSomeone}><span aria-hidden="true">＋</span>Invita a alguien<small>{freeSlots === 1 ? "te queda 1 lugar" : `te quedan ${freeSlots} lugares`}</small></button>
      </li>}
    </ul>}
    {feedback && !friends.some((friend) => friend.id === feedback.target) && feedback.target !== "nudges" && note(feedback.target)}
    {error && <p role="alert" className="streakError">{error}</p>}

    <AddFriendCard key={`add-${userId}`} ref={search} uid={userId} friendCount={friends.length} />
    <RequestHistory key={`history-${userId}`} uid={userId} />
  </section>;
}
