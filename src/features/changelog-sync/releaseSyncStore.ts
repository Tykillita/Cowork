import type { TaskStatus } from "../../types";
import { getCoworkFirestore } from "../../lib/firebase";
import { changelogFingerprint, loadChangelogCandidates, normalizeTaskTitle, type ChangelogCandidate, type ChangelogSection, type ReleaseKind } from "./changelogParser";

export type ReleaseReviewStatus = "pending" | "accepted" | "ignored";
export type ReleaseSyncProposal = ChangelogCandidate & {
  id: string;
  contentHash: string;
  reviewStatus: ReleaseReviewStatus;
  taskId: string;
};

type Unsubscribe = () => void;

async function database() {
  const [db, api] = await Promise.all([getCoworkFirestore(), import("firebase/firestore")]);
  if (!db) throw Object.assign(new Error("Firebase no está configurado."), { code: "cowork/firebase-not-configured" });
  return { db, api };
}

function asProposal(id: string, value: Record<string, unknown>): ReleaseSyncProposal {
  const statuses: TaskStatus[] = ["Pendiente", "En curso", "Hecha"];
  const sections: ChangelogSection[] = ["added", "changed", "fixed", "general"];
  const releaseKinds: ReleaseKind[] = ["major", "feature", "fix"];
  const suggestion = statuses.includes(value.suggestedStatus as TaskStatus) ? value.suggestedStatus as TaskStatus : "";
  const review = value.reviewStatus === "accepted" || value.reviewStatus === "ignored" ? value.reviewStatus : "pending";
  return {
    id,
    sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl : "",
    title: typeof value.title === "string" ? value.title : "",
    body: typeof value.body === "string" ? value.body : "",
    section: sections.includes(value.section as ChangelogSection) ? value.section as ChangelogSection : "general",
    releaseKind: releaseKinds.includes(value.releaseKind as ReleaseKind) ? value.releaseKind as ReleaseKind : "",
    version: typeof value.version === "string" ? value.version : "",
    suggestedStatus: suggestion,
    contentHash: typeof value.contentHash === "string" ? value.contentHash : "",
    reviewStatus: review,
    taskId: typeof value.taskId === "string" ? value.taskId : "",
  };
}

export function watchReleaseSyncProposals(projectId: string, onValue: (items: ReleaseSyncProposal[]) => void, onError: (error: Error) => void): Promise<Unsubscribe> {
  return database().then(({ db, api }) => {
    const source = api.collection(db, "projects", projectId, "releaseSyncItems");
    const recent = api.query(source, api.orderBy("updatedAt", "desc"), api.limit(100));
    return api.onSnapshot(recent, (snapshot) => {
      onValue(snapshot.docs.map((entry) => asProposal(entry.id, entry.data())));
    }, onError);
  });
}

function proposalFields(item: ChangelogCandidate, contentHash: string) {
  return {
    sourceUrl: item.sourceUrl,
    title: item.title.slice(0, 300),
    body: item.body.slice(0, 1_500),
    section: item.section,
    releaseKind: item.releaseKind,
    version: item.version.slice(0, 60),
    suggestedStatus: item.suggestedStatus,
    contentHash,
  };
}

/** Reads one public source and shares only bounded, normalized proposals with the project. */
export async function syncReleaseSource(projectId: string, sourceUrl: string, userId: string) {
  const { db, api } = await database();
  const parsed = await loadChangelogCandidates(sourceUrl);
  if (!parsed.length) throw new Error("No encontré novedades estructuradas. Usa encabezados y listas en HTML o un CHANGELOG.md; no se guardó nada.");

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const item of parsed) {
    const normalizedTitle = normalizeTaskTitle(item.title);
    if (!normalizedTitle) continue;
    const id = await changelogFingerprint(item.sourceUrl + "\n" + item.version + "\n" + normalizedTitle);
    const contentHash = await changelogFingerprint([
      item.sourceUrl, item.version, item.section, normalizedTitle, item.body, item.suggestedStatus,
    ].join("\n"));
    const ref = api.doc(db, "projects", projectId, "releaseSyncItems", id);
    const outcome = await api.runTransaction(db, async (transaction) => {
      const current = await transaction.get(ref);
      const fields = proposalFields(item, contentHash);
      if (!current.exists()) {
        transaction.set(ref, {
          id, ...fields, reviewStatus: "pending", taskId: "",
          createdAt: api.serverTimestamp(), createdByUid: userId,
          updatedAt: api.serverTimestamp(), updatedByUid: userId,
          reviewedAt: null, reviewedByUid: "",
        });
        return "added" as const;
      }
      const existing = current.data();
      if (existing.contentHash === contentHash) {
        if (!item.releaseKind || existing.releaseKind === item.releaseKind) return "unchanged" as const;
        // A release badge is metadata about the parent version. Backfill it
        // without reopening a proposal the team has already reviewed.
        transaction.update(ref, {
          releaseKind: item.releaseKind,
          updatedAt: api.serverTimestamp(),
          updatedByUid: userId,
        });
        return "updated" as const;
      }
      transaction.update(ref, {
        ...fields,
        reviewStatus: "pending",
        taskId: typeof existing.taskId === "string" ? existing.taskId : "",
        updatedAt: api.serverTimestamp(),
        updatedByUid: userId,
        reviewedAt: null,
        reviewedByUid: "",
      });
      return "updated" as const;
    });
    if (outcome === "added") added += 1;
    else if (outcome === "updated") updated += 1;
    else unchanged += 1;
  }
  return { found: parsed.length, added, updated, unchanged };
}

/** A proposal can be decided once. Retrying task creation is safe because task matching is exact and deterministic. */
export async function reviewReleaseProposal(projectId: string, proposalId: string, decision: Exclude<ReleaseReviewStatus, "pending">, taskId: string, userId: string) {
  const { db, api } = await database();
  const ref = api.doc(db, "projects", projectId, "releaseSyncItems", proposalId);
  await api.runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("Esta novedad ya no está disponible.");
    const current = snapshot.data();
    if (current.reviewStatus !== "pending") throw new Error("Otra persona ya revisó esta novedad. Actualiza la lista.");
    if (decision === "accepted" && (!taskId || taskId.length > 60 || taskId.includes("/"))) {
      throw new Error("Selecciona la tarea que corresponde.");
    }
    transaction.update(ref, {
      reviewStatus: decision,
      taskId: decision === "accepted" ? taskId : (typeof current.taskId === "string" ? current.taskId : ""),
      updatedAt: api.serverTimestamp(),
      updatedByUid: userId,
      reviewedAt: api.serverTimestamp(),
      reviewedByUid: userId,
    });
  });
}
