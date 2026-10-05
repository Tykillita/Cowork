import { useEffect, useState } from "react";
import type { FileDraft, FileDraftEncoding, PanelUser } from "../../types";
import { FILE_DRAFT_LIMITS } from "../../types";
import { getCoworkFirestore } from "../../lib/firebase";
import { newId } from "../../lib/ids";
import { eventDocument, fileEventId } from "../activity/activityEvents";
import { decodeText } from "./repoTree";

/*
 * Files proposed in Cowork wait here until someone allowed to write to the
 * repository approves them; the reviewer's browser then commits them to GitHub
 * (Spark plan: no Cloud Functions or Storage). Metadata and content are two
 * documents so the tree and the activity centre only read the small one.
 */

async function database() {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw Object.assign(new Error("Firebase no está configurado."), { code: "cowork/firebase-not-configured" });
  return { db, api };
}

/** Problem with a repository path, in Spanish, or "" when it is valid. Same checks as firestore.rules. */
export function draftPathProblem(value: string) {
  const path = value.trim();
  if (!path) return "Escribe la ruta del archivo.";
  if (path.length > FILE_DRAFT_LIMITS.path) return `Usa una ruta de ${FILE_DRAFT_LIMITS.path} caracteres como máximo.`;
  if (path.startsWith("/") || path.endsWith("/") || path.includes("//")) return "Las barras (/) deben separar carpetas, sin repetirse ni quedar al inicio o al final.";
  if (path.split("/").some((part) => part === "." || part === "..")) return "La ruta no puede tener partes «.» ni «..».";
  if (path.split("/").some((part) => part === ".git")) return "No se pueden proponer archivos dentro de .git.";
  if (/[\x00-\x1f\x7f\\]/.test(path)) return "La ruta no puede tener barras invertidas ni caracteres de control.";
  return "";
}

/** "src" + "a.ts" → "src/a.ts"; a leading "/" in the name means from the root. */
export function joinDraftPath(folder: string, name: string) {
  const clean = name.trim();
  if (clean.startsWith("/")) return clean.replace(/^\/+/, "");
  return folder ? `${folder}/${clean}` : clean;
}

export function readFileDraft(id: string, value: Record<string, unknown>): FileDraft {
  const text = (key: string) => (typeof value[key] === "string" ? value[key] as string : "");
  return {
    id,
    ref: text("ref"),
    path: text("path"),
    encoding: value.encoding === "base64" ? "base64" : "utf-8",
    size: typeof value.size === "number" ? value.size : 0,
    message: text("message"),
    status: value.status === "rejected" ? "rejected" : "pending",
    authorUid: text("authorUid"),
    authorName: text("authorName") || "Alguien del equipo",
    createdAt: text("createdAt"),
    reviewNote: text("reviewNote"),
    reviewedByUid: text("reviewedByUid"),
    reviewerName: text("reviewerName"),
  };
}

export function listenForFileDrafts(projectId: string, onValue: (drafts: FileDraft[]) => void, onError: (error: Error) => void) {
  return database().then(({ db, api }) => {
    const draftsQuery = api.query(api.collection(db, "projects", projectId, "fileDrafts"), api.orderBy("createdAt", "desc"));
    return api.onSnapshot(draftsQuery, (snapshot) => onValue(snapshot.docs.map((entry) => readFileDraft(entry.id, entry.data()))), onError);
  });
}

/** Drafts of the project, live. `ready` turns true with the first answer (or an error). */
export function useFileDrafts(projectId: string) {
  const [state, setState] = useState<{ drafts: FileDraft[]; ready: boolean; error: string }>({ drafts: [], ready: false, error: "" });
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    let stop: (() => void) | null = null;
    setState({ drafts: [], ready: false, error: "" });
    listenForFileDrafts(projectId,
      (drafts) => { if (active) setState({ drafts, ready: true, error: "" }); },
      (error) => { if (active) setState({ drafts: [], ready: true, error: error.message }); },
    ).then((unsubscribe) => { if (active) stop = unsubscribe; else unsubscribe(); })
      .catch((error: Error) => { if (active) setState({ drafts: [], ready: true, error: error.message }); });
    return () => { active = false; stop?.(); };
  }, [projectId]);
  return state;
}

export interface DraftInput {
  ref: string;
  path: string;
  encoding: FileDraftEncoding;
  content: string;
  size: number;
  message: string;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** UTF-8 text as typed, or base64 of the raw bytes. */
export function encodeDraftContent(buffer: ArrayBuffer): { encoding: FileDraftEncoding; content: string } {
  const decoded = decodeText(buffer);
  return "text" in decoded ? { encoding: "utf-8", content: decoded.text } : { encoding: "base64", content: bytesToBase64(new Uint8Array(buffer)) };
}

/** What GitHub's contents API expects. */
export function draftBase64(encoding: FileDraftEncoding, content: string) {
  return encoding === "base64" ? content : bytesToBase64(new TextEncoder().encode(content));
}

export function draftBytes(encoding: FileDraftEncoding, content: string) {
  if (encoding === "utf-8") return new TextEncoder().encode(content);
  const binary = atob(content);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function createFileDraft(projectId: string, input: DraftInput, user: PanelUser) {
  const problem = draftPathProblem(input.path);
  if (problem) throw new Error(problem);
  if (input.size > FILE_DRAFT_LIMITS.bytes || input.content.length > FILE_DRAFT_LIMITS.content) throw new Error("El archivo supera los 650 KB que admite la revisión en Cowork.");
  const { db, api } = await database();
  const id = newId("f");
  const path = input.path.trim();
  const ref = input.ref.slice(0, FILE_DRAFT_LIMITS.ref);
  const batch = api.writeBatch(db);
  batch.set(api.doc(db, "projects", projectId, "fileDrafts", id), {
    id, ref, path,
    encoding: input.encoding,
    size: input.size,
    message: input.message.trim().slice(0, FILE_DRAFT_LIMITS.message) || `Añadir ${path.slice(path.lastIndexOf("/") + 1)}`,
    status: "pending",
    authorUid: user.id,
    authorName: user.name.slice(0, 100),
    createdAt: new Date().toISOString(),
    reviewNote: "", reviewedByUid: "", reviewerName: "",
  });
  batch.set(api.doc(db, "projects", projectId, "fileDraftContents", id), { id, content: input.content });
  batch.set(api.doc(db, "projects", projectId, "events", fileEventId(id)), eventDocument({
    id: fileEventId(id), projectId, kind: "created", targetType: "file", targetId: id, targetTitle: path, revision: 1, actor: user, changes: { ref }, serverTime: api.serverTimestamp(),
  }));
  await batch.commit();
  return id;
}

const contents = new Map<string, Promise<string>>();

/** The draft's content; it never changes, so each draft is read once per page load. */
export function readFileDraftContent(projectId: string, draftId: string) {
  const key = `${projectId}/${draftId}`;
  let pending = contents.get(key);
  if (!pending) {
    pending = database().then(async ({ db, api }) => {
      const snapshot = await api.getDoc(api.doc(db, "projects", projectId, "fileDraftContents", draftId));
      const content = snapshot.data()?.content;
      if (typeof content !== "string") throw new Error("No se encontró el contenido de este archivo.");
      return content;
    });
    pending.catch(() => contents.delete(key));
    contents.set(key, pending);
  }
  return pending;
}

export async function rejectFileDraft(projectId: string, draft: FileDraft, note: string, user: PanelUser) {
  const { db, api } = await database();
  const eventId = fileEventId(draft.id, "rejected");
  const batch = api.writeBatch(db);
  batch.update(api.doc(db, "projects", projectId, "fileDrafts", draft.id), {
    status: "rejected",
    reviewNote: note.trim().slice(0, FILE_DRAFT_LIMITS.reviewNote),
    reviewedByUid: user.id,
    reviewerName: user.name.slice(0, 100),
  });
  batch.set(api.doc(db, "projects", projectId, "events", eventId), eventDocument({
    id: eventId, projectId, kind: "updated", targetType: "file", targetId: draft.id, targetTitle: draft.path, revision: 2, actor: user, changes: { review: "rejected", ref: draft.ref }, serverTime: api.serverTimestamp(),
  }));
  await batch.commit();
}

/** Removes the draft after it reached GitHub ("approved") or when it is dropped ("discarded"). */
export async function closeFileDraft(projectId: string, draft: FileDraft, review: "approved" | "discarded", user: PanelUser) {
  const { db, api } = await database();
  const eventId = fileEventId(draft.id, review === "approved" ? "done" : "discarded");
  const batch = api.writeBatch(db);
  batch.delete(api.doc(db, "projects", projectId, "fileDrafts", draft.id));
  batch.delete(api.doc(db, "projects", projectId, "fileDraftContents", draft.id));
  batch.set(api.doc(db, "projects", projectId, "events", eventId), eventDocument({
    id: eventId, projectId, kind: "deleted", targetType: "file", targetId: draft.id, targetTitle: draft.path,
    revision: draft.status === "rejected" ? 3 : 2, actor: user, changes: { review, ref: draft.ref }, serverTime: api.serverTimestamp(),
  }));
  await batch.commit();
}

/** Commit message for GitHub: the proposal's message plus who proposed it. */
export function commitMessage(draft: Pick<FileDraft, "message" | "authorName">) {
  return `${draft.message}\n\nPropuesto por ${draft.authorName} en Cowork.`;
}
