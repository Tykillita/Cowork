import { useState } from "react";
import type { NudgeView } from "./streakModel";
import { NUDGE_REPLIES, nudgeText, type NudgeReply } from "./nudgeCatalog";
import { streakCommand, streakError } from "./streakClient";

const bellIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;

/**
 * A nudge you received: who, their phrase, and a one-tap preset reply (or just
 * "Entendido"). Used in Amigos, in Notificaciones → Para ti and in the live notice.
 */
export function ReceivedNudge({ nudge, onDone, className = "" }: { nudge: NudgeView; onDone?: () => void; className?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function run(action: "replyNudge" | "readNudge", reply?: NudgeReply) {
    if (busy) return;
    setBusy(true); setError("");
    try { await streakCommand(action, reply ? { id: nudge.id, reply } : { id: nudge.id }); onDone?.(); }
    catch (reason) { setError(streakError(reason)); }
    finally { setBusy(false); }
  }
  return <div className={`streakNudge ${className}`.trim()}>
    <span className="streakNudgeIcon" aria-hidden="true">{bellIcon}</span>
    <div className="streakNudgeBody">
      <p><strong>{nudge.name}</strong> te dio un toque</p>
      <q className="streakNudgePhrase">{nudgeText(nudge.message)}</q>
      <div className="nudgeReplies" role="group" aria-label={`Responder a ${nudge.name}`}>
        {(Object.keys(NUDGE_REPLIES) as NudgeReply[]).map((reply) => <button key={reply} type="button" className="nudgeChip" disabled={busy} onClick={() => void run("replyNudge", reply)}>{NUDGE_REPLIES[reply]}</button>)}
        <button type="button" className="streakQuiet" disabled={busy} onClick={() => void run("readNudge")}>Entendido</button>
      </div>
      {error && <p role="alert" className="streakError">{error}</p>}
    </div>
  </div>;
}
