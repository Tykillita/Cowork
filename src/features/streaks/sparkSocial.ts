import { collection, doc, getDocFromServer, getDocs, increment, query, serverTimestamp, setDoc, where, writeBatch,
  type DocumentData } from "firebase/firestore";
import { dayOf, pairHistory, type CalendarDay, type FriendView } from "./streakModel.ts";
import { fail, type Presence } from "./sparkRewards.ts";
import { ledgerTransaction } from "./sparkTransaction.ts";
import { DEFAULT_NUDGE, isNudgeMessage, isNudgeReply, type NudgeMessage, type NudgeReply } from "./nudgeCatalog.ts";
import { SparkInvitations } from "./sparkInvitations.ts";

export class SparkSocial extends SparkInvitations {
  async publishHistory() {
    const pairs = await getDocs(query(collection(this.db, "streakPairs"), where("memberUids", "array-contains", this.uid)));
    const active = pairs.docs.filter((entry) => entry.get("status") === "active");
    if (!active.length) return;
    const since = Math.min(...active.map((entry) => entry.get("since") as number));
    // Backfill only the public day status for relationships that existed before
    // the Spark upgrade. Source events, balances and protection stock stay private.
    const [days, protectedDays, published] = await Promise.all([
      getDocs(query(collection(this.db, "users", this.uid, "activeDays"), where("day", ">=", since))),
      getDocs(query(collection(this.db, "users", this.uid, "protectedDays"), where("day", ">=", since))),
      getDocs(query(collection(this.db, "streakPresence", this.uid, "days"), where("day", ">=", since))),
    ]);
    const known = new Map(published.docs.map((entry) => [entry.id, entry.get("kind")]));
    for (const [snap, kind] of [[days, "active"], [protectedDays, "protected"]] as const) {
      for (const entry of snap.docs) if (!known.has(entry.id)) await setDoc(this.rewards.visibleRef(entry.get("day")), { day: entry.get("day"), kind });
    }
    for (const entry of active) {
      const peer = (entry.get("memberUids") as string[]).find((uid) => uid !== this.uid)!;
      if (!(await getDocFromServer(this.link(this.uid, peer))).exists()) {
        const batch = writeBatch(this.db);
        batch.set(this.link(this.uid, peer), { pairId: entry.id }); batch.set(this.link(peer, this.uid), { pairId: entry.id });
        await batch.commit();
      }
    }
  }
  async calendar(uid: string, since: number, today: number): Promise<{ days: CalendarDay[]; current: "active" | "protected" | "pending" }> {
    const [history, presence] = await Promise.all([
      getDocs(query(collection(this.db, "streakPresence", uid, "days"), where("day", ">=", since))),
      getDocFromServer(doc(this.db, "streakPresence", uid)),
    ]);
    const days: CalendarDay[] = history.docs.map((entry) => ({ day: entry.get("day"), kind: entry.get("kind"), points: 0, firstAt: null }));
    const forecast = presence.data() as Presence | undefined;
    if (forecast) for (let day = Math.max(forecast.from, since); day <= Math.min(forecast.through, today); day++)
      if (!days.some((entry) => entry.day === day)) days.push({ day, kind: "protected", points: 0, firstAt: null });
    const current = days.find((entry) => entry.day === today)?.kind;
    return { days, current: current === "active" || current === "protected" ? current : "pending" };
  }
  async friends(): Promise<FriendView[]> {
    await this.initialize(); await this.rewards.summary(); await this.publishHistory();
    const pairs = await getDocs(query(collection(this.db, "streakPairs"), where("memberUids", "array-contains", this.uid)));
    const today = dayOf(this.rewards.now());
    return Promise.all(pairs.docs.filter((entry) => entry.get("status") === "active").map(async (entry) => {
      const data = entry.data(), peer = (data.memberUids as string[]).find((id) => id !== this.uid)!;
      const [mine, theirs, nudge] = await Promise.all([this.calendar(this.uid, data.since, today), this.calendar(peer, data.since, today),
        getDocFromServer(doc(this.db, "streakPairs", entry.id, "nudges", String(today)))]);
      const result = pairHistory(mine.days, theirs.days, data.since, today);
      const receipt = nudge.data();
      return { id: entry.id, name: data.people[peer].name, photoURL: data.people[peer].photoURL,
        current: result.current, best: Math.max(data.best ?? 0, result.best), mine: mine.current, theirs: theirs.current,
        muted: data.muted.includes(this.uid), nudged: nudge.exists(),
        nudge: receipt ? { fromMe: receipt.fromUid === this.uid, message: isNudgeMessage(receipt.message) ? receipt.message : DEFAULT_NUDGE,
          seen: !!receipt.seenAt, reply: isNudgeReply(receipt.reply) ? receipt.reply : null } : undefined };
    }));
  }
  async manageFriend(id: string, action: "mute" | "unmute" | "end" | "nudge", message: NudgeMessage = DEFAULT_NUDGE) {
    await this.initialize();
    await ledgerTransaction(this.db, async (tx) => {
      const ref = this.pair(id), pair = await tx.get(ref), data = pair.data();
      if (!data || !data.memberUids.includes(this.uid) || data.status !== "active") fail("Esta racha compartida no está disponible.");
      const value = data as DocumentData, peer = (value.memberUids as string[]).find((uid) => uid !== this.uid)!;
      if (action === "end") {
        tx.update(ref, { status: "ended" });
        for (const uid of value.memberUids as string[]) tx.update(this.index(uid), { activeCount: increment(-1), lastPair: id });
      } else if (action === "mute" || action === "unmute") {
        tx.update(ref, { muted: action === "mute" ? [...new Set([...value.muted, this.uid])] : value.muted.filter((uid: string) => uid !== this.uid) });
      } else {
        const day = dayOf(this.rewards.now()), receiptRef = doc(this.db, "streakPairs", id, "nudges", String(day));
        const receipt = await tx.get(receiptRef), active = await tx.get(doc(this.db, "streakPresence", peer, "days", String(day)));
        if (receipt.exists()) { if (receipt.get("fromUid") === this.uid) return; fail("Esta pareja ya recibió un toque hoy."); }
        if (value.muted.includes(peer)) fail("Esta persona ha silenciado los toques.");
        if (active.get("kind") === "active") fail("Esta persona ya estuvo activa hoy.");
        if (!isNudgeMessage(message)) fail("Elige una de las frases disponibles.");
        tx.set(receiptRef, { fromUid: this.uid, day, message });
        tx.set(doc(this.db, "users", peer, "streakNudges", `${id}_${day}`), {
          pairId: id, fromUid: this.uid, name: value.people[this.uid].name, day, read: false, message, createdAt: serverTimestamp(),
        });
      }
    });
  }
  /** Marks a received nudge as read and lets the sender know it was seen. */
  async readNudge(id: string) {
    await ledgerTransaction(this.db, async (tx) => {
      const ref = this.rewards.ref(`streakNudges/${id}`), prior = await tx.get(ref);
      if (!prior.exists()) return;
      const receiptRef = doc(this.db, "streakPairs", prior.get("pairId"), "nudges", String(prior.get("day")));
      const receipt = await tx.get(receiptRef);
      if (receipt.exists() && receipt.get("fromUid") !== this.uid && !receipt.get("seenAt")) tx.update(receiptRef, { seenAt: serverTimestamp() });
      if (!prior.get("read")) tx.update(ref, { read: true });
    });
  }
  /** Answers a received nudge with a preset reply (once); also marks it seen and read. */
  async replyNudge(id: string, reply: NudgeReply) {
    if (!isNudgeReply(reply)) fail("Elige una de las respuestas disponibles.");
    await ledgerTransaction(this.db, async (tx) => {
      const ref = this.rewards.ref(`streakNudges/${id}`), prior = await tx.get(ref);
      if (!prior.exists()) fail("Este toque ya no está disponible.");
      const receiptRef = doc(this.db, "streakPairs", prior.get("pairId"), "nudges", String(prior.get("day")));
      const receipt = await tx.get(receiptRef);
      if (!receipt.exists() || receipt.get("fromUid") === this.uid) fail("Este toque ya no está disponible.");
      if (receipt.get("reply")) { if (receipt.get("reply") === reply) return; fail("Ya respondiste a este toque."); }
      tx.update(receiptRef, receipt.get("seenAt") ? { reply } : { reply, seenAt: serverTimestamp() });
      if (!prior.get("read")) tx.update(ref, { read: true });
    });
  }
}
