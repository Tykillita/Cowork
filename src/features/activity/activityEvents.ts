import { buildHash } from "../../lib/hashRoute";
import type { ActivityChanges, ActivityEvent, ActivityKind, ActivityTarget, PanelUser, Task } from "../../types";

/** Deterministic ids: a retried write reuses the same id instead of duplicating the entry. */
export function taskEventId(taskId: string, revision: number) {
  return `task-${taskId}-${revision}`;
}

export function milestoneEventId(milestoneId: string, revision: number) {
  return `milestone-${milestoneId}-${revision}`;
}

export function branchEventId(branchId: string) {
  return `branch-${branchId}`;
}

export function branchDeletedEventId(branchId: string) {
  return `branch-${branchId}-deleted`;
}

/** A file draft: proposed (`file-{id}`), then rejected, approved ("done") or discarded. */
export function fileEventId(draftId: string, step: "" | "rejected" | "done" | "discarded" = "") {
  return step ? `file-${draftId}-${step}` : `file-${draftId}`;
}

/** One creation event per project; only its owner can write it, in the batch that creates the project. */
export function projectEventId(projectId: string) {
  return `project-${projectId}`;
}

export function eventDocument(input: {
  id: string;
  projectId: string;
  kind: ActivityKind;
  targetType: ActivityTarget;
  targetId: string;
  targetTitle: string;
  revision: number;
  actor: PanelUser;
  changes: ActivityChanges;
  serverTime: unknown;
}) {
  return {
    id: input.id,
    projectId: input.projectId,
    kind: input.kind,
    targetType: input.targetType,
    targetId: input.targetId,
    targetTitle: input.targetTitle.slice(0, 300),
    revision: input.revision,
    actorUid: input.actor.id,
    actorName: input.actor.name.slice(0, 100),
    createdAt: input.serverTime,
    changes: input.changes,
  };
}

/** The part of a task edit that the activity feed records. */
export function taskChanges(before: Task, after: Task): ActivityChanges {
  const changes: ActivityChanges = {};
  if (before.status !== after.status) changes.status = { from: before.status, to: after.status };
  if (before.assigneeUid !== after.assigneeUid) {
    changes.assignee = { fromUid: before.assigneeUid, toUid: after.assigneeUid, fromName: before.assignee, toName: after.assignee };
  }
  if (before.milestoneId !== after.milestoneId) changes.milestone = { from: before.milestoneId, to: after.milestoneId };
  if (before.title !== after.title) changes.title = { from: before.title, to: after.title };
  if (before.phase !== after.phase) changes.phase = { from: before.phase, to: after.phase };
  if (before.priority !== after.priority) changes.priority = { from: before.priority, to: after.priority };
  if (before.dueAt !== after.dueAt) changes.dueAt = { from: before.dueAt, to: after.dueAt };
  if (before.branch !== after.branch) changes.branch = { from: before.branch, to: after.branch };
  if (!sameChecklist(before.checklist, after.checklist)) {
    changes.checklist = { done: after.checklist.filter((item) => item.done).length, total: after.checklist.length };
  }
  if (before.description !== after.description) changes.details = true;
  if (before.order !== after.order) changes.order = true;
  return changes;
}

function sameChecklist(a: Task["checklist"], b: Task["checklist"]) {
  return a.length === b.length && a.every((item, index) => item.id === b[index].id && item.text === b[index].text && item.done === b[index].done);
}

/** Work that counts as an active day for the personal collection. */
export function countsAsWork(event: Pick<ActivityEvent, "kind" | "targetType" | "changes">) {
  return (event.kind === "created" && (event.targetType === "task" || event.targetType === "branch" || event.targetType === "project"))
    || (event.targetType === "task" && event.kind === "updated" && Boolean(event.changes.status));
}

function readTime(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return (value.toDate() as Date).toISOString();
  return typeof value === "string" ? value : "";
}

export function readEvent(id: string, value: Record<string, unknown>): ActivityEvent {
  const targetType = value.targetType === "milestone" || value.targetType === "branch" || value.targetType === "project" || value.targetType === "file" ? value.targetType : "task";
  const kind = value.kind === "created" || value.kind === "deleted" ? value.kind : "updated";
  return {
    id,
    projectId: typeof value.projectId === "string" ? value.projectId : "",
    kind,
    targetType,
    targetId: typeof value.targetId === "string" ? value.targetId : "",
    targetTitle: typeof value.targetTitle === "string" ? value.targetTitle : "",
    revision: typeof value.revision === "number" ? value.revision : 0,
    actorUid: typeof value.actorUid === "string" ? value.actorUid : "",
    actorName: typeof value.actorName === "string" ? value.actorName : "Alguien del equipo",
    // Pending local writes have no server time yet; they sort as "now".
    createdAt: readTime(value.createdAt) || new Date().toISOString(),
    changes: value.changes && typeof value.changes === "object" ? value.changes as ActivityChanges : {},
  };
}

/** Human description, e.g. "cambió el estado de «Diseño» a Hecha". */
export function describeEvent(event: ActivityEvent, milestoneTitle: (id: string) => string = () => "") {
  const title = `«${event.targetTitle || "sin título"}»`;
  if (event.targetType === "branch") return event.kind === "deleted" ? `quitó la rama ${event.targetTitle} del registro` : `registró la rama ${event.targetTitle}`;
  if (event.targetType === "project") return `creó el proyecto ${title}`;
  if (event.targetType === "file") {
    const file = event.targetTitle.slice(event.targetTitle.lastIndexOf("/") + 1) || "un archivo";
    if (event.changes.review === "approved") return `aprobó y subió ${file} a GitHub`;
    if (event.changes.review === "rejected") return `rechazó el archivo ${file}`;
    if (event.changes.review === "discarded") return `descartó el archivo ${file}`;
    return `propuso el archivo ${file}`;
  }
  if (event.targetType === "milestone") {
    if (event.kind === "created") return `creó el hito ${title}`;
    if (event.changes.archived?.to) return `archivó el hito ${title}`;
    if (event.changes.archived && !event.changes.archived.to) return `reactivó el hito ${title}`;
    if (event.changes.dueAt) return `cambió la fecha del hito ${title}`;
    return `editó el hito ${title}`;
  }
  if (event.kind === "created") return `creó la tarea ${title}`;
  if (event.kind === "deleted") return `eliminó la tarea ${title}`;
  const parts: string[] = [];
  if (event.changes.status) parts.push(`cambió el estado a ${event.changes.status.to}`);
  if (event.changes.assignee) {
    const { toUid, toName } = event.changes.assignee;
    parts.push(toUid ? (toUid === event.actorUid ? "la tomó" : `la asignó a ${toName || "otra persona"}`) : "la dejó sin asignar");
  }
  if (event.changes.milestone) {
    const to = event.changes.milestone.to;
    parts.push(to ? `la vinculó al hito ${milestoneTitle(to) || ""}`.trim() : "la quitó de su hito");
  }
  if (event.changes.title) parts.push("cambió el título");
  if (event.changes.phase) parts.push(`la movió a la fase ${event.changes.phase.to}`);
  if (event.changes.priority) parts.push(`cambió la prioridad a ${event.changes.priority.to}`);
  if (event.changes.dueAt) parts.push(event.changes.dueAt.to ? "cambió la fecha límite" : "quitó la fecha límite");
  if (event.changes.branch) parts.push(event.changes.branch.to ? `la vinculó a la rama ${event.changes.branch.to}` : "la desvinculó de su rama");
  if (event.changes.checklist) parts.push(`actualizó la lista (${event.changes.checklist.done}/${event.changes.checklist.total})`);
  if (event.changes.details) parts.push("editó la descripción");
  if (!parts.length && event.changes.order) parts.push("la movió de lugar");
  return parts.length ? `${parts.join(", ")} · ${title}` : `editó la tarea ${title}`;
}

/** Where an event leads: the branch register, the milestones, the file or the task itself. */
export function eventTarget(event: ActivityEvent) {
  if (event.targetType === "branch") return "#branches-page";
  if (event.targetType === "milestone") return "#work?focus=milestones";
  if (event.targetType === "file") {
    if (event.changes.review === "discarded") return "#code";
    return buildHash("code", { ref: event.changes.ref, path: event.targetTitle });
  }
  if (event.targetType === "task" && event.kind !== "deleted") return `#work?task=${encodeURIComponent(event.targetId)}`;
  return "#work";
}

/** Visible in "Actividad": task and milestone changes, excluding silent data migrations. */
export function isFeedEvent(event: ActivityEvent) {
  if (event.changes.migration) return false;
  // Reordering alone is not news.
  const keys = Object.keys(event.changes);
  return !(event.kind === "updated" && keys.length === 1 && keys[0] === "order");
}
