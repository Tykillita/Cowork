import { getCoworkFirestore } from "../../lib/firebase";
import type { PointMovement, ProgressSummary, WalletSnapshot } from "../../types";
import { findItem, priceOf } from "../ambient/sceneCatalog";
import type { SavedEvent } from "../workboard/firestoreWorkboard";

const DAY_MS = 86_400_000;
/** Points one account can earn per UTC day, across projects and devices (enforced by the server). */
export const DAILY_POINT_LIMIT = 3;

const coded = (message: string, code: string) => Object.assign(new Error(message), { code });

async function database() {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw Object.assign(new Error("Firebase no está configurado."), { code: "cowork/firebase-not-configured" });
  return { db, api };
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

/** Days since the Unix epoch in UTC; the same value on every device and time zone. */
export function utcDay(time: number) {
  return Math.floor(time / DAY_MS);
}

/** Current and best run of consecutive UTC days. The current run survives until the next day ends. */
export function streaks(days: number[], today: number) {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    run = index > 0 && sorted[index] === sorted[index - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const last = sorted[sorted.length - 1];
  const current = last !== undefined && today - last <= 1 ? run : 0;
  return { current, best };
}

/** Local time at which the next UTC day starts. */
export function nextUtcDayStart(now = Date.now()) {
  return new Date((utcDay(now) + 1) * DAY_MS);
}

/** Stored wallet. `lastAward` and `lastPurchase` let the rules tie each change to its marker or item. */
export type WalletState = { balance: number; earned: number; spent: number; lastAward: string; lastPurchase: string };
export const EMPTY_WALLET: WalletState = { balance: 0, earned: 0, spent: 0, lastAward: "", lastPurchase: "" };

export function readWallet(value: Record<string, unknown> | undefined): WalletState {
  if (!value) return EMPTY_WALLET;
  const count = (entry: unknown) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0 ? entry : 0;
  const earned = count(value.earned);
  const spent = count(value.spent);
  return {
    balance: earned - spent,
    earned,
    spent,
    lastAward: typeof value.lastAward === "string" ? value.lastAward : "",
    lastPurchase: typeof value.lastPurchase === "string" ? value.lastPurchase : "",
  };
}

/**
 * Id of the marker that proves a reward was paid. One per work event, except
 * branches: they are rewarded once per name in a project (case and slashes
 * ignored), so registering the same branch again never pays twice. The server
 * computes the same key.
 */
export function pointKey(projectId: string, eventId: string, target?: { targetType?: unknown; targetTitle?: unknown }) {
  if (target?.targetType === "branch" && typeof target.targetTitle === "string") {
    return `${projectId}__branch~${target.targetTitle.trim().toLowerCase().replaceAll("/", "~")}`;
  }
  return `${projectId}__${eventId}`;
}

/** Points earned during `today` (a UTC day) according to the stored daily counters. */
export function pointsOn(recentDays: { day: number; points: number }[], today: number) {
  return recentDays.find((entry) => entry.day === today)?.points ?? 0;
}

/** The wallet after earning one point, or null when the day's limit is already reached. */
export function awardPoint(wallet: WalletState, pointsToday: number, key: string): WalletState | null {
  if (pointsToday >= DAILY_POINT_LIMIT) return null;
  return { ...wallet, balance: wallet.balance + 1, earned: wallet.earned + 1, lastAward: key };
}

/** The wallet after buying one item; refuses when the balance does not cover the price. */
export function spendPoints(wallet: WalletState, itemId: string, price: number): WalletState {
  if (wallet.balance < price) throw coded("No tienes puntos suficientes.", "cowork/insufficient-points");
  return { ...wallet, balance: wallet.balance - price, spent: wallet.spent + price, lastPurchase: itemId };
}

// ─── Retry queue ────────────────────────────────────────────────────────────
// Recording the day never blocks or undoes the saved work: failures stay in a
// small per-account queue of event references and are retried later.

const queueKey = (uid: string) => `cowork.progress-queue.${uid}`;

function readQueue(uid: string): SavedEvent[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(queueKey(uid)) || "[]");
    return Array.isArray(value) ? value.filter((entry) => entry && typeof entry.projectId === "string" && typeof entry.eventId === "string") : [];
  } catch { return []; }
}

function writeQueue(uid: string, queue: SavedEvent[]) {
  try {
    if (queue.length) window.localStorage.setItem(queueKey(uid), JSON.stringify(queue.slice(-50)));
    else window.localStorage.removeItem(queueKey(uid));
  } catch { /* The next saved work will enqueue again. */ }
}

const flushing = new Map<string, Promise<void>>();

/** The server validates accepted work and credits the day and points atomically. */
async function recordOne(_uid: string, saved: SavedEvent) {
  const { streakCommand } = await import("../streaks/streakClient");
  await streakCommand("recordEvent", { projectId: saved.projectId, eventId: saved.eventId });
  return true;
}
export function flushProgressQueue(uid: string): Promise<void> {
  const running = flushing.get(uid);
  if (running) return running;
  const same = (a: SavedEvent, b: SavedEvent) => a.eventId === b.eventId && a.projectId === b.projectId;
  const task = (async () => {
    // Work saved while this flush runs is appended to the stored queue, so it
    // is re-read after each pass (and before each removal) instead of copied once.
    const attempted: SavedEvent[] = [];
    for (;;) {
      const pending = readQueue(uid).filter((entry) => !attempted.some((done) => same(done, entry)));
      if (!pending.length) break;
      for (const saved of pending) {
        attempted.push(saved);
        try {
          if (await recordOne(uid, saved)) writeQueue(uid, readQueue(uid).filter((entry) => !same(entry, saved)));
        } catch {
          // Offline or temporarily refused: keep it for the next attempt.
        }
      }
    }
  })().finally(() => flushing.delete(uid));
  flushing.set(uid, task);
  return task;
}

export function recordWork(uid: string, saved: SavedEvent | null) {
  if (!saved?.countsAsWork) return;
  const queue = readQueue(uid);
  if (!queue.some((entry) => entry.eventId === saved.eventId && entry.projectId === saved.projectId)) {
    writeQueue(uid, [...queue, saved]);
  }
  void flushProgressQueue(uid);
}

// ─── Live summary ───────────────────────────────────────────────────────────

export async function watchProgress(uidValue: string | readonly string[], onValue: (summary: ProgressSummary) => void, onError: (error: Error) => void) {
  const { db, api } = await database();
  const uids = [...new Set(typeof uidValue === "string" ? [uidValue] : uidValue)].filter(Boolean);
  const sources = new Map<string, { days: number[]; activeDays: number }>();
  const publish = () => {
    const days = [...new Set([...sources.values()].flatMap((source) => source.days))].sort((a, b) => a - b);
    const activeDays = Math.max(0, ...[...sources.values()].map((source) => source.activeDays));
    const { current, best } = streaks(days, utcDay(Date.now()));
    onValue({ activeDays: Math.max(activeDays, days.length), days, currentStreak: current, bestStreak: best });
  };
  const stops = uids.flatMap((uid) => [
    api.onSnapshot(api.collection(db, "users", uid, "activeDays"), (snapshot) => {
      sources.set(uid, { ...(sources.get(uid) ?? { activeDays: 0, days: [] }), days: snapshot.docs.map((entry) => Number(entry.data().day)).filter(Number.isFinite) });
      publish();
    }, onError),
    api.onSnapshot(api.doc(db, "users", uid, "progress", "summary"), (snapshot) => {
      sources.set(uid, { ...(sources.get(uid) ?? { activeDays: 0, days: [] }), activeDays: snapshot.exists() && typeof snapshot.data().activeDays === "number" ? snapshot.data().activeDays : 0 });
      publish();
    }, onError),
  ]);
  return () => stops.forEach((stop) => stop());
}

// ─── Points and shop ────────────────────────────────────────────────────────

async function importMergedWallet(uid: string, sourceUids: readonly string[], mergeId: string, db: import("firebase/firestore").Firestore,
  api: typeof import("firebase/firestore")) {
  if (sourceUids.length !== 2 || !mergeId) return false;
  const markerRef = api.doc(db, "accountMerges", mergeId, "imports", "wallet");
  const existing = await api.getDocFromServer(markerRef);
  if (existing.exists()) return true;
  const walletRefs = sourceUids.map((sourceUid) => api.doc(db, "users", sourceUid, "progress", "wallet"));
  await api.runTransaction(db, async (transaction) => {
    const marker = await transaction.get(markerRef);
    if (marker.exists()) return;
    const wallets = await Promise.all(walletRefs.map((ref) => transaction.get(ref)));
    const ownIndex = sourceUids.indexOf(uid);
    if (ownIndex < 0) throw coded("El perfil principal no coincide con las cuentas fusionadas.", "cowork/merge-profile-mismatch");
    const own = readWallet(wallets[ownIndex]?.data());
    const totals = wallets.reduce((sum, wallet) => {
      const value = readWallet(wallet.data());
      sum.earned += value.earned; sum.spent += value.spent;
      return sum;
    }, { earned: 0, spent: 0 });
    transaction.set(walletRefs[ownIndex], { ...own, balance: totals.earned - totals.spent,
      earned: totals.earned, spent: totals.spent, updatedAt: api.serverTimestamp() });
    transaction.set(markerRef, { earned: totals.earned, spent: totals.spent, importedAt: api.serverTimestamp() });
  });
  return true;
}

/** The wallet and the counters of the latest days; the caller decides which day is "today". */
export async function watchWallet(uid: string, onValue: (wallet: WalletSnapshot) => void, onError: (error: Error) => void,
  sourceUids: readonly string[] = [uid], mergeId = "") {
  const { db, api } = await database();
  const uids = [...new Set(sourceUids)].filter(Boolean);
  let walletUids = uids;
  if (mergeId && uids.length === 2) {
    try { if (await importMergedWallet(uid, uids, mergeId, db, api)) walletUids = [uid]; }
    catch (error) { onError(error as Error); }
  }
  const wallets = new Map<string, ReturnType<typeof readWallet>>();
  const recentDays = new Map<string, { day: number; points: number }[]>();
  const publish = () => {
    const values = [...wallets.values()];
    const totals = values.reduce((sum, value) => ({ balance: sum.balance + value.balance, earned: sum.earned + value.earned, spent: sum.spent + value.spent }), { balance: 0, earned: 0, spent: 0 });
    const dayTotals = new Map<number, number>();
    for (const entry of [...recentDays.values()].flat()) dayTotals.set(entry.day, (dayTotals.get(entry.day) ?? 0) + entry.points);
    onValue({ ...totals, recentDays: [...dayTotals].map(([day, points]) => ({ day, points })).sort((a, b) => b.day - a.day).slice(0, 2) });
  };
  const stops = walletUids.flatMap((sourceUid) => [
    api.onSnapshot(api.doc(db, "users", sourceUid, "progress", "wallet"), (snapshot) => {
      wallets.set(sourceUid, readWallet(snapshot.exists() ? snapshot.data() : undefined)); publish();
    }, onError),
    api.onSnapshot(api.query(api.collection(db, "users", sourceUid, "pointDays"), api.orderBy("day", "desc"), api.limit(2)), (snapshot) => {
      recentDays.set(sourceUid, snapshot.docs.map((entry) => ({ day: Number(entry.data().day), points: Number(entry.data().points) || 0 }))); publish();
    }, onError),
  ]);
  return () => stops.forEach((stop) => stop());
}

/** The latest points earned and spent, newest first, to explain the balance. */
export async function watchMovements(uidValue: string | readonly string[], onValue: (movements: PointMovement[]) => void, onError: (error: Error) => void, count = 8) {
  const { db, api } = await database();
  const uids = [...new Set(typeof uidValue === "string" ? [uidValue] : uidValue)].filter(Boolean);
  const millis = (value: unknown) => value && typeof (value as { toMillis?: unknown }).toMillis === "function" ? (value as { toMillis: () => number }).toMillis() : 0;
  const earned = new Map<string, PointMovement[]>(), spent = new Map<string, PointMovement[]>(), protection = new Map<string, PointMovement[]>();
  const publish = () => onValue([...earned.values(), ...spent.values(), ...protection.values()].flat()
    .sort((a, b) => (b.at || Infinity) - (a.at || Infinity)).slice(0, count));
  const stops = uids.flatMap((uid) => [
    api.onSnapshot(api.query(api.collection(db, "users", uid, "pointEvents"), api.orderBy("recordedAt", "desc"), api.limit(count)), (snapshot) => {
      earned.set(uid, snapshot.docs.map((entry) => {
        const eventId = String(entry.data().eventId ?? "");
        const label = eventId.startsWith("branch-") ? "Rama registrada" : eventId.endsWith("-1") ? "Tarea creada" : "Estado de tarea cambiado";
        return { id: `${uid}:${entry.id}`, kind: "earn", points: 1, at: millis(entry.data().recordedAt), label };
      }));
      publish();
    }, onError),
    api.onSnapshot(api.query(api.collection(db, "users", uid, "inventory"), api.orderBy("acquiredAt", "desc"), api.limit(count)), (snapshot) => {
      spent.set(uid, snapshot.docs.map((entry) => ({ id: `${uid}:${entry.id}`, kind: "spend",
        points: Number(entry.data().price) || 0, at: millis(entry.data().acquiredAt), label: findItem(entry.id)?.name ?? entry.id })));
      publish();
    }, onError),
    api.onSnapshot(api.query(api.collection(db, "users", uid, "protectionPurchases"), api.orderBy("acquiredAt", "desc"), api.limit(count)), (snapshot) => {
      protection.set(uid, snapshot.docs.map((entry) => ({ id: `${uid}:${entry.id}`, kind: "spend", points: Number(entry.get("price")),
        at: millis(entry.get("acquiredAt")), label: entry.get("product") === "shield" ? "Escudo de siete días" : "Protector individual" })));
      publish();
    }, onError),
  ]);
  return () => stops.forEach((stop) => stop());
}

export async function watchInventory(uidValue: string | readonly string[], onValue: (itemIds: string[]) => void, onError: (error: Error) => void) {
  const { db, api } = await database();
  const uids = [...new Set(typeof uidValue === "string" ? [uidValue] : uidValue)].filter(Boolean);
  const sources = new Map<string, string[]>();
  const publish = () => onValue([...new Set([...sources.values()].flat())]);
  const stops = uids.map((uid) => api.onSnapshot(api.collection(db, "users", uid, "inventory"), (snapshot) => {
    sources.set(uid, snapshot.docs.map((entry) => entry.id)); publish();
  }, onError));
  return () => stops.forEach((stop) => stop());
}

/** Charges the price and adds the item in one transaction; an item is never bought twice. */
export async function purchaseItem(uid: string, itemId: string, sourceUids: readonly string[] = [uid]) {
  const item = findItem(itemId);
  const price = item ? priceOf(item) : null;
  if (price === null) throw coded("Este objeto no está en la tienda.", "cowork/not-for-sale");
  const { db, api } = await database();
  const uids = [...new Set(sourceUids)].filter(Boolean);
  const itemRef = api.doc(db, "users", uid, "inventory", itemId);
  const walletRef = api.doc(db, "users", uid, "progress", "wallet");
  await api.runTransaction(db, async (transaction) => {
    const owned = await Promise.all(uids.map((sourceUid) => transaction.get(api.doc(db, "users", sourceUid, "inventory", itemId))));
    if (owned.some((entry) => entry.exists())) throw coded("Ya tienes este objeto.", "cowork/already-owned");
    const wallet = await transaction.get(walletRef);
    const next = spendPoints(readWallet(wallet.exists() ? wallet.data() : undefined), itemId, price);
    transaction.set(itemRef, { itemId, price, acquiredAt: api.serverTimestamp() });
    transaction.set(walletRef, { ...next, updatedAt: api.serverTimestamp() });
  });
}
