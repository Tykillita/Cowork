import { getCoworkFirestore } from "../../lib/firebase";
import type { PanelUser, ProjectMember, Task, TeamDirectoryEntry } from "../../types";
import { readTask, updateTask } from "../workboard/firestoreWorkboard";
import { comparable } from "../../lib/text";

async function database() {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw Object.assign(new Error("Firebase no está configurado."), { code: "cowork/firebase-not-configured" });
  return { db, api };
}

export function safePhotoUrl(value: string) {
  return /^https:\/\/\S+$/.test(value) && value.length <= 1000 ? value : "";
}

export function directoryDocument(uid: string, name: string, photoURL: string, active: boolean) {
  return { uid, name: (name.trim() || "Miembro del equipo").slice(0, 100), photoURL: safePhotoUrl(photoURL), active, updatedAt: new Date().toISOString() };
}

function readEntry(uid: string, value: Record<string, unknown>): TeamDirectoryEntry {
  return {
    uid,
    name: typeof value.name === "string" ? value.name : "Miembro del equipo",
    photoURL: typeof value.photoURL === "string" ? value.photoURL : "",
    active: value.active === true,
  };
}

export async function watchDirectory(projectId: string, onValue: (entries: TeamDirectoryEntry[]) => void, onError: (error: Error) => void) {
  const { db, api } = await database();
  return api.onSnapshot(api.collection(db, "projects", projectId, "directory"), (snapshot) => {
    onValue(snapshot.docs.map((entry) => readEntry(entry.id, entry.data())).sort((a, b) => a.name.localeCompare(b.name, "es")));
  }, onError);
}

/** Every active member keeps their own name and avatar up to date. */
export async function ensureOwnDirectoryEntry(projectId: string, user: PanelUser) {
  const { db, api } = await database();
  const ref = api.doc(db, "projects", projectId, "directory", user.id);
  const snapshot = await api.getDoc(ref);
  const expected = directoryDocument(user.id, user.name, user.photoURL, true);
  if (snapshot.exists()) {
    const current = snapshot.data();
    if (current.active === true && current.name === expected.name && current.photoURL === expected.photoURL) return;
  }
  await api.setDoc(ref, expected);
}

// ─── Migration: directory and legacy task assignments ──────────────────────

export type MigrationPlan = {
  directory: { uid: string; name: string; active: boolean; reason: "missing" | "outdated" | "left" }[];
  assignments: { task: Task; uid: string; name: string }[];
  review: { task: Task; reason: "ambiguous" | "unknown" }[];
};

/**
 * Dry run: nothing is written. A legacy name is linked only when it matches
 * exactly one member; ambiguous or unknown names are listed for review.
 */
export async function planMigration(projectId: string): Promise<MigrationPlan> {
  const { db, api } = await database();
  const [members, directory, tasks] = await Promise.all([
    api.getDocs(api.collection(db, "projects", projectId, "members")),
    api.getDocs(api.collection(db, "projects", projectId, "directory")),
    api.getDocs(api.collection(db, "projects", projectId, "tasks")),
  ]);
  const activeMembers: ProjectMember[] = members.docs
    .filter((entry) => entry.data().status === "active")
    .map((entry) => ({ uid: entry.id, name: String(entry.data().name || ""), email: "", role: entry.data().role === "owner" ? "owner" : "member", joinedAt: "" }));
  const entries = new Map(directory.docs.map((entry) => [entry.id, readEntry(entry.id, entry.data())]));

  const plan: MigrationPlan = { directory: [], assignments: [], review: [] };
  for (const member of activeMembers) {
    const entry = entries.get(member.uid);
    if (!entry) plan.directory.push({ uid: member.uid, name: member.name, active: true, reason: "missing" });
    else if (!entry.active) plan.directory.push({ uid: member.uid, name: entry.name, active: true, reason: "outdated" });
  }
  for (const entry of entries.values()) {
    if (entry.active && !activeMembers.some((member) => member.uid === entry.uid)) {
      plan.directory.push({ uid: entry.uid, name: entry.name, active: false, reason: "left" });
    }
  }

  // Known names: members plus directory history, so former members also resolve.
  const byName = new Map<string, Set<string>>();
  const addName = (name: string, uid: string) => {
    const key = comparable(name);
    if (!key) return;
    byName.set(key, (byName.get(key) ?? new Set()).add(uid));
  };
  activeMembers.forEach((member) => addName(member.name, member.uid));
  const activeIds = new Set(activeMembers.map((member) => member.uid));
  for (const task of tasks.docs.map((entry) => readTask(entry.id, entry.data()))) {
    if (task.assigneeUid || !task.assignee.trim()) continue;
    const matches = [...(byName.get(comparable(task.assignee)) ?? [])];
    if (matches.length === 1 && activeIds.has(matches[0])) {
      const member = activeMembers.find((entry) => entry.uid === matches[0]);
      plan.assignments.push({ task, uid: matches[0], name: member?.name ?? task.assignee });
    } else {
      plan.review.push({ task, reason: matches.length > 1 ? "ambiguous" : "unknown" });
    }
  }
  return plan;
}

export async function applyMigration(projectId: string, plan: MigrationPlan, owner: PanelUser, onProgress?: (done: number, total: number) => void) {
  const { db, api } = await database();
  const total = plan.directory.length + plan.assignments.length;
  let done = 0;
  // Small batches keep every write within the security rules' document access limits.
  for (let index = 0; index < plan.directory.length; index += 5) {
    const batch = api.writeBatch(db);
    for (const entry of plan.directory.slice(index, index + 5)) {
      const current = await api.getDoc(api.doc(db, "projects", projectId, "directory", entry.uid));
      const photo = current.exists() ? String(current.data().photoURL || "") : "";
      batch.set(api.doc(db, "projects", projectId, "directory", entry.uid), directoryDocument(entry.uid, entry.name, photo, entry.active));
    }
    await batch.commit();
    done += Math.min(5, plan.directory.length - index);
    onProgress?.(done, total);
  }
  const failed: string[] = [];
  for (const { task, uid } of plan.assignments) {
    try {
      // The historical label stays; only the account reference is added.
      await updateTask(projectId, task, { ...task, assigneeUid: uid }, owner, { migration: true });
    } catch {
      failed.push(task.title);
    }
    done += 1;
    onProgress?.(done, total);
  }
  return { failed };
}
