import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { getCoworkFirestore } from "../../lib/firebase";
import type { FriendRequestView, RequestDirection, RequestStatus } from "./friendCodes";
import { DAY_MS } from "./streakModel";
export type RequestCursor = string;
export interface RequestPage { items: FriendRequestView[]; next: RequestCursor | null }
export async function watchRequestPage(uidValue: string | readonly string[], direction: RequestDirection, cursor: RequestCursor | null,
  receive: (page: RequestPage) => void, error: (reason: Error) => void) {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw new Error("Firebase no está configurado.");
  const uids = [...new Set(typeof uidValue === "string" ? [uidValue] : uidValue)].filter(Boolean);
  const sources = new Map<string, QueryDocumentSnapshot<DocumentData>[]>();
  let alive = true;
  const parse = cursor ? /^(\d{1,15}):([a-f0-9]{48})$/.exec(cursor) : null;
  if (cursor && !parse) throw new Error("La página de solicitudes ya no está disponible.");
  const stops = uids.map((uid) => {
    const filters = [api.where(direction === "incoming" ? "recipientUid" : "ownerUid", "==", uid),
      api.orderBy("createdAt", "desc"), api.orderBy(api.documentId(), "desc"),
      ...(parse ? [api.startAfter(api.Timestamp.fromMillis(Number(parse[1])), parse[2])] : []), api.limit(21)];
    return api.onSnapshot(api.query(api.collection(db, "streakInvites"), ...filters), (snapshot) => {
      sources.set(uid, snapshot.docs);
      if (!alive || sources.size < uids.length) return;
      const entries = [...new Map([...sources.values()].flat().map((entry) => [entry.id, entry])).values()]
        .sort((a, b) => b.get("createdAt").toMillis() - a.get("createdAt").toMillis() || b.id.localeCompare(a.id));
      const page = entries.slice(0, 20);
      receive({ items: page.map((entry) => {
      const data = entry.data(), person = direction === "incoming" ? data.person : data.recipientPerson;
      return { id: entry.id, name: person?.name ?? "Invitación anterior", photoURL: person?.photoURL ?? "", direction,
        kind: data.kind === "streak" ? "streak" : "friend",
        status: data.status as RequestStatus, createdAt: data.createdAt?.toMillis() ?? 0,
        expiresAt: (data.createdAt?.toMillis() ?? 0) + 7 * DAY_MS };
      }), next: entries.length > 20 && page.length ? `${page.at(-1)!.get("createdAt").toMillis()}:${page.at(-1)!.id}` : null });
    }, error);
  });
  return () => { alive = false; stops.forEach((stop) => stop()); };
}
export async function watchPendingRequests(uidValue: string | readonly string[], receive: (count: number) => void, error: (reason: Error) => void) {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw new Error("Firebase no está configurado.");
  const uids = [...new Set(typeof uidValue === "string" ? [uidValue] : uidValue)].filter(Boolean);
  const sources = new Map<string, Map<string, number>>();
  const emit = () => receive([...new Map<string, number>([...sources.values()].flatMap((entries) => [...entries])).values()].filter((time) => time > Date.now()).length);
  const stops = uids.map((uid) => api.onSnapshot(api.query(api.collection(db, "streakInvites"), api.where("recipientUid", "==", uid), api.where("status", "==", "pending")), (snapshot) => {
    sources.set(uid, new Map<string, number>(snapshot.docs.map((entry) => [entry.id, (entry.get("createdAt")?.toMillis() ?? 0) + 7 * DAY_MS] as const))); emit();
  }, error));
  const timer = setInterval(emit, 60_000);
  return () => { clearInterval(timer); stops.forEach((stop) => stop()); };
}
