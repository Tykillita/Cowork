// Security rules tests. Run with: npm run test:rules (starts the Firestore emulator).
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, orderBy, query, runTransaction,
  serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";

const PROJECT = "vigilia-abc123";
const LINK = "a".repeat(32);
const EXPIRED_LINK = "b".repeat(32);
const REVOKED_LINK = "c".repeat(32);
const DAY = 24 * 60 * 60 * 1000;
const NOW_ISO = () => new Date().toISOString();

let env;

const owner = () => env.authenticatedContext("owner", { email: "owner@team.test", email_verified: true, name: "Owner" }).firestore();
const requester = () => env.authenticatedContext("req", { email: "Req@Team.test", email_verified: true }).firestore();
const other = () => env.authenticatedContext("other", { email: "other@team.test", email_verified: true }).firestore();
const unverified = () => env.authenticatedContext("unverified", { email: "new@team.test", email_verified: false }).firestore();

// ─── Access helpers ─────────────────────────────────────────────────────────

function requestData(uid, email, { linkId = LINK, attempt = 1 } = {}) {
  const lower = email.toLowerCase();
  return { uid, email: lower, emailLower: lower, name: "Persona", linkId, status: "pending", createdAt: NOW_ISO(), attempt, retryAllowed: false, grantVersion: 0 };
}

function history(requesterUid, attempt, action, actorUid, suffix = action) {
  const id = `${requesterUid}-${attempt}-${suffix}`;
  return [id, { id, requesterUid, requesterName: "Persona", attempt, action, actorUid, actorName: "x", at: serverTimestamp() }];
}

async function submitRequest(db, uid, email, options = {}) {
  const attempt = options.attempt ?? 1;
  const batch = writeBatch(db);
  batch.set(doc(db, "projects", PROJECT, "accessRequests", uid), requestData(uid, email, options));
  const [historyId, entry] = history(uid, attempt, "requested", uid);
  if (!options.skipHistory) batch.set(doc(db, "projects", PROJECT, "accessRequestHistory", historyId), entry);
  batch.set(doc(db, "users", uid, "accessRequests", PROJECT), { projectId: PROJECT, projectName: "Vigilia", linkId: options.linkId ?? LINK, createdAt: NOW_ISO() });
  return batch.commit();
}

function approvalBatch(db, uid, email, { member = {}, attempt = 1, skipHistory = false } = {}) {
  const now = NOW_ISO();
  const batch = writeBatch(db);
  batch.set(doc(db, "projects", PROJECT, "members", uid), { uid, email, emailLower: email, name: "Persona", role: "member", status: "active", joinedAt: now, accessRequestId: uid, ...member });
  batch.set(doc(db, "users", uid, "projectAccess", PROJECT), { projectId: PROJECT, role: "member", joinedAt: now });
  batch.update(doc(db, "projects", PROJECT, "accessRequests", uid), { status: "approved", decidedAt: now, decidedByUid: "owner" });
  if (!skipHistory) {
    const [historyId, entry] = history(uid, attempt, "approved", "owner");
    batch.set(doc(db, "projects", PROJECT, "accessRequestHistory", historyId), entry);
  }
  batch.set(doc(db, "projects", PROJECT, "directory", uid), { uid, name: "Persona", photoURL: "", active: true, updatedAt: now });
  return batch;
}

function rejectBatch(db, uid, attempt = 1) {
  const batch = writeBatch(db);
  batch.update(doc(db, "projects", PROJECT, "accessRequests", uid), { status: "rejected", decidedAt: NOW_ISO(), decidedByUid: "owner" });
  const [historyId, entry] = history(uid, attempt, "rejected", "owner");
  batch.set(doc(db, "projects", PROJECT, "accessRequestHistory", historyId), entry);
  return batch;
}

function retryToggleBatch(db, uid, { attempt = 1, allowed, grantVersion }) {
  const batch = writeBatch(db);
  batch.update(doc(db, "projects", PROJECT, "accessRequests", uid), { retryAllowed: allowed, grantVersion });
  const [historyId, entry] = history(uid, attempt, allowed ? "retry-allowed" : "retry-withdrawn", "owner", `g${grantVersion}`);
  batch.set(doc(db, "projects", PROJECT, "accessRequestHistory", historyId), entry);
  return batch;
}

async function addMember(uid, email) {
  await submitRequest(env.authenticatedContext(uid, { email, email_verified: true }).firestore(), uid, email);
  await approvalBatch(owner(), uid, email).commit();
}

// ─── Work helpers ───────────────────────────────────────────────────────────

function taskData(id, overrides = {}) {
  return { id, order: 1, phase: "General", title: "Tarea", status: "Pendiente", assignee: "", assigneeUid: "", milestoneId: "", revision: 1, updatedByUid: "owner", ...overrides };
}

function eventData(db, { targetType = "task", targetId, revision, kind, changes = {}, actorUid = "owner", id }) {
  const eventId = id ?? (targetType === "branch" ? `branch-${targetId}` : `${targetType}-${targetId}-${revision}`);
  return [doc(db, "projects", PROJECT, "events", eventId), {
    id: eventId, projectId: PROJECT, kind, targetType, targetId, targetTitle: "Tarea", revision, actorUid, actorName: "Owner", createdAt: serverTimestamp(), changes,
  }];
}

function createTask(db, id, actorUid = "owner", overrides = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, "projects", PROJECT, "tasks", id), taskData(id, { updatedByUid: actorUid, ...overrides }));
  const [ref, data] = eventData(db, { targetId: id, revision: 1, kind: "created", actorUid });
  batch.set(ref, data);
  return batch.commit();
}

function updateTask(db, id, next, changes, actorUid = "owner") {
  const batch = writeBatch(db);
  batch.set(doc(db, "projects", PROJECT, "tasks", id), taskData(id, { updatedByUid: actorUid, ...next }));
  const [ref, data] = eventData(db, { targetId: id, revision: next.revision, kind: "updated", changes, actorUid });
  batch.set(ref, data);
  return batch.commit();
}

// Same writes as createProject(): project, owner documents and its creation event in one batch.
function projectCreation(db, uid, id, { name = "Nuevo", withEvent = true, event = {} } = {}) {
  const now = NOW_ISO(), email = `${uid}@team.test`, eventId = `project-${id}`;
  const batch = writeBatch(db);
  batch.set(doc(db, "projects", id), { id, name, description: "", repositoryUrl: "", previewUrl: "", kind: "general", createdAt: now, ownerUid: uid });
  batch.set(doc(db, "projects", id, "members", uid), { uid, email, emailLower: email, name: "Owner", role: "owner", status: "active", joinedAt: now });
  batch.set(doc(db, "users", uid, "projectAccess", id), { projectId: id, role: "owner", joinedAt: now });
  batch.set(doc(db, "projects", id, "directory", uid), { uid, name: "Owner", photoURL: "", active: true, updatedAt: now });
  if (withEvent) batch.set(doc(db, "projects", id, "events", eventId), {
    id: eventId, projectId: id, kind: "created", targetType: "project", targetId: id, targetTitle: name, revision: 1, actorUid: uid, actorName: "Owner", createdAt: serverTimestamp(), changes: {}, ...event,
  });
  return batch;
}

function milestoneData(id, overrides = {}) {
  return { id, title: "Entrega 1", description: "", dueDate: "2026-10-10", timeZone: "America/Panama", dueAt: "2026-10-11T05:00:00.000Z", archived: false, createdAt: "2026-09-26T00:00:00.000Z", createdByUid: "owner", revision: 1, updatedByUid: "owner", ...overrides };
}

function writeMilestone(db, id, data, kind, changes = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, "projects", PROJECT, "milestones", id), data);
  const [ref, event] = eventData(db, { targetType: "milestone", targetId: id, revision: data.revision, kind, changes });
  batch.set(ref, event);
  return batch.commit();
}

async function recordDay(db, uid, eventId, dayOverride) {
  const eventSnapshot = await getDoc(doc(db, "projects", PROJECT, "events", eventId));
  const day = dayOverride ?? Math.floor(eventSnapshot.data().createdAt.toMillis() / DAY);
  return runTransaction(db, async (transaction) => {
    const summaryRef = doc(db, "users", uid, "progress", "summary");
    const summary = await transaction.get(summaryRef);
    transaction.set(doc(db, "users", uid, "activeDays", String(day)), { day, projectId: PROJECT, eventId, recordedAt: serverTimestamp() });
    transaction.set(summaryRef, { activeDays: (summary.exists() ? summary.data().activeDays : 0) + 1, lastRecordedDay: day, updatedAt: serverTimestamp() });
  });
}

async function eventDay(db, eventId) {
  const eventSnapshot = await getDoc(doc(db, "projects", PROJECT, "events", eventId));
  return Math.floor(eventSnapshot.data().createdAt.toMillis() / DAY);
}

// Attempts to replay the retired client credit path must be rejected.
async function awardPoint(db, uid, eventId, dayOverride, keyOverride) {
  const day = dayOverride ?? await eventDay(db, eventId);
  const key = keyOverride ?? `${PROJECT}__${eventId}`;
  return runTransaction(db, async (transaction) => {
    const dayRef = doc(db, "users", uid, "pointDays", String(day));
    const walletRef = doc(db, "users", uid, "progress", "wallet");
    const today = await transaction.get(dayRef);
    const wallet = await transaction.get(walletRef);
    const points = today.exists() ? today.data().points : 0;
    const current = wallet.exists() ? wallet.data() : { earned: 0, spent: 0, lastPurchase: "" };
    transaction.set(doc(db, "users", uid, "pointEvents", key), { projectId: PROJECT, eventId, day, recordedAt: serverTimestamp() });
    transaction.set(dayRef, { day, points: points + 1, updatedAt: serverTimestamp() });
    transaction.set(walletRef, { balance: current.earned + 1 - current.spent, earned: current.earned + 1, spent: current.spent, lastAward: key, lastPurchase: current.lastPurchase, updatedAt: serverTimestamp() });
  });
}

// Same writes as the app: inventory item and wallet charge in one transaction.
async function buy(db, uid, itemId, price, charged = price) {
  return runTransaction(db, async (transaction) => {
    const walletRef = doc(db, "users", uid, "progress", "wallet");
    const current = (await transaction.get(walletRef)).data() ?? { earned: 0, spent: 0, lastAward: "" };
    transaction.set(doc(db, "users", uid, "inventory", itemId), { itemId, price, acquiredAt: serverTimestamp() });
    transaction.set(walletRef, { balance: current.earned - current.spent - charged, earned: current.earned, spent: current.spent + charged, lastAward: current.lastAward, lastPurchase: itemId, updatedAt: serverTimestamp() });
  });
}

async function seedWallet(uid, earned, spent = 0) {
  await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), "users", uid, "progress", "wallet"), {
    balance: earned - spent, earned, spent, lastAward: "seed", lastPurchase: "", updatedAt: Timestamp.now(),
  }));
}

// ─── Setup ──────────────────────────────────────────────────────────────────

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "projects", PROJECT), { id: PROJECT, name: "Vigilia", description: "", repositoryUrl: "", previewUrl: "", kind: "general", createdAt: "2026-09-01T00:00:00.000Z", ownerUid: "owner" });
    await setDoc(doc(db, "projects", PROJECT, "members", "owner"), { uid: "owner", email: "owner@team.test", emailLower: "owner@team.test", name: "Owner", role: "owner", status: "active", joinedAt: "2026-09-01T00:00:00.000Z" });
    await setDoc(doc(db, "users", "owner", "projectAccess", PROJECT), { projectId: PROJECT, role: "owner", joinedAt: "2026-09-01T00:00:00.000Z" });
    const link = (id, status, expires) => ({ id, projectId: PROJECT, projectName: "Vigilia", status, createdAt: "2026-09-01T00:00:00.000Z", expiresAt: Timestamp.fromMillis(expires), createdByUid: "owner" });
    await setDoc(doc(db, "projects", PROJECT, "accessLinks", LINK), link(LINK, "active", Date.now() + 7 * DAY));
    await setDoc(doc(db, "projects", PROJECT, "accessLinks", EXPIRED_LINK), link(EXPIRED_LINK, "active", Date.now() - DAY));
    await setDoc(doc(db, "projects", PROJECT, "accessLinks", REVOKED_LINK), { ...link(REVOKED_LINK, "revoked", Date.now() + 7 * DAY), revokedAt: "2026-09-02T00:00:00.000Z" });
    await setDoc(doc(db, "projects", PROJECT, "invitations", "invite-legacy"), { id: "invite-legacy", projectId: PROJECT, email: "x@team.test", emailLower: "x@team.test", role: "member", status: "pending", createdAt: "2026-09-01T00:00:00.000Z", expiresAt: Timestamp.fromMillis(Date.now() + DAY), createdByUid: "owner" });
    // A task from before revisions and account links existed.
    await setDoc(doc(db, "projects", PROJECT, "tasks", "legacy"), { id: "legacy", order: 1, phase: "General", title: "Antigua", status: "Pendiente", assignee: "Ana" });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-cowork-rules",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("access links", () => {
  test("owner creates a link; others cannot", async () => {
    const id = "d".repeat(32);
    const data = { id, projectId: PROJECT, projectName: "Vigilia", status: "active", createdAt: NOW_ISO(), expiresAt: Timestamp.fromMillis(Date.now() + 7 * DAY), createdByUid: "owner" };
    await assertSucceeds(setDoc(doc(owner(), "projects", PROJECT, "accessLinks", id), data));
    await assertFails(setDoc(doc(requester(), "projects", PROJECT, "accessLinks", "e".repeat(32)), { ...data, id: "e".repeat(32), createdByUid: "req" }));
  });

  test("links need a long random id, the real project name and a bounded expiry", async () => {
    const base = { projectId: PROJECT, projectName: "Vigilia", status: "active", createdAt: NOW_ISO(), expiresAt: Timestamp.fromMillis(Date.now() + 7 * DAY), createdByUid: "owner" };
    await assertFails(setDoc(doc(owner(), "projects", PROJECT, "accessLinks", "short"), { ...base, id: "short" }));
    await assertFails(setDoc(doc(owner(), "projects", PROJECT, "accessLinks", "f".repeat(32)), { ...base, id: "f".repeat(32), projectName: "Otro" }));
    await assertFails(setDoc(doc(owner(), "projects", PROJECT, "accessLinks", "f".repeat(32)), { ...base, id: "f".repeat(32), expiresAt: Timestamp.fromMillis(Date.now() + 90 * DAY) }));
  });

  test("signed-in people read a link by id; only the owner lists; owner revokes", async () => {
    await assertSucceeds(getDoc(doc(requester(), "projects", PROJECT, "accessLinks", LINK)));
    await assertFails(getDocs(collection(requester(), "projects", PROJECT, "accessLinks")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "projects", PROJECT, "accessLinks", LINK)));
    await assertFails(updateDoc(doc(requester(), "projects", PROJECT, "accessLinks", LINK), { status: "revoked", revokedAt: "now" }));
    await assertSucceeds(updateDoc(doc(owner(), "projects", PROJECT, "accessLinks", LINK), { status: "revoked", revokedAt: "now" }));
  });
});

describe("access requests", () => {
  test("verified account with a live link can ask once; history is required", async () => {
    await assertFails(submitRequest(requester(), "req", "req@team.test", { skipHistory: true }));
    await assertSucceeds(submitRequest(requester(), "req", "req@team.test"));
    await assertFails(submitRequest(requester(), "req", "req@team.test"));
    await assertFails(submitRequest(requester(), "req", "req@team.test", { attempt: 2 }));
  });

  test("expired, revoked, unknown links and unverified accounts are refused", async () => {
    await assertFails(submitRequest(requester(), "req", "req@team.test", { linkId: EXPIRED_LINK }));
    await assertFails(submitRequest(requester(), "req", "req@team.test", { linkId: REVOKED_LINK }));
    await assertFails(submitRequest(requester(), "req", "req@team.test", { linkId: "9".repeat(32) }));
    await assertFails(submitRequest(unverified(), "unverified", "new@team.test"));
  });

  test("requesters cannot grant themselves membership, approval or retries", async () => {
    await submitRequest(requester(), "req", "req@team.test");
    const db = requester();
    await assertFails(setDoc(doc(db, "projects", PROJECT, "members", "req"), { uid: "req", email: "req@team.test", emailLower: "req@team.test", name: "Persona", role: "owner", status: "active", joinedAt: "x" }));
    await assertFails(setDoc(doc(db, "users", "req", "projectAccess", PROJECT), { projectId: PROJECT, role: "member", joinedAt: "x" }));
    await assertFails(approvalBatch(db, "req", "req@team.test").commit());
    await assertFails(updateDoc(doc(db, "projects", PROJECT, "accessRequests", "req"), { retryAllowed: true, grantVersion: 1 }));
    await assertFails(getDoc(doc(db, "projects", PROJECT)));
  });

  test("owner approval writes membership, picker entry, directory, status and history together", async () => {
    await submitRequest(requester(), "req", "req@team.test");
    await assertFails(approvalBatch(owner(), "req", "req@team.test", { skipHistory: true }).commit());
    await assertFails(approvalBatch(owner(), "req", "req@team.test", { member: { role: "owner" } }).commit());
    await assertSucceeds(approvalBatch(owner(), "req", "req@team.test").commit());
    await assertSucceeds(getDoc(doc(requester(), "projects", PROJECT)));
  });

  test("rejection → allow → withdraw → allow → retry consumes the authorization", async () => {
    await submitRequest(requester(), "req", "req@team.test");
    await assertSucceeds(rejectBatch(owner(), "req").commit());
    // Without authorization the requester cannot ask again.
    await assertFails(submitRequest(requester(), "req", "req@team.test", { attempt: 2 }));
    await assertFails(retryToggleBatch(requester(), "req", { allowed: true, grantVersion: 1 }).commit());
    await assertSucceeds(retryToggleBatch(owner(), "req", { allowed: true, grantVersion: 1 }).commit());
    await assertSucceeds(retryToggleBatch(owner(), "req", { allowed: false, grantVersion: 2 }).commit());
    await assertFails(submitRequest(requester(), "req", "req@team.test", { attempt: 2 }));
    await assertSucceeds(retryToggleBatch(owner(), "req", { allowed: true, grantVersion: 3 }).commit());
    // Retry needs a live link.
    await assertFails(submitRequest(requester(), "req", "req@team.test", { attempt: 2, linkId: EXPIRED_LINK }));
    await assertSucceeds(submitRequest(requester(), "req", "req@team.test", { attempt: 2 }));
    const current = await getDoc(doc(owner(), "projects", PROJECT, "accessRequests", "req"));
    assert.equal(current.data().status, "pending");
    assert.equal(current.data().retryAllowed, false);
    // Double submission of the same attempt, and withdrawing after the retry, both fail.
    await assertFails(submitRequest(requester(), "req", "req@team.test", { attempt: 3 }));
    await assertFails(retryToggleBatch(owner(), "req", { attempt: 2, allowed: false, grantVersion: 1 }).commit());
    // A second rejection is final again, then approval works on attempt 2.
    await assertSucceeds(rejectBatch(owner(), "req", 2).commit());
    await assertFails(submitRequest(requester(), "req", "req@team.test", { attempt: 3 }));
  });

  test("approval of a retried request uses its attempt number", async () => {
    await submitRequest(requester(), "req", "req@team.test");
    await rejectBatch(owner(), "req").commit();
    await retryToggleBatch(owner(), "req", { allowed: true, grantVersion: 1 }).commit();
    await submitRequest(requester(), "req", "req@team.test", { attempt: 2 });
    await assertFails(approvalBatch(owner(), "req", "req@team.test", { attempt: 1 }).commit());
    await assertSucceeds(approvalBatch(owner(), "req", "req@team.test", { attempt: 2 }).commit());
  });

  test("history is immutable and private to the owner and the requester", async () => {
    await submitRequest(requester(), "req", "req@team.test");
    await rejectBatch(owner(), "req").commit();
    await assertSucceeds(getDocs(query(collection(owner(), "projects", PROJECT, "accessRequestHistory"), orderBy("at", "desc"), limit(20))));
    await assertSucceeds(getDocs(query(collection(requester(), "projects", PROJECT, "accessRequestHistory"), where("requesterUid", "==", "req"))));
    await assertFails(getDocs(collection(requester(), "projects", PROJECT, "accessRequestHistory")));
    await assertFails(getDocs(query(collection(other(), "projects", PROJECT, "accessRequestHistory"), where("requesterUid", "==", "req"))));
    await assertFails(getDoc(doc(other(), "projects", PROJECT, "accessRequests", "req")));
    await assertFails(updateDoc(doc(owner(), "projects", PROJECT, "accessRequestHistory", "req-1-rejected"), { action: "approved" }));
    await assertFails(deleteDoc(doc(owner(), "projects", PROJECT, "accessRequestHistory", "req-1-rejected")));
    await assertFails(deleteDoc(doc(owner(), "projects", PROJECT, "accessRequests", "req")));
  });

  test("revoking a link blocks new requests and keeps pending ones", async () => {
    await submitRequest(requester(), "req", "req@team.test");
    await updateDoc(doc(owner(), "projects", PROJECT, "accessLinks", LINK), { status: "revoked", revokedAt: "now" });
    await assertFails(submitRequest(other(), "other", "other@team.test"));
    await assertSucceeds(approvalBatch(owner(), "req", "req@team.test").commit());
  });

  test("a removed member may ask again with a new attempt", async () => {
    await addMember("req", "req@team.test");
    await assertFails(submitRequest(requester(), "req", "req@team.test", { attempt: 2 }));
    const ownerDb = owner();
    const batch = writeBatch(ownerDb);
    batch.delete(doc(ownerDb, "projects", PROJECT, "members", "req"));
    batch.delete(doc(ownerDb, "users", "req", "projectAccess", PROJECT));
    batch.set(doc(ownerDb, "projects", PROJECT, "directory", "req"), { uid: "req", name: "Persona", photoURL: "", active: false, updatedAt: NOW_ISO() });
    await assertSucceeds(batch.commit());
    await assertSucceeds(submitRequest(requester(), "req", "req@team.test", { attempt: 2 }));
  });
});

describe("team directory", () => {
  test("members read it; people write only their own active entry; owner keeps it in sync", async () => {
    await addMember("req", "req@team.test");
    await assertSucceeds(getDocs(collection(requester(), "projects", PROJECT, "directory")));
    await assertFails(getDocs(collection(other(), "projects", PROJECT, "directory")));
    await assertSucceeds(setDoc(doc(requester(), "projects", PROJECT, "directory", "req"), { uid: "req", name: "Nuevo nombre", photoURL: "", active: true, updatedAt: NOW_ISO() }));
    await assertFails(setDoc(doc(requester(), "projects", PROJECT, "directory", "owner"), { uid: "owner", name: "X", photoURL: "", active: true, updatedAt: NOW_ISO() }));
    await assertFails(setDoc(doc(other(), "projects", PROJECT, "directory", "other"), { uid: "other", name: "Intruso", photoURL: "", active: true, updatedAt: NOW_ISO() }));
    await assertFails(setDoc(doc(owner(), "projects", PROJECT, "directory", "req"), { uid: "req", name: "Persona", photoURL: "", active: false, updatedAt: NOW_ISO() }));
    await assertFails(setDoc(doc(requester(), "projects", PROJECT, "directory", "req"), { uid: "req", name: "X", photoURL: "", active: true, updatedAt: NOW_ISO(), email: "req@team.test" }));
  });
});

describe("tasks and activity events", () => {
  test("every task write needs its event; retries cannot duplicate events", async () => {
    await assertFails(setDoc(doc(owner(), "projects", PROJECT, "tasks", "t1"), taskData("t1")));
    await assertSucceeds(createTask(owner(), "t1"));
    await assertFails(createTask(owner(), "t1"));
    const [ref, data] = eventData(owner(), { targetId: "t1", revision: 1, kind: "created" });
    await assertFails(setDoc(ref, data));
    await assertFails(updateDoc(ref, { actorName: "Otro" }));
    await assertFails(deleteDoc(ref));
  });

  test("events must describe the real change, authored by the signed-in member at server time", async () => {
    await createTask(owner(), "t1");
    await assertFails(updateTask(owner(), "t1", { status: "Hecha", revision: 2 }, {}));
    await assertFails(updateTask(owner(), "t1", { status: "Hecha", revision: 2 }, { status: { from: "Pendiente", to: "En curso" } }));
    await assertFails(updateTask(owner(), "t1", { revision: 2 }, { status: { from: "Pendiente", to: "Hecha" } }));
    const db = owner();
    const batch = writeBatch(db);
    batch.set(doc(db, "projects", PROJECT, "tasks", "t1"), taskData("t1", { status: "Hecha", revision: 2 }));
    const [ref, event] = eventData(db, { targetId: "t1", revision: 2, kind: "updated", changes: { status: { from: "Pendiente", to: "Hecha" } } });
    batch.set(ref, { ...event, createdAt: Timestamp.fromMillis(Date.now() - DAY) });
    await assertFails(batch.commit());
    await assertSucceeds(updateTask(owner(), "t1", { status: "Hecha", revision: 2 }, { status: { from: "Pendiente", to: "Hecha" } }));
  });

  test("concurrent writes on the same revision: only the first one succeeds", async () => {
    await createTask(owner(), "t1");
    await assertSucceeds(updateTask(owner(), "t1", { status: "En curso", revision: 2 }, { status: { from: "Pendiente", to: "En curso" } }));
    await assertFails(updateTask(owner(), "t1", { status: "Hecha", revision: 2 }, { status: { from: "Pendiente", to: "Hecha" } }));
  });

  test("members assign and reassign only to active members; old references stay valid", async () => {
    await addMember("req", "req@team.test");
    await createTask(requester(), "t1", "req");
    await assertFails(updateTask(requester(), "t1", { assigneeUid: "stranger", assignee: "X", revision: 2 }, { assignee: { fromUid: "", toUid: "stranger", fromName: "", toName: "X" } }, "req"));
    await assertSucceeds(updateTask(requester(), "t1", { assigneeUid: "owner", assignee: "Owner", revision: 2 }, { assignee: { fromUid: "", toUid: "owner", fromName: "", toName: "Owner" } }, "req"));
    await assertSucceeds(updateTask(requester(), "t1", { assigneeUid: "req", assignee: "Persona", revision: 3 }, { assignee: { fromUid: "owner", toUid: "req", fromName: "Owner", toName: "Persona" } }, "req"));
    // Remove the assignee; the task keeps the reference and can still be edited.
    const ownerDb = owner();
    const batch = writeBatch(ownerDb);
    batch.delete(doc(ownerDb, "projects", PROJECT, "members", "req"));
    batch.delete(doc(ownerDb, "users", "req", "projectAccess", PROJECT));
    await batch.commit();
    await assertSucceeds(updateTask(owner(), "t1", { assigneeUid: "req", assignee: "Persona", status: "Hecha", revision: 4 }, { status: { from: "Pendiente", to: "Hecha" } }));
    await assertFails(updateTask(owner(), "t1", { assigneeUid: "req", assignee: "Persona", status: "Hecha", revision: 5, title: "Otra" }, {}, "req"));
    await assertFails(getDocs(collection(requester(), "projects", PROJECT, "tasks")));
  });

  test("legacy tasks without revision can be migrated only by the owner with a migration event", async () => {
    await addMember("req", "req@team.test");
    const migration = { assignee: { fromUid: "", toUid: "req", fromName: "Ana", toName: "Ana" }, migration: true };
    await assertFails(updateTask(requester(), "legacy", { title: "Antigua", assignee: "Ana", assigneeUid: "req", revision: 1 }, migration, "req"));
    await assertSucceeds(updateTask(owner(), "legacy", { title: "Antigua", assignee: "Ana", assigneeUid: "req", revision: 1 }, migration));
  });

  test("delete requires a deleted event with the next revision", async () => {
    await createTask(owner(), "t1");
    await assertFails(deleteDoc(doc(owner(), "projects", PROJECT, "tasks", "t1")));
    const db = owner();
    const batch = writeBatch(db);
    batch.delete(doc(db, "projects", PROJECT, "tasks", "t1"));
    const [ref, event] = eventData(db, { targetId: "t1", revision: 2, kind: "deleted" });
    batch.set(ref, event);
    await assertSucceeds(batch.commit());
  });

  test("outsiders cannot read or write events", async () => {
    await createTask(owner(), "t1");
    await assertFails(getDocs(collection(other(), "projects", PROJECT, "events")));
    await assertFails(createTask(other(), "t2", "other"));
  });

  test("branch creation carries its event", async () => {
    const db = owner();
    const branch = { id: "b1", name: "feature/x", reason: "Probar", by: "Owner", createdAt: NOW_ISO(), createdByUid: "owner" };
    // Without its event it is refused once the transition window closes.
    if (Date.now() >= Date.parse("2026-10-10T00:00:00Z")) await assertFails(setDoc(doc(db, "projects", PROJECT, "branches", "b0"), { ...branch, id: "b0" }));
    const batch = writeBatch(db);
    batch.set(doc(db, "projects", PROJECT, "branches", "b1"), branch);
    const [ref, event] = eventData(db, { targetType: "branch", targetId: "b1", revision: 1, kind: "created" });
    event.targetTitle = branch.name;
    batch.set(ref, event);
    await assertSucceeds(batch.commit());
  });
});

describe("branch register removal", () => {
  async function registered(id, name = "feature/x") {
    const db = owner();
    const batch = writeBatch(db);
    batch.set(doc(db, "projects", PROJECT, "branches", id), { id, name, reason: "Probar", by: "Owner", createdAt: NOW_ISO(), createdByUid: "owner" });
    const [ref, event] = eventData(db, { targetType: "branch", targetId: id, revision: 1, kind: "created" });
    event.targetTitle = name;
    batch.set(ref, event);
    await batch.commit();
  }
  function removal(db, id, title) {
    const batch = writeBatch(db);
    batch.delete(doc(db, "projects", PROJECT, "branches", id));
    const [ref, event] = eventData(db, { targetType: "branch", targetId: id, revision: 2, kind: "deleted", id: `branch-${id}-deleted` });
    event.targetTitle = title;
    batch.set(ref, event);
    return batch.commit();
  }

  test("removing an entry writes its event with the real name; edits are not allowed", async () => {
    await registered("b1");
    await assertFails(updateDoc(doc(owner(), "projects", PROJECT, "branches", "b1"), { reason: "Otro" }));
    if (Date.now() >= Date.parse("2026-10-10T00:00:00Z")) await assertFails(deleteDoc(doc(owner(), "projects", PROJECT, "branches", "b1")));
    await assertFails(removal(owner(), "b1", "feature/otra"));
    await assertFails(removal(other(), "b1", "feature/x"));
    await assertSucceeds(removal(owner(), "b1", "feature/x"));
    const event = await getDoc(doc(owner(), "projects", PROJECT, "events", "branch-b1-deleted"));
    assert.equal(event.data().kind, "deleted");
  });

  test("a removal event needs the entry to go away in the same write", async () => {
    await registered("b2");
    const db = owner();
    const [ref, event] = eventData(db, { targetType: "branch", targetId: "b2", revision: 2, kind: "deleted", id: "branch-b2-deleted" });
    event.targetTitle = "feature/x";
    await assertFails(setDoc(ref, event));
  });
});

describe("project creation event", () => {
  test("the owner writes it in the creating batch, timed by the server", async () => {
    await assertSucceeds(projectCreation(owner(), "owner", "nuevo-a1b2c3").commit());
    const event = await getDoc(doc(owner(), "projects", "nuevo-a1b2c3", "events", "project-nuevo-a1b2c3"));
    assert.equal(event.data().targetType, "project");
    assert.ok(event.data().createdAt instanceof Timestamp);
    // Tabs opened with the previous version still create projects without the event.
    await assertSucceeds(projectCreation(owner(), "owner", "antiguo-a1b2c3", { withEvent: false }).commit());
  });

  test("it cannot be added to an existing project, even by its owner", async () => {
    const [ref, event] = [doc(owner(), "projects", PROJECT, "events", `project-${PROJECT}`), {
      id: `project-${PROJECT}`, projectId: PROJECT, kind: "created", targetType: "project", targetId: PROJECT, targetTitle: "Vigilia", revision: 1, actorUid: "owner", actorName: "Owner", createdAt: serverTimestamp(), changes: {},
    }];
    await assertFails(setDoc(ref, event));
    await assertSucceeds(projectCreation(owner(), "owner", "nuevo-a1b2c3", { withEvent: false }).commit());
    await assertFails(setDoc(doc(owner(), "projects", "nuevo-a1b2c3", "events", "project-nuevo-a1b2c3"), { ...event,
      id: "project-nuevo-a1b2c3", projectId: "nuevo-a1b2c3", targetId: "nuevo-a1b2c3", targetTitle: "Nuevo" }));
  });

  test("it cannot be attributed to someone else or describe another project", async () => {
    await assertFails(projectCreation(owner(), "owner", "nuevo-a1b2c3", { event: { actorUid: "other" } }).commit());
    await assertFails(projectCreation(other(), "owner", "ajeno-a1b2c3").commit());
    await assertFails(projectCreation(owner(), "owner", "nuevo-a1b2c3", { event: { targetTitle: "Otro nombre" } }).commit());
    await assertFails(projectCreation(owner(), "owner", "nuevo-a1b2c3", { event: { targetId: PROJECT } }).commit());
    await assertFails(projectCreation(owner(), "owner", "nuevo-a1b2c3", { event: { revision: 2 } }).commit());
    await assertFails(projectCreation(owner(), "owner", "nuevo-a1b2c3", { event: { kind: "updated" } }).commit());
    await assertFails(projectCreation(owner(), "owner", "nuevo-a1b2c3", { event: { createdAt: Timestamp.fromMillis(Date.now() - DAY) } }).commit());
    // The event of a created project is immutable.
    await projectCreation(owner(), "owner", "nuevo-a1b2c3").commit();
    const ref = doc(owner(), "projects", "nuevo-a1b2c3", "events", "project-nuevo-a1b2c3");
    await assertFails(updateDoc(ref, { targetTitle: "Otro" }));
    await assertFails(deleteDoc(ref));
  });
});

describe("milestones", () => {
  test("owner creates, edits and archives; members link tasks to active milestones only", async () => {
    await addMember("req", "req@team.test");
    await assertFails(writeMilestone(requester(), "m1", milestoneData("m1", { updatedByUid: "req", createdByUid: "req" }), "created"));
    await assertSucceeds(writeMilestone(owner(), "m1", milestoneData("m1"), "created"));
    await createTask(requester(), "t1", "req");
    await assertFails(updateTask(requester(), "t1", { milestoneId: "missing", revision: 2 }, { milestone: { from: "", to: "missing" } }, "req"));
    await assertSucceeds(updateTask(requester(), "t1", { milestoneId: "m1", revision: 2 }, { milestone: { from: "", to: "m1" } }, "req"));
    await assertFails(writeMilestone(owner(), "m1", milestoneData("m1", { revision: 2, dueAt: "2026-10-12T05:00:00.000Z", dueDate: "2026-10-11" }), "updated", {}));
    await assertSucceeds(writeMilestone(owner(), "m1", milestoneData("m1", { revision: 2, dueAt: "2026-10-12T05:00:00.000Z", dueDate: "2026-10-11" }), "updated", { dueAt: { from: "2026-10-11T05:00:00.000Z", to: "2026-10-12T05:00:00.000Z" } }));
    await assertSucceeds(writeMilestone(owner(), "m1", milestoneData("m1", { revision: 3, dueAt: "2026-10-12T05:00:00.000Z", dueDate: "2026-10-11", archived: true }), "updated", { archived: { from: false, to: true } }));
    await createTask(requester(), "t2", "req");
    await assertFails(updateTask(requester(), "t2", { milestoneId: "m1", revision: 2 }, { milestone: { from: "", to: "m1" } }, "req"));
    // Tasks already linked keep their archived milestone.
    await assertSucceeds(updateTask(requester(), "t1", { milestoneId: "m1", status: "Hecha", revision: 3 }, { status: { from: "Pendiente", to: "Hecha" } }, "req"));
    await assertFails(deleteDoc(doc(owner(), "projects", PROJECT, "milestones", "m1")));
  });
});

describe("task details", () => {
  const details = (overrides = {}) => ({
    description: "", priority: "media", dueDate: "", timeZone: "", dueAt: "", checklist: "", branch: "", createdAt: "2026-10-01T12:00:00.000Z", createdByUid: "owner", ...overrides,
  });
  // Stored as JSON, as encodeChecklist() writes it.
  const items = (count, overrides = {}) => JSON.stringify(Array.from({ length: count }, (_, index) => ({ id: `c${index}`, text: `Paso ${index}`, done: index % 2 === 0, ...overrides })));

  test("new fields are accepted within their limits", async () => {
    await assertSucceeds(createTask(owner(), "t1", "owner", details({ description: "Detalle", priority: "alta", dueDate: "2026-10-10", timeZone: "America/Panama", dueAt: "2026-10-11T05:00:00.000Z", checklist: items(3), branch: "feature/x" })));
    for (const [id, bad] of [
      ["d1", { description: "x".repeat(4001) }],
      ["d2", { checklist: "x".repeat(8001) }],
      ["d3", { checklist: [{ id: "c1", text: "Paso", done: false }] }],
      ["d6", { priority: "urgente" }],
      ["d7", { dueDate: "10/10/2026", timeZone: "UTC", dueAt: "2026-10-11T00:00:00.000Z" }],
      ["d8", { dueDate: "2026-10-10", timeZone: "", dueAt: "2026-10-11T00:00:00.000Z" }],
      ["d9", { dueDate: "", dueAt: "2026-10-11T00:00:00.000Z" }],
      ["d10", { branch: "x".repeat(121) }],
      ["d11", { createdByUid: "someone-else" }],
      ["d12", { extra: true }],
    ]) await assertFails(createTask(owner(), id, "owner", details(bad)));
  });

  test("the creation stamp never changes and old tabs cannot erase fields", async () => {
    await createTask(owner(), "t1", "owner", details({ description: "Detalle" }));
    await assertFails(updateTask(owner(), "t1", { ...details({ description: "Detalle", createdAt: "2020-01-01T00:00:00.000Z" }), status: "Hecha", revision: 2 }, { status: { from: "Pendiente", to: "Hecha" } }));
    // An older tab writes only the first fields: refused instead of silently dropping the description.
    await assertFails(updateTask(owner(), "t1", { status: "Hecha", revision: 2 }, { status: { from: "Pendiente", to: "Hecha" } }));
    await assertSucceeds(updateTask(owner(), "t1", { ...details({ description: "Detalle" }), status: "Hecha", revision: 2 }, { status: { from: "Pendiente", to: "Hecha" } }));
  });

  test("a task written before the new fields is upgraded by the new client", async () => {
    await createTask(owner(), "t1");
    await assertSucceeds(updateTask(owner(), "t1", { ...details({ createdAt: "", createdByUid: "" }), status: "En curso", revision: 2 }, { status: { from: "Pendiente", to: "En curso" } }));
  });

  test("events must record every change with its real values", async () => {
    await createTask(owner(), "t1", "owner", details());
    const base = details();
    // Title, phase and order changes can no longer go unrecorded.
    await assertFails(updateTask(owner(), "t1", { ...base, title: "Otra", revision: 2 }, {}));
    await assertFails(updateTask(owner(), "t1", { ...base, phase: "Diseño", revision: 2 }, {}));
    await assertFails(updateTask(owner(), "t1", { ...base, order: 5, revision: 2 }, {}));
    await assertFails(updateTask(owner(), "t1", { ...base, title: "Otra", revision: 2 }, { title: { from: "Falso", to: "Otra" } }));
    await assertFails(updateTask(owner(), "t1", { ...base, revision: 2, checklist: items(2) }, {}));
    await assertFails(updateTask(owner(), "t1", { ...base, revision: 2, checklist: items(2) }, { checklist: { done: 3, total: 2 } }));
    await assertFails(updateTask(owner(), "t1", { ...base, revision: 2, checklist: items(2) }, { checklist: { done: 1, total: 21 } }));
    await assertFails(updateTask(owner(), "t1", { ...base, revision: 2, description: "Nueva" }, {}));
    await assertFails(updateTask(owner(), "t1", { ...base, revision: 2, priority: "alta" }, { priority: { from: "baja", to: "alta" } }));
    await assertSucceeds(updateTask(owner(), "t1", { ...base, revision: 2, title: "Otra", phase: "Diseño", order: 5 }, { title: { from: "Tarea", to: "Otra" }, phase: { from: "General", to: "Diseño" }, order: true }));
  });

  test("milestone changes carry their real from and to", async () => {
    await assertSucceeds(writeMilestone(owner(), "m1", milestoneData("m1"), "created"));
    await createTask(owner(), "t1", "owner", details());
    await assertFails(updateTask(owner(), "t1", { ...details(), milestoneId: "m1", revision: 2 }, { milestone: { from: "otro", to: "m1" } }));
    await assertSucceeds(updateTask(owner(), "t1", { ...details(), milestoneId: "m1", revision: 2 }, { milestone: { from: "", to: "m1" } }));
  });

  test("worst case: every field changes at once with a full checklist", async () => {
    await assertSucceeds(writeMilestone(owner(), "m1", milestoneData("m1"), "created"));
    await addMember("req", "req@team.test");
    await createTask(owner(), "t1", "owner", details({ checklist: items(20) }));
    const next = { ...details({ description: "Nueva", priority: "alta", dueDate: "2026-10-10", timeZone: "America/Panama", dueAt: "2026-10-11T05:00:00.000Z", checklist: items(20, { done: true }), branch: "feature/y" }),
      title: "Otra", phase: "Diseño", order: 7, status: "Hecha", assigneeUid: "req", assignee: "Persona", milestoneId: "m1", revision: 2 };
    await assertSucceeds(updateTask(owner(), "t1", next, {
      status: { from: "Pendiente", to: "Hecha" },
      assignee: { fromUid: "", toUid: "req", fromName: "", toName: "Persona" },
      milestone: { from: "", to: "m1" },
      title: { from: "Tarea", to: "Otra" },
      phase: { from: "General", to: "Diseño" },
      priority: { from: "media", to: "alta" },
      dueAt: { from: "", to: "2026-10-11T05:00:00.000Z" },
      branch: { from: "", to: "feature/y" },
      checklist: { done: 20, total: 20 },
      details: true,
      order: true,
    }));
  });
});

describe("personal data", () => {
  test("preferences, read state and scene choice are private", async () => {
    await assertSucceeds(setDoc(doc(requester(), "users", "req", "preferences", "main"), { favorites: [PROJECT], order: [PROJECT], sort: "custom", filter: "favorites", motion: "full", updatedAt: NOW_ISO() }));
    await assertFails(getDoc(doc(other(), "users", "req", "preferences", "main")));
    await assertFails(setDoc(doc(other(), "users", "req", "preferences", "main"), { sort: "name" }));
    await assertFails(setDoc(doc(requester(), "users", "req", "preferences", "main"), { sort: "random" }));
    await assertSucceeds(setDoc(doc(requester(), "users", "req", "readState", PROJECT), { projectId: PROJECT, lastReadAt: serverTimestamp(), readIds: [] }));
    await assertFails(getDoc(doc(other(), "users", "req", "readState", PROJECT)));
  });

  test("scene selection is validated against the accumulated days", async () => {
    await assertSucceeds(setDoc(doc(owner(), "users", "owner", "preferences", "scene"), { characterId: "farolero", landscapeId: "valle-nocturno" }));
    await assertFails(setDoc(doc(owner(), "users", "owner", "preferences", "scene"), { characterId: "gato-explorador", landscapeId: "valle-nocturno" }));
    await assertFails(setDoc(doc(owner(), "users", "owner", "preferences", "scene"), { characterId: "dragon", landscapeId: "valle-nocturno" }));
    await createTask(owner(), "t1");
    await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), "users", "owner", "progress", "summary"), { activeDays: 1, lastRecordedDay: Math.floor(Date.now() / DAY), updatedAt: Timestamp.now() }));
    await assertSucceeds(setDoc(doc(owner(), "users", "owner", "preferences", "scene"), { characterId: "farolero", landscapeId: "valle-amanecer" }));
    await assertFails(setDoc(doc(owner(), "users", "owner", "preferences", "scene"), { characterId: "gato-explorador", landscapeId: "valle-amanecer" }));
  });
});

describe("validated reward accounting", () => {
  test("real work remains writable but clients cannot mint activity or points", async () => {
    await createTask(owner(), "t1");
    await assertFails(recordDay(owner(), "owner", "task-t1-1"));
    await assertFails(awardPoint(owner(), "owner", "task-t1-1"));
    await updateTask(owner(), "t1", { status: "En curso", revision: 2 }, { status: { from: "Pendiente", to: "En curso" } });
    await assertFails(recordDay(owner(), "owner", "task-t1-2"));
    await assertFails(awardPoint(owner(), "owner", "task-t1-2"));
  });

  test("forged counters, balances and receipt rewrites are refused", async () => {
    await assertFails(setDoc(doc(owner(), "users", "owner", "progress", "summary"), { activeDays: 30, lastRecordedDay: 1, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(owner(), "users", "owner", "progress", "wallet"), { balance: 99, earned: 99, spent: 0, lastAward: "", lastPurchase: "", updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(owner(), "users", "owner", "pointDays", "1"), { day: 1, points: 1, updatedAt: serverTimestamp() }));
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "owner", "activeDays", "1"), { day: 1 });
      await setDoc(doc(context.firestore(), "users", "owner", "pointEvents", "receipt"), { day: 1 });
    });
    for (const [group, id] of [["activeDays", "1"], ["pointEvents", "receipt"]]) {
      await assertSucceeds(getDoc(doc(owner(), "users", "owner", group, id)));
      await assertFails(updateDoc(doc(owner(), "users", "owner", group, id), { day: 2 }));
      await assertFails(deleteDoc(doc(owner(), "users", "owner", group, id)));
      await assertFails(getDoc(doc(other(), "users", "owner", group, id)));
    }
  });

  test("simultaneous direct credits from two devices are both rejected", async () => {
    await createTask(owner(), "t1");
    const results = await Promise.allSettled([awardPoint(owner(), "owner", "task-t1-1"), awardPoint(owner(), "owner", "task-t1-1")]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 0);
    assert.equal((await getDoc(doc(owner(), "users", "owner", "progress", "wallet"))).exists(), false);
  });

  test("rewards and inventory remain private between accounts", async () => {
    await assertFails(getDoc(doc(other(), "users", "owner", "progress", "wallet")));
    await assertFails(getDocs(collection(other(), "users", "owner", "inventory")));
    await assertFails(getDocs(collection(other(), "users", "owner", "activeDays")));
    await assertFails(getDocs(collection(other(), "users", "owner", "pointDays")));
  });

  test("simultaneous purchases never overspend nor charge twice", async () => {
    await seedWallet("owner", 12);
    const different = await Promise.allSettled([buy(owner(), "owner", "farolero-invernal", 10), buy(owner(), "owner", "gato-medianoche", 10)]);
    assert.equal(different.filter((result) => result.status === "fulfilled").length, 1);
    let wallet = (await getDoc(doc(owner(), "users", "owner", "progress", "wallet"))).data();
    assert.equal(wallet.balance, 2);
    await seedWallet("owner", 40);
    const same = await Promise.allSettled([buy(owner(), "owner", "pinar-aurora", 25), buy(owner(), "owner", "pinar-aurora", 25)]);
    assert.equal(same.filter((result) => result.status === "fulfilled").length, 1);
    wallet = (await getDoc(doc(owner(), "users", "owner", "progress", "wallet"))).data();
    assert.equal(wallet.balance, 15);
  });
});

describe("shop", () => {
  test("a purchase charges the price and adds the item, once", async () => {
    await seedWallet("owner", 12);
    await assertSucceeds(buy(owner(), "owner", "farolero-invernal", 10));
    const wallet = await getDoc(doc(owner(), "users", "owner", "progress", "wallet"));
    assert.equal(wallet.data().balance, 2);
    assert.equal(wallet.data().spent, 10);
    await assertFails(buy(owner(), "owner", "farolero-invernal", 10));
    await assertFails(updateDoc(doc(owner(), "users", "owner", "inventory", "farolero-invernal"), { price: 0 }));
    await assertFails(deleteDoc(doc(owner(), "users", "owner", "inventory", "farolero-invernal")));
  });

  test("purchases need enough balance, the catalog price and a real shop item", async () => {
    await seedWallet("owner", 20);
    await assertFails(buy(owner(), "owner", "pinar-aurora", 25));
    await assertFails(buy(owner(), "owner", "gato-medianoche", 1));
    await assertFails(buy(owner(), "owner", "gato-medianoche", 10, 1));
    await assertFails(buy(owner(), "owner", "gato-explorador", 0));
    await assertFails(buy(owner(), "owner", "dragon", 10));
    // Item without charge, or charge without item.
    await assertFails(setDoc(doc(owner(), "users", "owner", "inventory", "valle-nevado"), { itemId: "valle-nevado", price: 10, acquiredAt: serverTimestamp() }));
    await assertFails(setDoc(doc(owner(), "users", "owner", "progress", "wallet"), { balance: 10, earned: 20, spent: 10, lastAward: "seed", lastPurchase: "valle-nevado", updatedAt: serverTimestamp() }));
    await assertFails(buy(requester(), "owner", "valle-nevado", 10));
  });

  test("bought items can be equipped; items not owned cannot", async () => {
    await assertFails(setDoc(doc(owner(), "users", "owner", "preferences", "scene"), { characterId: "espiritu-bosque", landscapeId: "valle-nevado" }));
    await seedWallet("owner", 50);
    await assertSucceeds(buy(owner(), "owner", "espiritu-bosque", 40));
    await assertSucceeds(setDoc(doc(owner(), "users", "owner", "preferences", "scene"), { characterId: "espiritu-bosque", landscapeId: "valle-nocturno" }));
    await assertFails(setDoc(doc(owner(), "users", "owner", "preferences", "scene"), { characterId: "espiritu-bosque", landscapeId: "valle-nevado" }));
    await assertSucceeds(buy(owner(), "owner", "valle-nevado", 10));
    await assertSucceeds(setDoc(doc(owner(), "users", "owner", "preferences", "scene"), { characterId: "espiritu-bosque", landscapeId: "valle-nevado" }));
    assert.equal((await getDoc(doc(owner(), "users", "owner", "progress", "wallet"))).data().balance, 0);
  });
});

describe("streaks: ledger integrity and social privacy", () => {
  test("owners can read private streak data but unvalidated writes and outsiders are denied", async () => {
    const groups = ["streak", "protectedDays", "protectionPurchases", "streakCelebrations", "streakRequests", "streakNudges"];
    await env.withSecurityRulesDisabled(async (context) => {
      for (const group of groups) await setDoc(doc(context.firestore(), "users", "owner", group, group === "streak" ? "state" : "record"), { day: 1 });
    });
    for (const group of groups) {
      const ref = doc(owner(), "users", "owner", group, group === "streak" ? "state" : "record");
      await assertSucceeds(getDoc(ref));
      await assertFails(getDoc(doc(other(), "users", "owner", group, group === "streak" ? "state" : "record")));
      await assertFails(updateDoc(ref, { protectors: 99, ownerUid: "other" }));
      await assertFails(deleteDoc(ref));
      await assertFails(setDoc(doc(owner(), "users", "owner", group, "new"), { day: 1 }));
    }
  });
  test("pair queries only expose the requesting participant's pairs, never wallets or activity", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "streakPairs", "pair"), { memberUids: ["owner", "req"], status: "active", current: 2 });
      await setDoc(doc(context.firestore(), "streakInvites", "token"), { ownerUid: "owner", status: "pending" });
    });
    await assertSucceeds(getDoc(doc(requester(), "streakPairs", "pair")));
    await assertSucceeds(getDocs(query(collection(requester(), "streakPairs"), where("memberUids", "array-contains", "req"))));
    await assertFails(getDocs(collection(requester(), "streakPairs")));
    await assertFails(getDoc(doc(other(), "streakPairs", "pair")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "streakPairs", "pair")));
    await assertFails(updateDoc(doc(requester(), "streakPairs", "pair"), { memberUids: ["req", "other"], current: 999 }));
    await assertFails(setDoc(doc(requester(), "streakPairs", "forged"), { memberUids: ["req", "owner"] }));
    await assertFails(getDoc(doc(requester(), "users", "owner", "progress", "wallet")));
    await assertFails(getDocs(collection(requester(), "users", "owner", "activeDays")));
    await assertFails(getDocs(collection(requester(), "users", "owner", "protectedDays")));
    await assertFails(getDoc(doc(requester(), "streakSocial", "owner")));
    await assertFails(getDoc(doc(owner(), "streakNudgeReceipts", "pair_1")));
    await assertFails(setDoc(doc(owner(), "streakNudgeReceipts", "pair_1"), { fromUid: "owner" }));
    await assertSucceeds(getDoc(doc(owner(), "users", "owner", "workReceipts", "event")));
    await assertFails(getDoc(doc(requester(), "streakInvites", "token")));
    await assertSucceeds(getDocs(query(collection(owner(), "streakInvites"), where("ownerUid", "==", "owner"))));
    await assertFails(updateDoc(doc(owner(), "streakInvites", "token"), { status: "accepted" }));
  });
});

describe("transition for tabs opened with the previous version", () => {
  const cutoff = Date.parse("2026-10-10T00:00:00Z");
  const open = Date.now() < cutoff;
  const legacy = (id, overrides = {}) => ({ id, order: 1, phase: "General", title: "Antigua", status: "Pendiente", assignee: "Ana", ...overrides });
  const expectWindow = (promise) => open ? assertSucceeds(promise) : assertFails(promise);

  test("legacy writes are accepted only on documents without a revision, until the cutoff", async () => {
    await expectWindow(setDoc(doc(owner(), "projects", PROJECT, "tasks", "old-client"), legacy("old-client")));
    await expectWindow(setDoc(doc(owner(), "projects", PROJECT, "tasks", "legacy"), legacy("legacy", { status: "Hecha" })));
    await createTask(owner(), "t1");
    // Never downgrade a task that already has revisions and events.
    await assertFails(setDoc(doc(owner(), "projects", PROJECT, "tasks", "t1"), legacy("t1")));
    await assertFails(deleteDoc(doc(owner(), "projects", PROJECT, "tasks", "t1")));
    await expectWindow(setDoc(doc(owner(), "projects", PROJECT, "branches", "old"), { id: "old", name: "feature/old", reason: "x", by: "Owner", createdAt: NOW_ISO(), createdByUid: "owner" }));
    // Outsiders stay out during the transition too.
    await assertFails(setDoc(doc(other(), "projects", PROJECT, "tasks", "x"), legacy("x")));
  });
});

describe("retired email invitations and schedule", () => {
  test("invitations are read-only for the owner", async () => {
    await assertFails(setDoc(doc(owner(), "projects", PROJECT, "invitations", "invite-new"), { id: "invite-new" }));
    await assertSucceeds(getDoc(doc(owner(), "projects", PROJECT, "invitations", "invite-legacy")));
  });

  test("only the owner sets an https project icon, and can remove it", async () => {
    await assertSucceeds(updateDoc(doc(owner(), "projects", PROJECT), { iconUrl: "https://sitio.example/favicon.svg" }));
    await assertFails(updateDoc(doc(owner(), "projects", PROJECT), { iconUrl: "http://sitio.example/favicon.svg" }));
    await assertFails(updateDoc(doc(owner(), "projects", PROJECT), { iconUrl: "javascript:alert(1)" }));
    await addMember("req", "req@team.test");
    await assertFails(updateDoc(doc(requester(), "projects", PROJECT), { iconUrl: "https://otro.example/x.png" }));
    await assertSucceeds(updateDoc(doc(owner(), "projects", PROJECT), { iconUrl: deleteField() }));
  });

  test("owner sets and removes the schedule", async () => {
    const schedule = { startDate: "2026-10-01", endDate: "2026-10-31", timeZone: "America/Panama", startsAt: "2026-10-01T05:00:00.000Z", endsAt: "2026-11-01T05:00:00.000Z" };
    await assertSucceeds(updateDoc(doc(owner(), "projects", PROJECT), { schedule }));
    await assertFails(updateDoc(doc(owner(), "projects", PROJECT), { schedule: { ...schedule, endDate: "2026-09-01" } }));
    await assertSucceeds(updateDoc(doc(owner(), "projects", PROJECT), { schedule: deleteField() }));
  });
});

describe("project release notes sync", () => {
  function proposal(id, author = "owner", overrides = {}) {
    return {
      id,
      sourceUrl: "https://updates.example.test/changelog",
      title: "Fix login",
      body: "The login error is fixed.",
      section: "fixed",
      releaseKind: "fix",
      version: "1.2.0",
      suggestedStatus: "Hecha",
      contentHash: "b".repeat(64),
      reviewStatus: "pending",
      taskId: "",
      createdAt: serverTimestamp(),
      createdByUid: author,
      updatedAt: serverTimestamp(),
      updatedByUid: author,
      reviewedAt: null,
      reviewedByUid: "",
      ...overrides,
    };
  }

  test("the owner can set only a public HTTPS changelog source", async () => {
    await assertSucceeds(updateDoc(doc(owner(), "projects", PROJECT), { changelogUrl: "https://updates.example.test/changelog" }));
    await assertFails(updateDoc(doc(owner(), "projects", PROJECT), { changelogUrl: "http://updates.example.test/changelog" }));
  });

  test("members share bounded proposals and only review pending content", async () => {
    const id = "a".repeat(64);
    const ref = doc(owner(), "projects", PROJECT, "releaseSyncItems", id);
    await assertSucceeds(setDoc(ref, proposal(id)));
    await assertSucceeds(updateDoc(ref, {
      releaseKind: "feature",
      updatedAt: serverTimestamp(),
      updatedByUid: "owner",
    }));
    const legacyId = "f".repeat(64);
    const legacyProposal = proposal(legacyId);
    delete legacyProposal.releaseKind;
    const legacyRef = doc(owner(), "projects", PROJECT, "releaseSyncItems", legacyId);
    await assertSucceeds(setDoc(legacyRef, legacyProposal));
    await assertSucceeds(updateDoc(legacyRef, {
      releaseKind: "fix",
      updatedAt: serverTimestamp(),
      updatedByUid: "owner",
    }));
    await assertFails(getDoc(doc(other(), "projects", PROJECT, "releaseSyncItems", id)));
    await assertFails(setDoc(doc(requester(), "projects", PROJECT, "releaseSyncItems", "c".repeat(64)), proposal("c".repeat(64), "req")));

    await assertFails(setDoc(doc(owner(), "projects", PROJECT, "releaseSyncItems", "d".repeat(64)), proposal("d".repeat(64), "owner", { body: "x".repeat(1501) })));
    await assertFails(setDoc(doc(owner(), "projects", PROJECT, "releaseSyncItems", "e".repeat(64)), proposal("e".repeat(64), "owner", { releaseKind: "tiny" })));
    const taskDb = owner();
    const taskBatch = writeBatch(taskDb);
    taskBatch.set(doc(taskDb, "projects", PROJECT, "tasks", "news-fix-login"), taskData("news-fix-login", { title: "Fix login" }));
    const [taskEventRef, taskEvent] = eventData(taskDb, { targetId: "news-fix-login", revision: 1, kind: "created" });
    taskEvent.targetTitle = "Fix login";
    taskBatch.set(taskEventRef, taskEvent);
    await assertSucceeds(taskBatch.commit());
    await addMember("req", "req@team.test");
    const memberRef = doc(requester(), "projects", PROJECT, "releaseSyncItems", id);
    const visible = await getDoc(memberRef);
    assert.equal(visible.data().title, "Fix login");
    await assertSucceeds(updateDoc(memberRef, {
      reviewStatus: "accepted",
      taskId: "news-fix-login",
      updatedAt: serverTimestamp(),
      updatedByUid: "req",
      reviewedAt: serverTimestamp(),
      reviewedByUid: "req",
    }));
    await assertFails(updateDoc(memberRef, { body: "Changed after approval", updatedAt: serverTimestamp(), updatedByUid: "req" }));
  });
});

describe("GitHub", () => {
  test("only the owner sets who may change branches, with a known value", async () => {
    await assertSucceeds(updateDoc(doc(owner(), "projects", PROJECT), { githubPolicy: { branchWrite: "members" } }));
    await assertSucceeds(updateDoc(doc(owner(), "projects", PROJECT), { githubPolicy: { branchWrite: "owner" } }));
    await assertFails(updateDoc(doc(owner(), "projects", PROJECT), { githubPolicy: { branchWrite: "everyone" } }));
    await assertFails(updateDoc(doc(owner(), "projects", PROJECT), { githubPolicy: { branchWrite: "members", token: "gho_x" } }));
    await assertFails(updateDoc(doc(owner(), "projects", PROJECT), { githubPolicy: "members" }));
    await addMember("req", "req@team.test");
    await assertFails(updateDoc(doc(requester(), "projects", PROJECT), { githubPolicy: { branchWrite: "members" } }));
  });

  test("a registered branch may say it was created in GitHub, as a boolean", async () => {
    const db = owner();
    const create = (id, extra) => {
      const batch = writeBatch(db);
      const branch = { id, name: `feature/${id}`, reason: "Probar", by: "Owner", createdAt: NOW_ISO(), createdByUid: "owner", ...extra };
      batch.set(doc(db, "projects", PROJECT, "branches", id), branch);
      const [ref, event] = eventData(db, { targetType: "branch", targetId: id, revision: 1, kind: "created" });
      event.targetTitle = branch.name;
      batch.set(ref, event);
      return batch.commit();
    };
    await assertSucceeds(create("g1", { githubCreated: true }));
    await assertFails(create("g2", { githubCreated: "sí" }));
  });
});

describe("file drafts", () => {
  const draftData = (id, uid, overrides = {}) => ({
    id, ref: "main", path: "src/nuevo.ts", encoding: "utf-8", size: 12, message: "Añadir nuevo.ts", status: "pending",
    authorUid: uid, authorName: "Persona", createdAt: NOW_ISO(), reviewNote: "", reviewedByUid: "", reviewerName: "", ...overrides,
  });
  const fileEvent = (db, id, step, { kind, revision, changes, title = "src/nuevo.ts", actorUid }) => {
    const eventId = step ? `file-${id}-${step}` : `file-${id}`;
    return [doc(db, "projects", PROJECT, "events", eventId), {
      id: eventId, projectId: PROJECT, kind, targetType: "file", targetId: id, targetTitle: title, revision, actorUid, actorName: "x", createdAt: serverTimestamp(), changes,
    }];
  };
  function propose(db, uid, id, overrides = {}, { content = "hola mundo\n", withEvent = true, withContent = true } = {}) {
    const data = draftData(id, uid, overrides);
    const batch = writeBatch(db);
    batch.set(doc(db, "projects", PROJECT, "fileDrafts", id), data);
    if (withContent) batch.set(doc(db, "projects", PROJECT, "fileDraftContents", id), { id, content });
    if (withEvent) batch.set(...fileEvent(db, id, "", { kind: "created", revision: 1, changes: { ref: data.ref }, title: data.path, actorUid: uid }));
    return batch.commit();
  }
  function reject(db, uid, id, note = "Falta la licencia") {
    const batch = writeBatch(db);
    batch.update(doc(db, "projects", PROJECT, "fileDrafts", id), { status: "rejected", reviewNote: note, reviewedByUid: uid, reviewerName: "x" });
    batch.set(...fileEvent(db, id, "rejected", { kind: "updated", revision: 2, changes: { review: "rejected", ref: "main" }, actorUid: uid }));
    return batch.commit();
  }
  function close(db, uid, id, review, revision = 2) {
    const batch = writeBatch(db);
    batch.delete(doc(db, "projects", PROJECT, "fileDrafts", id));
    batch.delete(doc(db, "projects", PROJECT, "fileDraftContents", id));
    batch.set(...fileEvent(db, id, review === "approved" ? "done" : "discarded", { kind: "deleted", revision, changes: { review, ref: "main" }, actorUid: uid }));
    return batch.commit();
  }

  test("a member proposes a file together with its content and event", async () => {
    await addMember("req", "req@team.test");
    await assertSucceeds(propose(requester(), "req", "f1"));
    await assertFails(propose(requester(), "req", "f2", {}, { withEvent: false }));
    await assertFails(propose(requester(), "req", "f3", {}, { withContent: false }));
    await assertFails(propose(requester(), "req", "f4", { authorUid: "owner" }));
    await assertFails(propose(requester(), "req", "f5", { status: "rejected" }));
    await assertFails(propose(other(), "other", "f6"));
    assert.equal((await getDoc(doc(owner(), "projects", PROJECT, "fileDraftContents", "f1"))).data().content, "hola mundo\n");
    await assertFails(getDoc(doc(other(), "projects", PROJECT, "fileDrafts", "f1")));
    await assertFails(getDoc(doc(other(), "projects", PROJECT, "fileDraftContents", "f1")));
  });

  test("paths, sizes and content are checked", async () => {
    const bad = [
      ["p1", { path: "/raiz.ts" }], ["p2", { path: "src/" }], ["p3", { path: "src//a.ts" }], ["p4", { path: "../fuera.ts" }],
      ["p5", { path: "src/./a.ts" }], ["p6", { path: ".git/config" }], ["p7", { path: "a\b.ts" }], ["p8", { path: "a\nb.ts" }],
      ["p9", { path: "x".repeat(301) }], ["p10", { size: 665601 }], ["p11", { encoding: "latin1" }], ["p12", { message: "" }], ["p13", { extra: true }],
    ];
    for (const [id, overrides] of bad) await assertFails(propose(owner(), "owner", id, overrides));
    await assertFails(propose(owner(), "owner", "p14", {}, { content: "x".repeat(900001) }));
    await assertSucceeds(propose(owner(), "owner", "ok1", { path: ".github/workflows/ci.yml" }));
    await assertSucceeds(propose(owner(), "owner", "ok2", { path: "docs/..notas.md", encoding: "base64", size: 665600 }));
  });

  test("only a reviewer rejects, without touching the content, and the author sees the note", async () => {
    await addMember("req", "req@team.test");
    await propose(requester(), "req", "f1");
    await assertFails(reject(requester(), "req", "f1"));
    await assertFails(updateDoc(doc(owner(), "projects", PROJECT, "fileDrafts", "f1"), { status: "rejected", reviewNote: "x", reviewedByUid: "owner", reviewerName: "x" }));
    const ownerDb = owner();
    const batch = writeBatch(ownerDb);
    batch.update(doc(ownerDb, "projects", PROJECT, "fileDrafts", "f1"), { status: "rejected", reviewNote: "x", reviewedByUid: "owner", reviewerName: "x", path: "src/otro.ts" });
    batch.set(...fileEvent(ownerDb, "f1", "rejected", { kind: "updated", revision: 2, changes: { review: "rejected", ref: "main" }, actorUid: "owner" }));
    await assertFails(batch.commit());
    await assertSucceeds(reject(owner(), "owner", "f1"));
    assert.equal((await getDoc(doc(requester(), "projects", PROJECT, "fileDrafts", "f1"))).data().reviewNote, "Falta la licencia");
    await assertFails(reject(owner(), "owner", "f1"));
    await assertFails(updateDoc(doc(owner(), "projects", PROJECT, "fileDraftContents", "f1"), { content: "otro" }));
  });

  test("members review when the branch policy allows it", async () => {
    await addMember("req", "req@team.test");
    await propose(owner(), "owner", "f1");
    await assertFails(close(requester(), "req", "f1", "approved"));
    await updateDoc(doc(owner(), "projects", PROJECT), { githubPolicy: { branchWrite: "members" } });
    await assertSucceeds(close(requester(), "req", "f1", "approved"));
    const event = await getDoc(doc(owner(), "projects", PROJECT, "events", "file-f1-done"));
    assert.deepEqual(event.data().changes, { review: "approved", ref: "main" });
  });

  test("the author discards; others cannot; approving needs the draft pending", async () => {
    await addMember("req", "req@team.test");
    await propose(requester(), "req", "f1");
    await assertFails(close(other(), "other", "f1", "discarded"));
    await assertFails(close(owner(), "owner", "f1", "discarded"));
    await assertSucceeds(close(requester(), "req", "f1", "discarded"));
    await propose(requester(), "req", "f2");
    await reject(owner(), "owner", "f2");
    await assertFails(close(owner(), "owner", "f2", "approved"));
    await assertFails(close(requester(), "req", "f2", "discarded", 2));
    await assertSucceeds(close(requester(), "req", "f2", "discarded", 3));
    // Content left behind on its own is refused.
    await propose(requester(), "req", "f3");
    const ownerDb = owner();
    const batch = writeBatch(ownerDb);
    batch.delete(doc(ownerDb, "projects", PROJECT, "fileDrafts", "f3"));
    batch.set(...fileEvent(ownerDb, "f3", "done", { kind: "deleted", revision: 2, changes: { review: "approved", ref: "main" }, actorUid: "owner" }));
    await assertFails(batch.commit());
  });
});
