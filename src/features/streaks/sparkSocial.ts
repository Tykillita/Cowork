import { collection, doc, documentId, getDocFromServer, getDocs, increment, limit, orderBy, query, serverTimestamp, setDoc, startAfter, Timestamp, where, writeBatch,
  type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import { dayOf, pairHistory, type CalendarDay, type FriendView, type FriendPage } from "./streakModel.ts";
import { fail, type Presence } from "./sparkRewards.ts";
import { ledgerTransaction } from "./sparkTransaction.ts";
import { DEFAULT_NUDGE, isNudgeMessage, isNudgeReply, type NudgeMessage, type NudgeReply } from "./nudgeCatalog.ts";
import { SparkInvitations } from "./sparkInvitations.ts";

export class SparkSocial extends SparkInvitations {
  async publishHistory() {
    const snapshots = await Promise.all(this.identityUids.map((uid) => getDocs(query(collection(this.db, "streakPairs"), where("memberUids", "array-contains", uid)))));
    const active = [...new Map(snapshots.flatMap((snapshot) => snapshot.docs)
      .filter((entry) => entry.get("status") === "active").map((entry) => [entry.id, entry])).values()];
    if (!active.length) return;
    const since = Math.min(...active.map((entry) => entry.get("since") as number));
    // Publish only the combined public day status; the source events, balances,
    // protection stock and project details remain private to each identity.
    const sources = await Promise.all(this.identityUids.flatMap((uid) => [
      getDocs(query(collection(this.db, "users", uid, "activeDays"), where("day", ">=", since))),
      getDocs(query(collection(this.db, "users", uid, "protectedDays"), where("day", ">=", since))),
    ]));
    const kinds = new Map<number, "active" | "protected">();
    for (let index = 0; index < sources.length; index++) for (const entry of sources[index].docs) {
      const day = Number(entry.get("day")), kind = index % 2 ? "protected" : "active";
      if (kind === "active" || !kinds.has(day)) kinds.set(day, kind);
    }
    const today = dayOf(this.rewards.now()), last = await this.rewards.summary();
    for (const uid of this.identityUids) {
      for (const [day, kind] of kinds) {
        if (day > today) continue;
        const ref = this.rewards.visibleRefFor(uid, day), prior = await getDocFromServer(ref);
        if (!prior.exists() || kind === "active" && prior.get("kind") !== "active") await setDoc(ref, { day, kind });
      }
      const activeToday = kinds.get(today) === "active", coveredYesterday = kinds.has(today - 1);
      const from = activeToday ? today + 1 : today;
      const through = from - 1 + (activeToday || coveredYesterday
        ? Math.max(0, last.state.shieldEnd - from + 1) + last.state.protectors : 0);
      const presence = doc(this.db, "streakPresence", uid), prior = await getDocFromServer(presence);
      if (!prior.exists() || prior.get("asOf") !== today || prior.get("from") !== from || prior.get("through") !== through)
        await setDoc(presence, { asOf: today, from, through });
    }
    for (const entry of active) {
      const self = this.selfUid(entry.get("memberUids") as string[]), peer = (entry.get("memberUids") as string[]).find((uid) => uid !== self)!;
      if (!(await getDocFromServer(this.link(self, peer))).exists()) {
        const batch = writeBatch(this.db);
        batch.set(this.link(self, peer), { pairId: entry.id }); batch.set(this.link(peer, self), { pairId: entry.id });
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
    return (await this.friendPage()).items;
  }
  async friendPage(cursor = ""): Promise<FriendPage> {
    await this.initialize(); await this.rewards.summary(); await this.publishHistory();
    let after: [Timestamp, string] | null = null;
    if (cursor) {
      const match = /^(\d{1,15}):([a-f0-9]{48})$/.exec(cursor);
      if (!match) return fail("La página de amigos ya no está disponible.");
      after = [Timestamp.fromMillis(Number(match[1])), match[2]];
    }
    const pages = await Promise.all(this.identityUids.map((uid) => getDocs(query(collection(this.db, "streakFriendships"),
      where("memberUids", "array-contains", uid), where("status", "==", "active"), orderBy("createdAt", "desc"),
      orderBy(documentId(), "desc"), ...(after ? [startAfter(...after)] : []), limit(21)))));
    const entries = [...new Map(pages.flatMap((page) => page.docs).map((entry) => [entry.id, entry])).values()]
      .sort((a, b) => b.get("createdAt").toMillis() - a.get("createdAt").toMillis() || b.id.localeCompare(a.id));
    const hasMore = entries.length > 20;
    const shown = entries.slice(0, 20);
    const items = (await Promise.all(shown.map((entry) => this.friendView(entry)))).filter((entry): entry is FriendView => !!entry);
    const last = shown.at(-1);
    return { items, next: hasMore && last ? `${last.get("createdAt").toMillis()}:${last.id}` : null };
  }
  async activeStreaks(): Promise<FriendView[]> {
    await this.initialize(); await this.rewards.summary(); await this.publishHistory();
    const pages = await Promise.all(this.identityUids.map((uid) => getDocs(query(collection(this.db, "streakPairs"),
      where("memberUids", "array-contains", uid), where("status", "==", "active"), limit(6)))));
    const pairs = [...new Map(pages.flatMap((page) => page.docs).map((entry) => [entry.id, entry])).values()]
      .sort((a, b) => Number(a.get("since")) - Number(b.get("since"))).slice(0, 5);
    const friends = await Promise.all(pairs.map((pair) => getDocFromServer(this.friendship(pair.get("friendshipId")))));
    return (await Promise.all(friends.map((friend) => friend.exists()
      ? this.friendView(friend as QueryDocumentSnapshot<DocumentData>) : null))).filter((entry): entry is FriendView => !!entry);
  }
  async friendView(entry: QueryDocumentSnapshot<DocumentData>): Promise<FriendView | null> {
    const friend = entry.data(), members = friend.memberUids as string[], self = this.selfUid(members), peer = this.peerUid(members);
    if (!self || !peer) return null;
    const pair = friend.pairId ? await getDocFromServer(this.pair(friend.pairId)) : null;
    const data = pair?.data();
    const identity = { uid: peer, friendshipId: entry.id, name: friend.people[peer].name,
      photoURL: friend.people[peer].photoURL, best: friend.best ?? 0 };
    if (!data || data.status !== "active") return { ...identity, id: entry.id, streakActive: false,
      current: 0, mine: "pending", theirs: "pending", muted: false, nudged: false };
    const today = dayOf(this.rewards.now());
      const [mine, theirs, nudge] = await Promise.all([this.calendar(self, data.since, today), this.calendar(peer, data.since, today),
        getDocFromServer(doc(this.db, "streakPairs", pair!.id, "nudges", String(today)))]);
      const result = pairHistory(mine.days, theirs.days, data.since, today);
      const receipt = nudge.data();
      return { ...identity, id: pair!.id, streakActive: true,
        current: result.current, best: Math.max(identity.best, result.best), mine: mine.current, theirs: theirs.current,
        muted: data.muted.includes(self), nudged: nudge.exists(),
        nudge: receipt ? { fromMe: this.identityUids.includes(receipt.fromUid), message: isNudgeMessage(receipt.message) ? receipt.message : DEFAULT_NUDGE,
          seen: !!receipt.seenAt, reply: isNudgeReply(receipt.reply) ? receipt.reply : null } : undefined };
  }
  async removeFriend(friendshipId: string) {
    await this.initialize();
    const friend = await getDocFromServer(this.friendship(friendshipId));
    if (!friend.exists() || !this.selfUid(friend.get("memberUids"))) return fail("Esta amistad ya no está disponible.");
    const pair = friend.get("pairId") ? await getDocFromServer(this.pair(friend.get("pairId"))) : null;
    if (pair?.get("status") === "active") return this.manageFriend(pair.id, "end", DEFAULT_NUDGE, true);
    await ledgerTransaction(this.db, async (tx) => {
      const current = await tx.get(friend.ref);
      if (current.get("status") !== "active") return;
      const active = current.get("pairId") ? await tx.get(this.pair(current.get("pairId"))) : null;
      if (active?.get("status") === "active") return fail("La amistad cambió. Vuelve a intentarlo.");
      tx.update(friend.ref, { status: "ended" });
    });
  }
  async manageFriend(id: string, action: "mute" | "unmute" | "end" | "nudge", message: NudgeMessage = DEFAULT_NUDGE, remove = false) {
    await this.initialize();
    const original = action === "end" ? await getDocFromServer(this.pair(id)) : null;
    const originalMembers = (original?.get("memberUids") ?? []) as string[], self = this.selfUid(originalMembers);
    if (action === "end" && !self) return fail("Esta racha compartida no está disponible.");
    const closed = original?.get("status") === "active" ? await Promise.all([
      this.calendar(self, original.get("since"), dayOf(this.rewards.now())),
      this.calendar(this.peerUid(originalMembers), original.get("since"), dayOf(this.rewards.now())),
    ]).then(([a, b]) => pairHistory(a.days, b.days, original.get("since"), dayOf(this.rewards.now()))) : null;
    await ledgerTransaction(this.db, async (tx) => {
      const ref = this.pair(id), pair = await tx.get(ref), data = pair.data();
      if (!data || !this.selfUid(data.memberUids) || !this.peerUid(data.memberUids) || data.status !== "active") fail("Esta racha compartida no está disponible.");
      const value = data as DocumentData, selfUid = this.selfUid(value.memberUids), peer = this.peerUid(value.memberUids);
      if (action === "end") {
        const friendRef = this.friendship(value.friendshipId), friend = await tx.get(friendRef);
        const best = Math.max(value.best ?? 0, closed?.best ?? 0);
        tx.update(ref, { status: "ended", best, closedCurrent: closed?.current ?? 0, endedAt: serverTimestamp() });
        tx.update(friendRef, { best: Math.max(friend.get("best") ?? 0, best), ...(remove ? { status: "ended" } : {}) });
        for (const uid of value.memberUids as string[]) tx.update(this.index(uid), { activeCount: increment(-1), lastPair: id });
      } else if (action === "mute" || action === "unmute") {
        tx.update(ref, { muted: action === "mute" ? [...new Set([...value.muted, selfUid])] : value.muted.filter((uid: string) => uid !== selfUid) });
      } else {
        const day = dayOf(this.rewards.now()), receiptRef = doc(this.db, "streakPairs", id, "nudges", String(day));
        const receipt = await tx.get(receiptRef), active = await tx.get(doc(this.db, "streakPresence", peer, "days", String(day)));
        if (receipt.exists()) { if (this.identityUids.includes(receipt.get("fromUid"))) return; fail("Esta pareja ya recibió un toque hoy."); }
        if (value.muted.includes(peer)) fail("Esta persona ha silenciado los toques.");
        if (active.get("kind") === "active") fail("Esta persona ya estuvo activa hoy.");
        if (!isNudgeMessage(message)) fail("Elige una de las frases disponibles.");
        tx.set(receiptRef, { fromUid: selfUid, day, message });
        tx.set(doc(this.db, "users", peer, "streakNudges", `${id}_${day}`), {
          pairId: id, fromUid: selfUid, name: value.people[selfUid].name, day, read: false, message, createdAt: serverTimestamp(),
        });
      }
    });
  }
  /** Marks a received nudge as read and lets the sender know it was seen. */
  async readNudge(id: string) {
    await ledgerTransaction(this.db, async (tx) => {
      const refs = this.identityUids.map((uid) => doc(this.db, "users", uid, "streakNudges", id));
      const priorEntries = await Promise.all(refs.map((ref) => tx.get(ref))), priorIndex = priorEntries.findIndex((entry) => entry.exists());
      if (priorIndex < 0) return;
      const ref = refs[priorIndex], prior = priorEntries[priorIndex];
      const receiptRef = doc(this.db, "streakPairs", prior.get("pairId"), "nudges", String(prior.get("day")));
      const receipt = await tx.get(receiptRef);
      if (receipt.exists() && !this.identityUids.includes(receipt.get("fromUid")) && !receipt.get("seenAt")) tx.update(receiptRef, { seenAt: serverTimestamp() });
      if (!prior.get("read")) tx.update(ref, { read: true });
    });
  }
  /** Answers a received nudge with a preset reply (once); also marks it seen and read. */
  async replyNudge(id: string, reply: NudgeReply) {
    if (!isNudgeReply(reply)) fail("Elige una de las respuestas disponibles.");
    await ledgerTransaction(this.db, async (tx) => {
      const refs = this.identityUids.map((uid) => doc(this.db, "users", uid, "streakNudges", id));
      const priorEntries = await Promise.all(refs.map((ref) => tx.get(ref))), priorIndex = priorEntries.findIndex((entry) => entry.exists());
      if (priorIndex < 0) fail("Este toque ya no está disponible.");
      const ref = refs[priorIndex], prior = priorEntries[priorIndex];
      const receiptRef = doc(this.db, "streakPairs", prior.get("pairId"), "nudges", String(prior.get("day")));
      const receipt = await tx.get(receiptRef);
      if (!receipt.exists() || this.identityUids.includes(receipt.get("fromUid"))) fail("Este toque ya no está disponible.");
      if (receipt.get("reply")) { if (receipt.get("reply") === reply) return; fail("Ya respondiste a este toque."); }
      tx.update(receiptRef, receipt.get("seenAt") ? { reply } : { reply, seenAt: serverTimestamp() });
      if (!prior.get("read")) tx.update(ref, { read: true });
    });
  }
}
