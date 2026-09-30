import { getCoworkFirestore } from "../../lib/firebase";
import type { FriendView, NudgeView } from "./streakModel";
import { DEFAULT_NUDGE, isNudgeMessage } from "./nudgeCatalog";

export async function streakCommand<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  const { runSparkCommand } = await import("./sparkBackend");
  return await runSparkCommand(action, data) as T;
}

export function streakError(error: unknown) {
  const reason = error as { code?: string; message?: string };
  if (reason.code === "cowork/precondition") return reason.message || "Esta operación no está disponible.";
  return "No se pudo actualizar la racha. Comprueba tu conexión y vuelve a intentarlo.";
}

export async function watchStreakState(uid: string, refresh: () => void, onError: (error: Error) => void) {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw new Error("Firebase no está configurado.");
  return api.onSnapshot(api.doc(db, "users", uid, "streak", "state"), refresh, onError);
}

export async function watchNudges(uid: string, onValue: (value: NudgeView[]) => void, onError: (error: Error) => void) {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw new Error("Firebase no está configurado.");
  return api.onSnapshot(api.query(api.collection(db, "users", uid, "streakNudges"), api.orderBy("createdAt", "desc"), api.limit(20)), (snapshot) => {
    onValue(snapshot.docs.map(toNudge));
  }, onError);
}
function toNudge(entry: { id: string; get: (field: string) => unknown }): NudgeView {
  return { id: entry.id, pairId: entry.get("pairId") as string, name: entry.get("name") as string, day: entry.get("day") as number,
    read: entry.get("read") as boolean, message: isNudgeMessage(entry.get("message")) ? entry.get("message") as string : DEFAULT_NUDGE };
}

export async function watchSocial(uid: string, onFriends: (value: FriendView[]) => void,
  onNudges: (value: NudgeView[]) => void, onError: (error: Error) => void) {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw new Error("Firebase no está configurado.");
  let alive = true, running = false, again = false, timer: ReturnType<typeof setTimeout> | undefined;
  let details: (() => void)[] = [];
  const refresh = () => {
    if (!alive) return;
    again = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (running) return;
      running = true;
      void (async () => {
        do {
          again = false;
          try { const value = await streakCommand<FriendView[]>("friends"); if (alive) onFriends(value); }
          catch (error) { if (alive) onError(error as Error); break; }
        } while (alive && again);
      })().finally(() => { running = false; });
    }, 100);
  };
  const stops = [
    api.onSnapshot(api.query(api.collection(db, "streakPairs"), api.where("memberUids", "array-contains", uid)), (snapshot) => {
      details.forEach((stop) => stop()); details = [];
      for (const entry of snapshot.docs.filter((pair) => pair.get("status") === "active")) {
        const data = entry.data(), peer = (data.memberUids as string[]).find((id) => id !== uid)!;
        for (const person of [uid, peer]) {
          details.push(api.onSnapshot(api.doc(db, "streakPresence", person), refresh, onError));
          details.push(api.onSnapshot(api.query(api.collection(db, "streakPresence", person, "days"), api.where("day", ">=", data.since)), refresh, onError));
        }
        details.push(api.onSnapshot(api.doc(db, "streakPairs", entry.id, "nudges", String(Math.floor(Date.now() / 86400000))), refresh, onError));
      }
      if (!snapshot.docs.some((entry) => entry.get("status") === "active")) onFriends([]);
      refresh();
    }, onError),
    api.onSnapshot(api.query(api.collection(db, "users", uid, "streakNudges"), api.orderBy("createdAt", "desc"), api.limit(20)), (snapshot) => {
      onNudges(snapshot.docs.map(toNudge));
    }, onError),
  ];
  return () => { alive = false; clearTimeout(timer); stops.forEach((stop) => stop()); details.forEach((stop) => stop()); };
}

export function readStreakInvite(value = window.location.href, depth = 0): string {
  if (depth > 3) return "";
  try {
    const url = new URL(value, window.location.origin), id = url.searchParams.get("streakInvite") || "";
    if (/^[a-f0-9]{48}$/.test(id)) return id;
    for (const key of ["continueUrl", "link"]) {
      const nested = url.searchParams.get(key);
      if (nested) { const result = readStreakInvite(nested, depth + 1); if (result) return result; }
    }
  } catch { /* Ignore an invalid external link. */ }
  return "";
}

/** Carries only the retirement notice through an email sign-in redirect, never the old token. */
export function readRetiredStreakNotice(value = window.location.href, depth = 0): boolean {
  if (depth > 3) return false;
  try {
    const url = new URL(value, window.location.origin);
    if (url.searchParams.get("streakCodeNotice") === "1") return true;
    for (const key of ["continueUrl", "link"]) {
      const nested = url.searchParams.get(key);
      if (nested && readRetiredStreakNotice(nested, depth + 1)) return true;
    }
  } catch { /* Ignore malformed links. */ }
  return false;
}
