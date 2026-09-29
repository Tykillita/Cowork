import { getCoworkFirestore } from "../../lib/firebase";
import type { AccessHistoryAction, AccessHistoryEntry, AccessRequestStatus, OwnAccessRequest, PanelUser, ProjectAccessLink, ProjectAccessRequest, ProjectMember } from "../../types";
import { directoryDocument } from "../team/teamDirectory";
import { ACCESS_LINK_LIFETIME_DAYS, isLinkUsable } from "./accessLinkPolicy";

async function database() {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw Object.assign(new Error("Firebase no está configurado."), { code: "cowork/firebase-not-configured" });
  return { db, api };
}

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "";
}

function readInstant(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return (value.toDate() as Date).toISOString();
  }
  return typeof value === "string" ? value : "";
}

function readMember(uid: string, value: Record<string, unknown>): ProjectMember {
  return {
    uid,
    name: typeof value.name === "string" ? value.name : "Miembro del equipo",
    email: typeof value.email === "string" ? value.email : "",
    role: value.role === "owner" ? "owner" : "member",
    joinedAt: typeof value.joinedAt === "string" ? value.joinedAt : "",
  };
}

function readLink(id: string, projectId: string, value: Record<string, unknown>): ProjectAccessLink {
  return {
    id,
    projectId,
    projectName: typeof value.projectName === "string" ? value.projectName : "",
    status: value.status === "active" ? "active" : "revoked",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    expiresAt: readInstant(value.expiresAt),
  };
}

function readRequestStatus(value: unknown): AccessRequestStatus {
  return value === "approved" || value === "rejected" ? value : "pending";
}

function readRequest(uid: string, projectId: string, value: Record<string, unknown>): ProjectAccessRequest {
  return {
    uid,
    projectId,
    name: typeof value.name === "string" ? value.name : "Persona sin nombre",
    email: typeof value.email === "string" ? value.email : "",
    linkId: typeof value.linkId === "string" ? value.linkId : "",
    status: readRequestStatus(value.status),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    ...(typeof value.decidedAt === "string" ? { decidedAt: value.decidedAt } : {}),
    // Requests created before retries existed count as the first attempt.
    attempt: typeof value.attempt === "number" ? value.attempt : 1,
    retryAllowed: value.retryAllowed === true,
    grantVersion: typeof value.grantVersion === "number" ? value.grantVersion : 0,
  };
}

const HISTORY_ACTIONS: AccessHistoryAction[] = ["requested", "approved", "rejected", "retry-allowed", "retry-withdrawn"];

function readHistory(id: string, value: Record<string, unknown>): AccessHistoryEntry {
  return {
    id,
    requesterUid: typeof value.requesterUid === "string" ? value.requesterUid : "",
    requesterName: typeof value.requesterName === "string" ? value.requesterName : "",
    attempt: typeof value.attempt === "number" ? value.attempt : 1,
    action: HISTORY_ACTIONS.includes(value.action as AccessHistoryAction) ? value.action as AccessHistoryAction : "requested",
    actorUid: typeof value.actorUid === "string" ? value.actorUid : "",
    actorName: typeof value.actorName === "string" ? value.actorName : "",
    at: readInstant(value.at),
  };
}

/** Immutable entry id; one per attempt and action (or per authorization change). */
function historyId(uid: string, attempt: number, suffix: string) {
  return `${uid}-${attempt}-${suffix}`;
}

function sortMembers(members: ProjectMember[]) {
  return members.sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.name.localeCompare(b.name)));
}

/** 128 random bits from the platform CSPRNG, hex encoded (32 characters). */
function randomLinkId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ─── Members ────────────────────────────────────────────────────────────────

export async function watchProjectMembers(projectId: string, onValue: (members: ProjectMember[]) => void, onError: (error: Error) => void) {
  const { db, api } = await database();
  return api.onSnapshot(api.collection(db, "projects", projectId, "members"), (snapshot) => {
    onValue(sortMembers(snapshot.docs.map((entry) => readMember(entry.id, entry.data()))));
  }, onError);
}

export async function removeProjectMember(projectId: string, uid: string, ownerUid: string) {
  if (!uid || uid === ownerUid) throw new Error("No puedes quitar al propietario del proyecto.");
  const { db, api } = await database();
  const [member, entry] = await Promise.all([
    api.getDoc(api.doc(db, "projects", projectId, "members", uid)),
    api.getDoc(api.doc(db, "projects", projectId, "directory", uid)),
  ]);
  const name = String((entry.exists() ? entry.data().name : member.exists() ? member.data().name : "") || "Miembro del equipo");
  const photo = entry.exists() ? String(entry.data().photoURL || "") : "";
  const batch = api.writeBatch(db);
  batch.delete(api.doc(db, "projects", projectId, "members", uid));
  batch.delete(api.doc(db, "users", uid, "projectAccess", projectId));
  batch.set(api.doc(db, "projects", projectId, "directory", uid), directoryDocument(uid, name, photo, false));
  await batch.commit();
}

export async function transferProjectOwnership(projectId: string, targetUid: string, currentOwner: PanelUser) {
  if (!targetUid || targetUid === currentOwner.id) throw new Error("Elige a otra persona del equipo para transferir la propiedad.");
  const { db, api } = await database();
  const targetMemberRef = api.doc(db, "projects", projectId, "members", targetUid);
  const targetSnapshot = await api.getDoc(targetMemberRef);
  if (!targetSnapshot.exists() || targetSnapshot.data().role !== "member" || targetSnapshot.data().status !== "active") {
    throw new Error("Solo puedes transferir el proyecto a un miembro activo.");
  }

  const batch = api.writeBatch(db);
  batch.update(api.doc(db, "projects", projectId), { ownerUid: targetUid });
  batch.update(api.doc(db, "projects", projectId, "members", currentOwner.id), { role: "member" });
  batch.update(targetMemberRef, { role: "owner" });
  batch.update(api.doc(db, "users", currentOwner.id, "projectAccess", projectId), { role: "member" });
  batch.update(api.doc(db, "users", targetUid, "projectAccess", projectId), { role: "owner" });
  await batch.commit();
}

// ─── Access links (owner) ───────────────────────────────────────────────────

export async function createAccessLink(projectId: string, projectName: string, owner: PanelUser): Promise<ProjectAccessLink> {
  const { db, api } = await database();
  const id = randomLinkId();
  const createdAt = new Date().toISOString();
  const expiresAt = api.Timestamp.fromMillis(Date.now() + ACCESS_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  // `set` on a fresh random id never overwrites; rules also reject existing ids.
  await api.setDoc(api.doc(db, "projects", projectId, "accessLinks", id), {
    id,
    projectId,
    projectName,
    status: "active",
    createdAt,
    expiresAt,
    createdByUid: owner.id,
  });
  return { id, projectId, projectName, status: "active", createdAt, expiresAt: expiresAt.toDate().toISOString() };
}

export async function watchAccessLinks(projectId: string, onValue: (links: ProjectAccessLink[]) => void, onError: (error: Error) => void) {
  const { db, api } = await database();
  return api.onSnapshot(api.collection(db, "projects", projectId, "accessLinks"), (snapshot) => {
    onValue(snapshot.docs.map((entry) => readLink(entry.id, projectId, entry.data())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, onError);
}

/** Blocks new requests through this link; requests already pending are kept. */
export async function revokeAccessLink(projectId: string, linkId: string) {
  const { db, api } = await database();
  await api.updateDoc(api.doc(db, "projects", projectId, "accessLinks", linkId), { status: "revoked", revokedAt: new Date().toISOString() });
}

// ─── Access requests (owner) ────────────────────────────────────────────────

export async function watchAccessRequests(projectId: string, onValue: (requests: ProjectAccessRequest[]) => void, onError: (error: Error) => void, onlyPending = false) {
  const { db, api } = await database();
  const base = api.collection(db, "projects", projectId, "accessRequests");
  const source = onlyPending ? api.query(base, api.where("status", "==", "pending")) : base;
  return api.onSnapshot(source, (snapshot) => {
    onValue(snapshot.docs.map((entry) => readRequest(entry.id, projectId, entry.data())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, onError);
}

function historyDocument(api: typeof import("firebase/firestore"), request: { uid: string; name: string; attempt: number }, action: AccessHistoryAction, actor: PanelUser, suffix: string = action) {
  const id = historyId(request.uid, request.attempt, suffix);
  return {
    id,
    data: {
      id,
      requesterUid: request.uid,
      requesterName: request.name.slice(0, 100),
      attempt: request.attempt,
      action,
      actorUid: actor.id,
      actorName: actor.name.slice(0, 100),
      at: api.serverTimestamp(),
    },
  };
}

/** Membership, picker entry, directory entry, approved status and history are written together. */
export async function approveAccessRequest(projectId: string, request: ProjectAccessRequest, owner: PanelUser) {
  const { db, api } = await database();
  const requestRef = api.doc(db, "projects", projectId, "accessRequests", request.uid);
  const now = new Date().toISOString();
  await api.runTransaction(db, async (transaction) => {
    const current = await transaction.get(requestRef);
    if (!current.exists() || current.data().status !== "pending") throw new Error("Esta solicitud ya fue atendida.");
    const state = readRequest(request.uid, projectId, current.data());
    const email = state.email.trim().toLowerCase();
    const name = (state.name || "Miembro del equipo").slice(0, 100);
    transaction.set(api.doc(db, "projects", projectId, "members", request.uid), {
      uid: request.uid, email, emailLower: email, name, role: "member", status: "active", joinedAt: now, accessRequestId: request.uid,
    });
    transaction.set(api.doc(db, "users", request.uid, "projectAccess", projectId), { projectId, role: "member", joinedAt: now });
    transaction.set(api.doc(db, "projects", projectId, "directory", request.uid), directoryDocument(request.uid, name, "", true));
    transaction.update(requestRef, { status: "approved", decidedAt: now, decidedByUid: owner.id });
    const entry = historyDocument(api, state, "approved", owner);
    transaction.set(api.doc(db, "projects", projectId, "accessRequestHistory", entry.id), entry.data);
  });
}

export async function rejectAccessRequest(projectId: string, request: ProjectAccessRequest, owner: PanelUser) {
  const { db, api } = await database();
  const requestRef = api.doc(db, "projects", projectId, "accessRequests", request.uid);
  await api.runTransaction(db, async (transaction) => {
    const current = await transaction.get(requestRef);
    if (!current.exists() || current.data().status !== "pending") throw new Error("Esta solicitud ya fue atendida.");
    const state = readRequest(request.uid, projectId, current.data());
    transaction.update(requestRef, { status: "rejected", decidedAt: new Date().toISOString(), decidedByUid: owner.id });
    const entry = historyDocument(api, state, "rejected", owner);
    transaction.set(api.doc(db, "projects", projectId, "accessRequestHistory", entry.id), entry.data);
  });
}

/**
 * Allows (or withdraws) one more attempt after a rejection. It only applies
 * while the person has not sent the new request yet.
 */
export async function setRetryAllowed(projectId: string, request: ProjectAccessRequest, allowed: boolean, owner: PanelUser) {
  const { db, api } = await database();
  const requestRef = api.doc(db, "projects", projectId, "accessRequests", request.uid);
  await api.runTransaction(db, async (transaction) => {
    const current = await transaction.get(requestRef);
    if (!current.exists()) throw new Error("La solicitud ya no existe.");
    const state = readRequest(request.uid, projectId, current.data());
    if (state.status !== "rejected") throw new Error("La persona ya envió una nueva solicitud; revísala en la lista de pendientes.");
    if (state.retryAllowed === allowed) return;
    const grantVersion = state.grantVersion + 1;
    transaction.update(requestRef, { retryAllowed: allowed, grantVersion });
    const entry = historyDocument(api, state, allowed ? "retry-allowed" : "retry-withdrawn", owner, `g${grantVersion}`);
    transaction.set(api.doc(db, "projects", projectId, "accessRequestHistory", entry.id), entry.data);
  });
}

export type HistoryPage = { entries: AccessHistoryEntry[]; cursor: unknown; done: boolean };

/** Owner view of every attempt and decision, newest first, one page at a time. */
export async function loadAccessHistory(projectId: string, pageSize: number, cursor: unknown = null): Promise<HistoryPage> {
  const { db, api } = await database();
  const base = api.collection(db, "projects", projectId, "accessRequestHistory");
  const constraints = [api.orderBy("at", "desc"), ...(cursor ? [api.startAfter(cursor)] : []), api.limit(pageSize)];
  const snapshot = await api.getDocs(api.query(base, ...constraints));
  return {
    entries: snapshot.docs.map((entry) => readHistory(entry.id, entry.data())),
    cursor: snapshot.docs[snapshot.docs.length - 1] ?? cursor,
    done: snapshot.docs.length < pageSize,
  };
}

// ─── Access requests (requester) ────────────────────────────────────────────

export type AccessLinkLookup =
  | { state: "ready"; link: ProjectAccessLink }
  | { state: "missing" }
  | { state: "revoked"; link: ProjectAccessLink }
  | { state: "expired"; link: ProjectAccessLink };

export async function lookupAccessLink(projectId: string, linkId: string): Promise<AccessLinkLookup> {
  const { db, api } = await database();
  try {
    const snapshot = await api.getDoc(api.doc(db, "projects", projectId, "accessLinks", linkId));
    if (!snapshot.exists()) return { state: "missing" };
    const link = readLink(snapshot.id, projectId, snapshot.data());
    if (link.status !== "active") return { state: "revoked", link };
    if (!isLinkUsable(link)) return { state: "expired", link };
    return { state: "ready", link };
  } catch (error) {
    if (errorCode(error) === "permission-denied") return { state: "missing" };
    throw error;
  }
}

export async function watchOwnAccessRequest(projectId: string, uid: string, onValue: (request: ProjectAccessRequest | null) => void, onError: (error: Error) => void) {
  const { db, api } = await database();
  return api.onSnapshot(api.doc(db, "projects", projectId, "accessRequests", uid), (snapshot) => {
    onValue(snapshot.exists() ? readRequest(snapshot.id, projectId, snapshot.data()) : null);
  }, onError);
}

/**
 * Sends a new attempt: the first request, a retry the owner allowed after a
 * rejection, or a new request after being removed from the team. Each attempt
 * is pending again and never grants membership by itself.
 */
export async function submitAccessRequest(link: ProjectAccessLink, user: PanelUser, previous: ProjectAccessRequest | null) {
  if (!user.emailVerified) throw new Error("Confirma tu correo antes de solicitar acceso.");
  const { db, api } = await database();
  const requestRef = api.doc(db, "projects", link.projectId, "accessRequests", user.id);
  const indexRef = api.doc(db, "users", user.id, "accessRequests", link.projectId);
  const createdAt = new Date().toISOString();
  const email = user.email.trim().toLowerCase();
  const name = (user.name.trim() || email.split("@")[0]).slice(0, 100);
  const attempt = previous ? previous.attempt + 1 : 1;
  const batch = api.writeBatch(db);
  batch.set(requestRef, {
    uid: user.id,
    email,
    emailLower: email,
    name,
    linkId: link.id,
    status: "pending",
    createdAt,
    attempt,
    retryAllowed: false,
    grantVersion: 0,
  });
  const entry = historyDocument(api, { uid: user.id, name, attempt }, "requested", user);
  batch.set(api.doc(db, "projects", link.projectId, "accessRequestHistory", entry.id), entry.data);
  batch.set(indexRef, { projectId: link.projectId, projectName: link.projectName.slice(0, 80), linkId: link.id, createdAt });
  try {
    await batch.commit();
  } catch (error) {
    if (errorCode(error) === "permission-denied") {
      throw new Error("No se pudo enviar la solicitud. Puede que ya exista una solicitud tuya para este proyecto, que ya formes parte del equipo o que el enlace haya dejado de estar vigente.");
    }
    throw error;
  }
}

/**
 * Follows the requester's own requests: the index lists projects, and each
 * request document provides the live status set by the owner.
 */
export async function watchOwnAccessRequests(uid: string, onValue: (requests: OwnAccessRequest[]) => void, onError: (error: Error) => void) {
  const { db, api } = await database();
  const entries = new Map<string, OwnAccessRequest>();
  const subscriptions = new Map<string, () => void>();
  const publish = () => onValue([...entries.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

  const stopIndex = api.onSnapshot(api.collection(db, "users", uid, "accessRequests"), (snapshot) => {
    const ids = new Set(snapshot.docs.map((entry) => entry.id));
    for (const [id, stop] of subscriptions) {
      if (ids.has(id)) continue;
      stop();
      subscriptions.delete(id);
      entries.delete(id);
    }
    for (const entry of snapshot.docs) {
      const value = entry.data();
      const previous = entries.get(entry.id);
      entries.set(entry.id, {
        projectId: entry.id,
        projectName: typeof value.projectName === "string" ? value.projectName : "Proyecto",
        createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
        linkId: typeof value.linkId === "string" ? value.linkId : "",
        status: previous?.status ?? "unknown",
        retryAllowed: previous?.retryAllowed ?? false,
      });
      if (subscriptions.has(entry.id)) continue;
      subscriptions.set(entry.id, api.onSnapshot(api.doc(db, "projects", entry.id, "accessRequests", uid), (requestSnapshot) => {
        const current = entries.get(entry.id);
        if (!current) return;
        entries.set(entry.id, {
          ...current,
          status: requestSnapshot.exists() ? readRequestStatus(requestSnapshot.data().status) : "unknown",
          retryAllowed: requestSnapshot.exists() && requestSnapshot.data().retryAllowed === true,
        });
        publish();
      }, () => {
        const current = entries.get(entry.id);
        if (current) entries.set(entry.id, { ...current, status: "unknown" });
        publish();
      }));
    }
    publish();
  }, onError);

  return () => {
    stopIndex();
    subscriptions.forEach((stop) => stop());
    subscriptions.clear();
  };
}

export async function dismissOwnAccessRequest(uid: string, projectId: string) {
  const { db, api } = await database();
  await api.deleteDoc(api.doc(db, "users", uid, "accessRequests", projectId));
}
