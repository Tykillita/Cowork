import { getCoworkFirestore } from "../../lib/firebase";
import type { GitHubBranchWrite, PanelUser, Project, ProjectSchedule } from "../../types";
import { eventDocument, projectEventId } from "../activity/activityEvents";
import { readSchedule } from "../schedule/scheduleTime";
import { directoryDocument } from "../team/teamDirectory";
import { normalizePreviewUrl } from "./projectUrls";

async function database() {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw Object.assign(new Error("Firebase no está configurado."), { code: "cowork/firebase-not-configured" });
  return { db, api };
}

function readProject(id: string, value: Record<string, unknown>): Project | null {
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!id || !name || typeof value.ownerUid !== "string" || !value.ownerUid) return null;
  // Projects created before delivery dates existed have no `schedule`: "Sin fecha".
  const schedule = readSchedule(value.schedule);
  const iconUrl = normalizePreviewUrl(typeof value.iconUrl === "string" ? value.iconUrl : "");
  const policy = value.githubPolicy as { branchWrite?: unknown } | undefined;
  const branchWrite = policy?.branchWrite === "members" || policy?.branchWrite === "owner" ? policy.branchWrite : null;
  return {
    id,
    name,
    description: typeof value.description === "string" ? value.description : "",
    repositoryUrl: typeof value.repositoryUrl === "string" ? value.repositoryUrl : "",
    previewUrl: normalizePreviewUrl(typeof value.previewUrl === "string" ? value.previewUrl : ""),
    kind: "general",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    ownerUid: value.ownerUid,
    ...(schedule ? { schedule } : {}),
    ...(iconUrl ? { iconUrl } : {}),
    ...(branchWrite ? { githubPolicy: { branchWrite } } : {}),
  };
}

export async function watchProjects(
  userUid: string,
  onValue: (projects: Project[], unavailableCount: number) => void,
  onError: (error: Error) => void,
) {
  const { db, api } = await database();
  const projects = new Map<string, Project>();
  const subscriptions = new Map<string, () => void>();
  const settledProjects = new Set<string>();
  const unavailableProjects = new Set<string>();
  let accessLoaded = false;
  const publish = () => {
    if (!accessLoaded || [...subscriptions.keys()].some((id) => !settledProjects.has(id))) return;
    onValue(
      [...projects.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name)),
      unavailableProjects.size,
    );
  };
  const accessUnsubscribe = api.onSnapshot(api.collection(db, "users", userUid, "projectAccess"), { includeMetadataChanges: true }, (snapshot) => {
    accessLoaded = true;
    // A project created on this device is readable only once its batch reaches the
    // server; subscribing earlier is denied and would hide it until a reload.
    const ids = new Set(snapshot.docs.filter((entry) => !entry.metadata.hasPendingWrites).map((entry) => entry.id));
    for (const [id, unsubscribe] of subscriptions) {
      if (ids.has(id)) continue;
      unsubscribe();
      subscriptions.delete(id);
      settledProjects.delete(id);
      unavailableProjects.delete(id);
      projects.delete(id);
    }
    for (const id of ids) {
      if (subscriptions.has(id)) continue;
      const unsubscribe = api.onSnapshot(api.doc(db, "projects", id), (projectSnapshot) => {
        settledProjects.add(id);
        unavailableProjects.delete(id);
        if (!projectSnapshot.exists()) projects.delete(id);
        else {
          const project = readProject(projectSnapshot.id, projectSnapshot.data());
          if (project) projects.set(id, project);
          else projects.delete(id);
        }
        publish();
      }, (error) => {
        // One stale or inaccessible membership must not prevent every other
        // workspace from appearing in the picker.
        settledProjects.add(id);
        unavailableProjects.add(id);
        projects.delete(id);
        console.error("[Cowork] No se pudo leer un proyecto del catálogo", {
          projectId: id,
          code: "code" in error ? error.code : "unknown",
        });
        publish();
      });
      subscriptions.set(id, unsubscribe);
    }
    publish();
  }, onError);
  return () => {
    accessUnsubscribe();
    subscriptions.forEach((unsubscribe) => unsubscribe());
    subscriptions.clear();
  };
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "proyecto";
}

function ownerMembershipRecord(user: PanelUser) {
  const email = user.email.trim().toLowerCase();
  return {
    uid: user.id,
    email,
    emailLower: email,
    name: user.name.slice(0, 100),
    role: "owner",
    status: "active",
    joinedAt: new Date().toISOString(),
  };
}

export type ProjectDraft = { name: string; description: string; repositoryUrl: string; schedule: ProjectSchedule | null };

export async function createProject(input: ProjectDraft, user: PanelUser) {
  const name = input.name.trim().slice(0, 80);
  const description = input.description.trim().slice(0, 400);
  const repositoryUrl = input.repositoryUrl.trim().replace(/\/$/, "");
  if (!name) throw new Error("Escribe un nombre para el proyecto.");
  if (repositoryUrl && !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(repositoryUrl)) {
    throw new Error("Usa un enlace de repositorio de GitHub válido.");
  }

  const { db, api } = await database();
  const id = `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`;
  const createdAt = new Date().toISOString();
  const project: Project = {
    id, name, description, repositoryUrl: repositoryUrl.replace(/\.git$/, ""), previewUrl: "", kind: "general", createdAt, ownerUid: user.id,
    ...(input.schedule ? { schedule: input.schedule } : {}),
  };
  const projectRef = api.doc(db, "projects", id);
  const memberRef = api.doc(db, "projects", id, "members", user.id);
  const accessRef = api.doc(db, "users", user.id, "projectAccess", id);
  const batch = api.writeBatch(db);
  batch.set(projectRef, project);
  batch.set(memberRef, ownerMembershipRecord(user));
  batch.set(accessRef, { projectId: id, role: "owner", joinedAt: createdAt });
  batch.set(api.doc(db, "projects", id, "directory", user.id), directoryDocument(user.id, user.name, user.photoURL, true));
  // Immutable, server-timed proof that the owner created the project: it keeps the streak alive (no points).
  const eventId = projectEventId(id);
  batch.set(api.doc(db, "projects", id, "events", eventId), eventDocument({
    id: eventId, projectId: id, kind: "created", targetType: "project", targetId: id, targetTitle: name, revision: 1, actor: user, changes: {}, serverTime: api.serverTimestamp(),
  }));
  await batch.commit();
  return project;
}

export async function getProject(projectId: string) {
  const { db, api } = await database();
  const snapshot = await api.getDoc(api.doc(db, "projects", projectId));
  return snapshot.exists() ? readProject(snapshot.id, snapshot.data()) : null;
}

/** Preview page and optional icon, saved together. An empty icon removes the field. */
export async function updateProjectPreviewUrl(projectId: string, previewUrl: string, iconUrl = "") {
  const normalized = normalizePreviewUrl(previewUrl);
  if (previewUrl.trim() && !normalized) throw new Error("Usa una URL pública segura que empiece con https://.");
  const icon = normalizePreviewUrl(iconUrl);
  if (iconUrl.trim() && !icon) throw new Error("La dirección del icono debe empezar con https://.");
  const { db, api } = await database();
  await api.updateDoc(api.doc(db, "projects", projectId), { previewUrl: normalized, iconUrl: icon || api.deleteField() });
  return normalized;
}

/** Owner-only: who may create and delete GitHub branches from Cowork. */
export async function updateProjectGitHubPolicy(projectId: string, branchWrite: GitHubBranchWrite) {
  const { db, api } = await database();
  await api.updateDoc(api.doc(db, "projects", projectId), { githubPolicy: { branchWrite } });
  return branchWrite;
}

/** Owner-only change; `null` returns the project to "Sin fecha de entrega". */
export async function updateProjectSchedule(projectId: string, schedule: ProjectSchedule | null) {
  const { db, api } = await database();
  await api.updateDoc(api.doc(db, "projects", projectId), { schedule: schedule ?? api.deleteField() });
  return schedule;
}
