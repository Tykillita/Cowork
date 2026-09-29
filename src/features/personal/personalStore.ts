import { getCoworkFirestore } from "../../lib/firebase";
import type { MotionPreference, PersonalPreferences, ProjectSort, SceneSelection } from "../../types";

async function database() {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw Object.assign(new Error("Firebase no está configurado."), { code: "cowork/firebase-not-configured" });
  return { db, api };
}

export const DEFAULT_PREFERENCES: PersonalPreferences = { favorites: [], order: [], sort: "recent", filter: "all", motion: "system" };
export const DEFAULT_SCENE: SceneSelection = { characterId: "farolero", landscapeId: "valle-nocturno" };

const strings = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

export function readPreferences(value: Record<string, unknown> | undefined): PersonalPreferences {
  if (!value) return DEFAULT_PREFERENCES;
  const sort: ProjectSort = value.sort === "name" || value.sort === "custom" ? value.sort : "recent";
  const motion: MotionPreference = value.motion === "full" || value.motion === "reduced" ? value.motion : "system";
  return { favorites: strings(value.favorites), order: strings(value.order), sort, filter: value.filter === "favorites" ? "favorites" : "all", motion };
}

// Preferences are cached per account so the first paint (and CardNav motion)
// does not wait for Firestore; Firestore stays the source across devices.
const cacheKey = (uid: string) => `cowork.preferences.${uid}`;

export function cachedPreferences(uid: string): PersonalPreferences {
  try { return readPreferences(JSON.parse(window.localStorage.getItem(cacheKey(uid)) || "null") ?? undefined); } catch { return DEFAULT_PREFERENCES; }
}

function cachePreferences(uid: string, value: PersonalPreferences) {
  try { window.localStorage.setItem(cacheKey(uid), JSON.stringify(value)); } catch { /* Optional cache. */ }
}

export async function watchPreferences(uid: string, onValue: (value: PersonalPreferences) => void, onError: (error: Error) => void) {
  const { db, api } = await database();
  return api.onSnapshot(api.doc(db, "users", uid, "preferences", "main"), (snapshot) => {
    const value = readPreferences(snapshot.exists() ? snapshot.data() : undefined);
    cachePreferences(uid, value);
    onValue(value);
  }, onError);
}

export async function savePreferences(uid: string, patch: Partial<PersonalPreferences>) {
  const { db, api } = await database();
  const current = cachedPreferences(uid);
  cachePreferences(uid, { ...current, ...patch });
  await api.setDoc(api.doc(db, "users", uid, "preferences", "main"), { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function watchScene(uid: string, onValue: (value: SceneSelection) => void, onError: (error: Error) => void) {
  const { db, api } = await database();
  return api.onSnapshot(api.doc(db, "users", uid, "preferences", "scene"), (snapshot) => {
    const data = snapshot.exists() ? snapshot.data() : {};
    onValue({
      characterId: typeof data.characterId === "string" ? data.characterId : DEFAULT_SCENE.characterId,
      landscapeId: typeof data.landscapeId === "string" ? data.landscapeId : DEFAULT_SCENE.landscapeId,
    });
  }, onError);
}

/** Rules refuse objects that are still locked for this account. */
export async function saveScene(uid: string, selection: SceneSelection) {
  const { db, api } = await database();
  await api.setDoc(api.doc(db, "users", uid, "preferences", "scene"), { ...selection, updatedAt: new Date().toISOString() });
}

// ─── Read state (per person and project) ────────────────────────────────────

export type ReadState = { lastReadAt: number; readIds: string[] };

export async function watchReadStates(uid: string, onValue: (states: Map<string, ReadState>) => void, onError: (error: Error) => void) {
  const { db, api } = await database();
  return api.onSnapshot(api.collection(db, "users", uid, "readState"), (snapshot) => {
    const states = new Map<string, ReadState>();
    for (const entry of snapshot.docs) {
      const data = entry.data();
      const time = data.lastReadAt && typeof data.lastReadAt.toMillis === "function" ? data.lastReadAt.toMillis() : Date.now();
      states.set(entry.id, { lastReadAt: time, readIds: strings(data.readIds) });
    }
    onValue(states);
  }, onError);
}

/** Marks one entry (event id or notice id) as read. */
export async function markRead(uid: string, projectId: string, entryId: string, current: ReadState | undefined) {
  const { db, api } = await database();
  const readIds = [...new Set([...(current?.readIds ?? []), entryId])].slice(-200);
  await api.setDoc(api.doc(db, "users", uid, "readState", projectId), {
    projectId,
    lastReadAt: current ? api.Timestamp.fromMillis(Math.min(current.lastReadAt, Date.now())) : api.Timestamp.fromMillis(0),
    readIds,
  });
}

/** "Marcar como leído": everything up to now, keeping notice ids so they do not come back. */
export async function markAllRead(uid: string, projectId: string, noticeIds: string[]) {
  const { db, api } = await database();
  await api.setDoc(api.doc(db, "users", uid, "readState", projectId), {
    projectId,
    lastReadAt: api.serverTimestamp(),
    readIds: [...new Set(noticeIds)].slice(-200),
  });
}
