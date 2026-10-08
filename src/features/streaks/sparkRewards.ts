/**
 * Spark backend: clients submit transactions; Firestore Rules validate every
 * ledger entry, price and state transition. No privileged SDK or HTTP function.
 */
import { collection, collectionGroup, doc, getDocFromServer, getDocs, query, where,
  serverTimestamp, setDoc, Timestamp, type Firestore, type Transaction, type DocumentData } from "firebase/firestore";
import { DAY_MS, POINT_LIMIT, PROTECTION_PRICES, buyProtection, dayOf, initialProtection, reconcile,
  type ProtectionState, type ProtectionProduct, type StreakSnapshot, type CalendarDay, type Celebration } from "./streakModel.ts";

import { ledgerTransaction } from "./sparkTransaction.ts";

export const fail = (message: string): never => { throw Object.assign(new Error(message), { code: "cowork/precondition" }); };
export const millis = (value: unknown): number | null => value instanceof Timestamp ? value.toMillis() : null;
export const workKey = (projectId: string, eventId: string, event: DocumentData) => event.targetType === "branch"
  ? `${projectId}__branch~${String(event.targetTitle).trim().toLowerCase().replaceAll("/", "~")}` : `${projectId}__${eventId}`;
export const walletData = (value?: DocumentData) => ({
  balance: value?.balance ?? 0, earned: value?.earned ?? 0, spent: value?.spent ?? 0,
  lastAward: value?.lastAward ?? "", lastPurchase: value?.lastPurchase ?? "",
});
export type Presence = { asOf: number; from: number; through: number };
export function coverage(state: ProtectionState, today: number, active: boolean, previousCovered: boolean): Presence {
  const from = active ? today + 1 : today;
  const length = active || previousCovered ? Math.max(0, state.shieldEnd - from + 1) + state.protectors : 0;
  return { asOf: today, from, through: from - 1 + length };
}

export class SparkRewards {
  db: Firestore;
  uid: string;
  identityUids: string[];
  serverAt = 0;
  monotonicAt = 0;
  constructor(db: Firestore, uid: string, identityUids: readonly string[] = [uid]) {
    this.db = db; this.uid = uid; this.identityUids = [...new Set(identityUids)].filter(Boolean);
    if (!this.identityUids.includes(uid)) this.identityUids.unshift(uid);
  }
  ref(path: string) { return doc(this.db, "users", this.uid, ...path.split("/")); }
  presenceRef() { return doc(this.db, "streakPresence", this.uid); }
  presenceRefFor(uid: string) { return doc(this.db, "streakPresence", uid); }
  visibleRef(day: number) { return doc(this.db, "streakPresence", this.uid, "days", String(day)); }
  visibleRefFor(uid: string, day: number) { return doc(this.db, "streakPresence", uid, "days", String(day)); }
  now() { return this.serverAt ? this.serverAt + performance.now() - this.monotonicAt : Date.now(); }
  async syncClock(force = false) {
    if (!force && this.serverAt && performance.now() - this.monotonicAt < 300_000) return;
    const ref = this.ref("streakClock/time");
    await setDoc(ref, { at: serverTimestamp() });
    const at = millis((await getDocFromServer(ref)).get("at"));
    if (at !== null) { this.serverAt = at; this.monotonicAt = performance.now(); }
  }
  async initialize() {
    await this.syncClock();
    const today = dayOf(this.now());
    await ledgerTransaction(this.db, async (tx) => {
      const ref = this.ref("streak/state"), stored = await tx.get(ref);
      if (!stored.exists()) tx.set(ref, initialProtection(today));
    });
  }
  async recordEvent(projectId: string, eventId: string) {
    await this.initialize();
    await this.closeDays();
    await this.credit(projectId, eventId);
    await this.closeDays(); // Also handles a UTC rollover during crediting.
    await this.publishPresence();
  }
  /** Credit only immutable work proofs accepted by Firestore, never UI actions. */
  async credit(projectId: string, eventId: string) {
    await ledgerTransaction(this.db, async (tx) => {
      const eventDoc = await tx.get(doc(this.db, "projects", projectId, "events", eventId)), event = eventDoc.data();
      if (!event) return;
      if (!this.identityUids.includes(String(event.actorUid))) fail("Esta actividad no pertenece a tu cuenta.");
      const eligible = event.kind === "created" && ["task", "branch", "project"].includes(event.targetType)
        || event.kind === "updated" && event.targetType === "task" && event.changes?.status && event.changes.status.from !== event.changes.status.to;
      if (!eligible) return;
      const at = millis(event.createdAt);
      if (at === null) fail("La actividad todavía no está confirmada.");
      // A created project activates the day (calendar, presence, celebration) but never pays points.
      const paysPoints = event.targetType !== "project";
      const day = dayOf(at!), key = workKey(projectId, eventId, event);
      const receiptRef = this.ref(`workReceipts/${key}`);
      if ((await tx.get(receiptRef)).exists()) return;
      const dailyRefs = this.identityUids.filter((uid) => uid !== this.uid).map((uid) => doc(this.db, "users", uid, "pointDays", String(day)));
      const refs = [this.ref("streak/state"), this.ref(`activeDays/${day}`), this.ref("progress/summary"),
        this.ref(`pointEvents/${key}`), this.ref(`pointDays/${day}`), this.ref("progress/wallet"), receiptRef];
      const [stored, active, summary, point, daily, wallet, receipt, ...identityDaily] = await Promise.all([...refs, ...dailyRefs].map((ref) => tx.get(ref)));
      const state = stored.data() as ProtectionState;
      if (day < state.managedFrom || day <= state.lastSettledDay || receipt.exists()) return;
      if (event.targetType === "branch" && point.exists() && point.get("eventId") !== eventId) return;
      tx.set(refs[6], { projectId, eventId, day });
      if (!active.exists()) {
        tx.set(refs[1], { day, projectId, eventId, recordedAt: event.createdAt, key });
        tx.set(refs[2], { activeDays: (summary.get("activeDays") ?? 0) + 1,
          lastRecordedDay: Math.max(summary.get("lastRecordedDay") ?? day, day), lastCreditDay: day, updatedAt: serverTimestamp() });
      } else if ((millis(active.get("recordedAt")) ?? Infinity) > at!) {
        tx.set(refs[1], { day, projectId, eventId, recordedAt: event.createdAt, key });
      }
      tx.set(this.visibleRef(day), { day, kind: "active" });
      for (const uid of this.identityUids) if (uid !== this.uid) tx.set(this.visibleRefFor(uid, day), { day, kind: "active" });
      if (day === dayOf(this.now())) tx.set(this.presenceRef(), coverage(state, day, true, true));
      const totalPointsToday = (daily.get("points") ?? 0) + identityDaily.reduce((sum, entry) => sum + (entry.get("points") ?? 0), 0);
      if (paysPoints && !point.exists() && totalPointsToday < POINT_LIMIT) {
        const old = walletData(wallet.data());
        tx.set(refs[3], { projectId, eventId, day, recordedAt: serverTimestamp() });
        tx.set(refs[4], { day, points: (daily.get("points") ?? 0) + 1, lastAward: key, updatedAt: serverTimestamp() });
        tx.set(refs[5], { ...old, balance: old.balance + 1, earned: old.earned + 1, lastAward: key, updatedAt: serverTimestamp() });
      }
    });
  }
  /** Replay confirmed, unclaimed work before settling closed UTC days. */
  async catchUp(state: ProtectionState, includeToday = false) {
    const today = dayOf(this.now()), end = today + (includeToday ? 1 : 0), start = Math.max(state.managedFrom, state.lastSettledDay + 1);
    if (start >= end) return;
    const batches = await Promise.all(this.identityUids.map((uid) => getDocs(query(collectionGroup(this.db, "events"), where("actorUid", "==", uid),
      where("createdAt", ">=", Timestamp.fromMillis(start * DAY_MS)), where("createdAt", "<", Timestamp.fromMillis(end * DAY_MS))))));
    const events = new Map(batches.flatMap((batch) => batch.docs.map((event) => [event.ref.path, event] as const)));
    for (const event of events.values()) {
      const projectId = event.ref.parent.parent?.id;
      if (projectId) await this.credit(projectId, event.id);
    }
  }
  async closeDays() {
    const state = (await getDocFromServer(this.ref("streak/state"))).data() as ProtectionState;
    await this.catchUp(state);
    for (;;) {
      const finished = await ledgerTransaction(this.db, async (tx) => {
        const ref = this.ref("streak/state"), stored = await tx.get(ref), before = stored.data() as ProtectionState;
        const today = dayOf(this.now()), day = before.lastSettledDay + 1;
        if (day >= today) return true;
        const [active, previousActive, previousProtected, summary] = await Promise.all([
          tx.get(this.ref(`activeDays/${day}`)), tx.get(this.ref(`activeDays/${day - 1}`)),
          tx.get(this.ref(`protectedDays/${day - 1}`)), tx.get(this.ref("progress/summary")),
        ]);
        const alive = previousActive.exists() || previousProtected.exists();
        const shield = day >= before.shieldStart && day <= before.shieldEnd;
        const protect = !active.exists() && alive && (shield || before.protectors > 0);
        // Once a run has ended and there is no later recorded activity, an
        // arbitrarily long absence can be closed with one bounded transaction.
        const end = !alive && !active.exists() && (summary.get("lastRecordedDay") ?? -1) < day ? today - 1 : day;
        tx.update(ref, { lastSettledDay: end, protectors: before.protectors - (protect && !shield ? 1 : 0) });
        if (protect) tx.set(this.ref(`protectedDays/${day}`), { day, source: shield ? "shield" : "single" });
        if (protect || active.exists()) {
          const kind = active.exists() ? "active" : "protected";
          for (const uid of this.identityUids) tx.set(this.visibleRefFor(uid, day), { day, kind });
        }
        return end >= today - 1;
      });
      if (finished) return;
    }
  }
  async presenceInputs(tx: Transaction) {
    const today = dayOf(this.now());
    const [stored, active, previousActive, previousProtected] = await Promise.all([
      tx.get(this.ref("streak/state")), tx.get(this.ref(`activeDays/${today}`)),
      tx.get(this.ref(`activeDays/${today - 1}`)), tx.get(this.ref(`protectedDays/${today - 1}`)),
    ]);
    return { today, state: stored.data() as ProtectionState, active: active.exists(), previous: previousActive.exists() || previousProtected.exists() };
  }
  async publishPresence() {
    await ledgerTransaction(this.db, async (tx) => {
      const value = await this.presenceInputs(tx), previous = await Promise.all(this.identityUids.map((uid) => tx.get(this.presenceRefFor(uid))));
      const next = coverage(value.state, value.today, value.active, value.previous);
      previous.forEach((entry, index) => {
        if (!entry.exists() || entry.get("asOf") !== next.asOf || entry.get("from") !== next.from || entry.get("through") !== next.through)
          tx.set(this.presenceRefFor(this.identityUids[index]), next);
      });
    });
  }
  async summary(): Promise<StreakSnapshot> {
    await this.initialize(); await this.closeDays();
    await this.catchUp((await getDocFromServer(this.ref("streak/state"))).data() as ProtectionState, true);
    await this.publishPresence();
    const all = await Promise.all(this.identityUids.map(async (uid) => {
      const [state, active, protectedDays, points, progress] = await Promise.all([
        getDocFromServer(this.refFor(uid, "streak/state")), getDocs(collection(this.db, "users", uid, "activeDays")),
        getDocs(collection(this.db, "users", uid, "protectedDays")), getDocs(collection(this.db, "users", uid, "pointDays")),
        getDocFromServer(this.refFor(uid, "progress/summary")),
      ]);
      return { state, active, protectedDays, points, progress };
    }));
    const stored = all[this.identityUids.indexOf(this.uid)]?.state;
    const activeByDay = new Map<number, number | null>();
    for (const source of all) for (const entry of source.active.docs) {
      const day = Number(entry.get("day")), at = millis(entry.get("recordedAt"));
      const prior = activeByDay.get(day);
      if (!activeByDay.has(day) || (at !== null && (prior == null || at < prior))) activeByDay.set(day, at);
    }
    const days = [...activeByDay.keys()];
    const protectedByDay = new Map<number, ProtectionProduct>();
    for (const source of all) for (const entry of source.protectedDays.docs) {
      const day = Number(entry.get("day"));
      if (!activeByDay.has(day)) protectedByDay.set(day, entry.get("source") as ProtectionProduct);
    }
    const pointByDay = new Map<number, number>();
    for (const source of all) for (const entry of source.points.docs) {
      const day = Number(entry.get("day")); pointByDay.set(day, (pointByDay.get(day) ?? 0) + Number(entry.get("points") || 0));
    }
    const today = dayOf(this.now());
    const result = reconcile(stored.data() as ProtectionState, days,
      [...protectedByDay].map(([day, source]) => ({ day, source })), today);
    result.state.best = Math.max(result.state.best, ...all.map((source) => Number(source.state.get("best") ?? 0)));
    result.state.badges = [...new Map(all.flatMap((source) => {
      const badges = source.state.get("badges"); return Array.isArray(badges) ? badges as { id: string; day: number; label: string }[] : [];
    }).map((badge) => [badge.id, badge])).values()];
    const calendar: CalendarDay[] = days.map((day) => ({ day, kind: "active", points: pointByDay.get(day) ?? 0, firstAt: activeByDay.get(day) ?? null }));
    for (const entry of result.protectedDays) if (!days.includes(entry.day)) calendar.push({ day: entry.day, kind: "protected", points: 0, firstAt: null });
    calendar.sort((a, b) => a.day - b.day);
    return { state: result.state, calendar, activeDays: Math.max(...all.map((source) => Number(source.progress.get("activeDays") ?? 0)), days.length), today };
  }
  async purchase(product: ProtectionProduct, requestId: string) {
    if ((product !== "single" && product !== "shield") || !/^[a-zA-Z0-9_-]{1,80}$/.test(requestId)) fail("Compra no válida.");
    await this.summary();
    await ledgerTransaction(this.db, async (tx) => {
      const purchaseRef = this.ref(`protectionPurchases/${requestId}`), prior = await tx.get(purchaseRef);
      if (prior.exists()) { if (prior.get("product") !== product) fail("Esta operación corresponde a otra compra."); return; }
      const value = await this.presenceInputs(tx), walletRef = this.ref("progress/wallet"), wallet = await tx.get(walletRef);
      const old = walletData(wallet.data());
      let next: ProtectionState;
      try { next = buyProtection(value.state, product, value.today, old.balance); }
      catch (error) { return fail((error as Error).message); }
      const price = PROTECTION_PRICES[product];
      tx.set(this.ref("streak/state"), { ...next, lastPurchase: requestId });
      tx.set(purchaseRef, { product, price, day: value.today, acquiredAt: serverTimestamp() });
      tx.set(walletRef, { ...old, balance: old.balance - price, spent: old.spent + price,
        lastPurchase: `protection:${requestId}`, updatedAt: serverTimestamp() });
      tx.set(this.presenceRef(), coverage(next, value.today, value.active, value.previous));
    });
  }
  async claimCelebration(): Promise<Celebration | null> {
    const value = await this.summary(), day = value.today;
    if (!value.calendar.some((entry) => entry.day === day && entry.kind === "active")) return null;
    return ledgerTransaction(this.db, async (tx) => {
      const ref = this.ref(`streakCelebrations/${day}`), prior = await tx.get(ref);
      if (prior.exists()) return null;
      tx.set(ref, { day, claimedAt: serverTimestamp() });
      return { current: value.state.current, resumed: value.calendar.some((entry) => entry.day === day - 1 && entry.kind === "protected"),
        badges: value.state.badges.filter((entry) => entry.day === day).map((entry) => entry.label) };
    });
  }
  refFor(uid: string, path: string) { return doc(this.db, "users", uid, ...path.split("/")); }
}
