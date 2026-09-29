import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { getCoworkFirestore } from "../../lib/firebase";
import type { FriendRequestView, RequestDirection, RequestStatus } from "./friendCodes";
import { DAY_MS } from "./streakModel";
export type RequestCursor = QueryDocumentSnapshot<DocumentData>;
export interface RequestPage { items: FriendRequestView[]; next: RequestCursor | null }
export async function watchRequestPage(uid: string, direction: RequestDirection, cursor: RequestCursor | null,
  receive: (page: RequestPage) => void, error: (reason: Error) => void) {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw new Error("Firebase no está configurado.");
  const filters = [api.where(direction === "incoming" ? "recipientUid" : "ownerUid", "==", uid),
    api.orderBy("createdAt", "desc"), api.orderBy(api.documentId(), "desc"), ...(cursor ? [api.startAfter(cursor)] : []), api.limit(21)];
  return api.onSnapshot(api.query(api.collection(db, "streakInvites"), ...filters), (snapshot) => {
    const entries = snapshot.docs.slice(0, 20);
    receive({ items: entries.map((entry) => {
      const data = entry.data(), person = direction === "incoming" ? data.person : data.recipientPerson;
      return { id: entry.id, name: person?.name ?? "Invitación anterior", photoURL: person?.photoURL ?? "", direction,
        status: data.status as RequestStatus, createdAt: data.createdAt?.toMillis() ?? 0,
        expiresAt: (data.createdAt?.toMillis() ?? 0) + 7 * DAY_MS };
    }), next: snapshot.size > 20 ? entries.at(-1)! : null });
  }, error);
}
export async function watchPendingRequests(uid: string, receive: (count: number) => void, error: (reason: Error) => void) {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw new Error("Firebase no está configurado.");
  let expiries: number[] = [];
  const emit = () => receive(expiries.filter((time) => time > Date.now()).length);
  const stop = api.onSnapshot(api.query(api.collection(db, "streakInvites"), api.where("recipientUid", "==", uid), api.where("status", "==", "pending")), (snapshot) => {
    expiries = snapshot.docs.map((entry) => (entry.get("createdAt")?.toMillis() ?? 0) + 7 * DAY_MS); emit();
  }, error);
  const timer = setInterval(emit, 60_000);
  return () => { clearInterval(timer); stop(); };
}
