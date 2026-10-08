import { readFileSync } from "node:fs";
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, writeBatch, orderBy, documentId, limit, startAfter, runTransaction } from "firebase/firestore";
import { SparkRewards, coverage } from "../src/features/streaks/sparkRewards.ts";
import { SparkSocial } from "../src/features/streaks/sparkSocial.ts";
import { DAY_MS, dayOf, initialProtection } from "../src/features/streaks/streakModel.ts";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith("demo-")) throw new Error("These tests require a demo Firestore emulator.");
const emulatorUrl = new URL(`http://${process.env.FIRESTORE_EMULATOR_HOST}`);
let env;
const today = () => dayOf(Date.now());
const context = (uid) => env.authenticatedContext(uid, { email: uid + "@test.invalid", name: uid, email_verified: true }).firestore();
const rewards = (uid) => new SparkRewards(context(uid), uid);
const social = (uid) => new SparkSocial(rewards(uid), { uid, name: uid, photoURL: "" });
async function seed(path, data) { await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), path), data)); }
async function stored(path) { let result; await env.withSecurityRulesDisabled(async (c) => { result = (await getDoc(doc(c.firestore(), path))).data(); }); return result; }
async function wallet(uid, balance = 40) { await seed(`users/${uid}/progress/wallet`, { balance, earned: balance, spent: 0, lastAward: "seed", lastPurchase: "", updatedAt: Timestamp.now() }); }
async function proof(uid, id, options = {}) {
  const day = options.day ?? today();
  await seed(`projects/${options.projectId ?? "project"}/events/` + id, { id, projectId: "project", actorUid: uid, kind: "created", targetType: "task", targetTitle: id,
    changes: {}, createdAt: Timestamp.fromMillis(day * DAY_MS + Math.min(3600000, Date.now() % DAY_MS)), ...options,
  });
  return id;
}
async function active(uid, day) { await seed(`users/${uid}/activeDays/${day}`, { day, recordedAt: Timestamp.fromMillis(day * DAY_MS + 1000) }); }
async function prepared(uid, options = {}) {
  const d = today();
  await seed(`users/${uid}/streak/state`, { ...initialProtection(d), ...options });
}
async function connect(a, b) {
  const left = social(a), right = social(b), invite = await left.sendFriendRequest((await right.getFriendCode()).code, crypto.randomUUID());
  await right.decideInvite(invite.id, "accept");
  const streak = await left.requestStreak(invite.id, crypto.randomUUID());
  await right.decideInvite(streak.id, "accept");
  return { left, right, id: streak.id, friendshipId: invite.id };
}
async function mergeAccounts(ownerUid, otherUid, mergeId = "f".repeat(48), profileUid = ownerUid) {
  const owner = context(ownerUid), other = context(otherUid), memberUids = [ownerUid, otherUid].sort();
  await setDoc(doc(owner, "accountMerges", mergeId), { version: 1, status: "pending", requestedByUid: ownerUid,
    memberUids, profileUid, profileName: ownerUid, profileEmail: `${ownerUid}@test.invalid`, profilePhotoURL: "", otherName: otherUid, createdAt: serverTimestamp() });
  await assertSucceeds(setDoc(doc(other, "accountMergeMembers", otherUid), { mergeId, createdAt: serverTimestamp() }));
  const batch = writeBatch(owner);
  batch.set(doc(owner, "accountMergeMembers", ownerUid), { mergeId, createdAt: serverTimestamp() });
  batch.update(doc(owner, "accountMerges", mergeId), { status: "active", activatedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  return { owner, other, mergeId, memberUids };
}
before(async () => { env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT,
  firestore: { host: emulatorUrl.hostname, port: Number(emulatorUrl.port || 8080), rules: readFileSync("firestore.rules", "utf8") } }); });
beforeEach(async () => env.clearFirestore());
after(async () => env?.cleanup());

test("legacy accepted pairs migrate once without changing their streak or capacity", async () => {
  const id = "e".repeat(48), d = today();
  for (const uid of ["ana", "bob"]) {
    await social(uid).initialize();
    await seed(`streakSocial/${uid}`, { activeCount: 1, pendingCount: 0, lastPair: id, lastInvite: "" });
  }
  const pair = { memberUids: ["ana", "bob"], people: { ana: { uid: "ana", name: "ana", photoURL: "" }, bob: { uid: "bob", name: "bob", photoURL: "" } },
    status: "active", muted: [], since: d - 4, createdAt: Timestamp.now(), token: id };
  await seed(`streakPairs/${id}`, pair);
  // Old v2 invitations exist in production, but the migration must also cope with older retained pairs without their invite.
  await social("ana").initialize(); await social("bob").initialize(); await social("ana").initialize();
  assert.deepEqual(await stored(`streakPairs/${id}`), { ...pair, friendshipId: id });
  assert.equal((await stored("streakSocial/ana")).activeCount, 1);
  assert.equal((await stored(`streakFriendships/${id}`)).pairId, id);
  await assertFails(updateDoc(doc(context("eve"), "streakFriendships", id), { status: "ended" }));
});

test("closing and reactivating a shared streak keeps the friendship and starts a fresh period", async () => {
  const { left, right, id, friendshipId } = await connect("ana", "bob");
  for (const member of [left, right]) { await proof(member.uid, member.uid + "-today"); await member.rewards.recordEvent("project", member.uid + "-today"); }
  await left.manageFriend(id, "end");
  const historical = await stored(`streakPairs/${id}`);
  assert.equal(historical.best, 1); assert.equal(historical.closedCurrent, 1);
  assert.equal((await left.friends())[0].best, 1);
  const next = await right.requestStreak(friendshipId, "again");
  await left.decideInvite(next.id, "accept");
  assert.notEqual(next.id, id); assert.equal((await stored(`streakPairs/${next.id}`)).since, today());
  assert.equal((await stored(`streakPairs/${id}`)).status, "ended");
  await right.removeFriend(friendshipId);
  assert.equal((await left.friends()).length, 0);
  assert.equal((await stored(`streakPairs/${next.id}`)).status, "ended");
  assert.equal((await stored("streakSocial/ana")).activeCount, 0);
});

test("more than twenty friends paginate without loss or duplicates", async () => {
  const a = social("ana");
  for (let i = 0; i < 23; i++) {
    const b = social("peer" + i), request = await a.sendFriendRequest((await b.getFriendCode()).code, "friend" + i);
    await b.decideInvite(request.id, "accept");
  }
  const first = await a.friendPage(), second = await a.friendPage(first.next);
  assert.equal(first.items.length, 20); assert.equal(second.items.length, 3); assert.equal(second.next, null);
  assert.equal(new Set([...first.items, ...second.items].map((friend) => friend.friendshipId)).size, 23);
  assert.equal((await a.activeStreaks()).length, 0);
});

test("account fusion requires two authenticated approvals and grants only the chosen pair union access", async () => {
  const id = "a".repeat(48), owner = context("ana"), other = context("bob"), outsider = context("eve");
  await seed("users/ana/preferences/main", { motion: "full" });
  await seed("projects/merge-project", { id: "merge-project", name: "Ana project", ownerUid: "ana" });
  await seed("projects/merge-project/members/ana", { uid: "ana", role: "owner", status: "active" });
  await assertSucceeds(setDoc(doc(owner, "accountMerges", id), { version: 1, status: "pending", requestedByUid: "ana",
    memberUids: ["ana", "bob"], profileUid: "ana", profileName: "ana", profileEmail: "ana@test.invalid", profilePhotoURL: "", otherName: "bob", createdAt: serverTimestamp() }));
  await assertFails(getDoc(doc(other, "users", "ana", "preferences", "main")));
  await assertFails(setDoc(doc(owner, "accountMergeMembers", "bob"), { mergeId: id, createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(other, "accountMergeMembers", "bob"), { mergeId: id, createdAt: serverTimestamp() }));
  await assertFails(getDoc(doc(other, "users", "ana", "preferences", "main")));
  const batch = writeBatch(owner);
  batch.set(doc(owner, "accountMergeMembers", "ana"), { mergeId: id, createdAt: serverTimestamp() });
  batch.update(doc(owner, "accountMerges", id), { status: "active", activatedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(other, "accountMerges", id))).get("profileUid"), "ana");
  assert.equal((await getDoc(doc(other, "users", "ana", "preferences", "main"))).get("motion"), "full");
  assert.equal((await getDoc(doc(other, "projects", "merge-project"))).get("ownerUid"), "ana");
  await assertFails(getDoc(doc(outsider, "users", "ana", "preferences", "main")));
  await assertFails(getDocs(collection(outsider, "accountMergeMembers")));
});

test("account fusion cannot activate until the combined active streak count is at most five", async () => {
  const id = "9".repeat(48), owner = context("ana"), other = context("bob"), memberUids = ["ana", "bob"];
  await seed("streakSocial/ana", { activeCount: 3, pendingCount: 0, streakPendingCount: 0, lastPair: "", lastInvite: "" });
  await seed("streakSocial/bob", { activeCount: 3, pendingCount: 0, streakPendingCount: 0, lastPair: "", lastInvite: "" });
  await assertSucceeds(setDoc(doc(owner, "accountMerges", id), { version: 1, status: "pending", requestedByUid: "ana",
    memberUids, profileUid: "ana", profileName: "ana", profileEmail: "ana@test.invalid", profilePhotoURL: "", otherName: "bob", createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(other, "accountMergeMembers", "bob"), { mergeId: id, createdAt: serverTimestamp() }));
  const activate = () => {
    const batch = writeBatch(owner);
    batch.set(doc(owner, "accountMergeMembers", "ana"), { mergeId: id, createdAt: serverTimestamp() });
    batch.update(doc(owner, "accountMerges", id), { status: "active", activatedAt: serverTimestamp() });
    return batch.commit();
  };
  await assertFails(activate());
  assert.equal((await stored(`accountMerges/${id}`)).status, "pending");
  await seed("streakSocial/bob", { activeCount: 2, pendingCount: 0, streakPendingCount: 0, lastPair: "", lastInvite: "" });
  await assertSucceeds(activate());
});

test("merged wallets import both balances once and merged inventories stay unique", async () => {
  const { owner, other, mergeId } = await mergeAccounts("ana", "bob", "b".repeat(48));
  await seed("users/ana/progress/wallet", { balance: 7, earned: 9, spent: 2, lastAward: "a", lastPurchase: "", updatedAt: Timestamp.now() });
  await seed("users/bob/progress/wallet", { balance: 2, earned: 5, spent: 3, lastAward: "b", lastPurchase: "", updatedAt: Timestamp.now() });
  await seed("users/bob/inventory/farolero", { itemId: "farolero", price: 0, acquiredAt: Timestamp.now() });
  const batch = writeBatch(owner);
  batch.set(doc(owner, "users", "ana", "progress", "wallet"), { balance: 9, earned: 14, spent: 5, lastAward: "a", lastPurchase: "", updatedAt: serverTimestamp() });
  batch.set(doc(owner, "accountMerges", mergeId, "imports", "wallet"), { earned: 14, spent: 5, importedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  assert.equal((await stored("users/ana/progress/wallet")).balance, 9);
  await assertFails(setDoc(doc(owner, "accountMerges", mergeId, "imports", "wallet"), { earned: 14, spent: 5, importedAt: serverTimestamp() }));
  const itemBatch = writeBatch(owner);
  itemBatch.set(doc(owner, "users", "ana", "inventory", "farolero"), { itemId: "farolero", price: 0, acquiredAt: serverTimestamp() });
  itemBatch.update(doc(owner, "users", "ana", "progress", "wallet"), { balance: 9, earned: 14, spent: 5, lastAward: "a", lastPurchase: "farolero", updatedAt: serverTimestamp() });
  await assertFails(itemBatch.commit());
  assert.equal((await getDoc(doc(other, "users", "bob", "inventory", "farolero"))).exists(), true);
});

test("a merged social profile reads friendships and active streaks from both Firebase identities", async () => {
  await connect("ana", "peer-a");
  await connect("bob", "peer-b");
  await mergeAccounts("ana", "bob", "c".repeat(48));
  const merged = new SparkSocial(new SparkRewards(context("ana"), "ana", ["ana", "bob"]), { uid: "ana", name: "ana", photoURL: "" });
  const page = await merged.friendPage();
  const activePairs = await merged.activeStreaks();
  assert.deepEqual(page.items.map((friend) => friend.name).sort(), ["peer-a", "peer-b"]);
  assert.equal(activePairs.length, 2);
});

test("the five-pair cap is shared across merged identities while friends remain uncapped", async () => {
  for (let i = 0; i < 3; i++) await connect("ana", `ana-peer-${i}`);
  for (let i = 0; i < 2; i++) await connect("bob", `bob-peer-${i}`);
  const third = social("ana"), friend = social("new-peer"), request = await third.sendFriendRequest((await friend.getFriendCode()).code, "merged-cap-friend");
  await friend.decideInvite(request.id, "accept");
  await mergeAccounts("ana", "bob", "d".repeat(48));
  const merged = new SparkSocial(new SparkRewards(context("ana"), "ana", ["ana", "bob"]), { uid: "ana", name: "ana", photoURL: "" });
  await assert.rejects(merged.requestStreak(request.id, "merged-cap-streak"), /cinco rachas/);
  assert.equal((await merged.friendPage()).items.length, 6);
  assert.equal((await merged.activeStreaks()).length, 5);
  assert.equal((await stored("streakSocial/ana")).activeCount + (await stored("streakSocial/bob")).activeCount, 5);
});

test("Spark credits real proofs, caps points at three and deduplicates across clients", async () => {
  const a = rewards("ana"), b = rewards("ana");
  await a.initialize(); await b.initialize();
  const ids = await Promise.all(Array.from({ length: 6 }, (_, i) => proof("ana", "task-" + i)));
  await Promise.all(ids.map((id, i) => (i % 2 ? a : b).credit("project", id)));
  await a.recordEvent("project", ids[0]);
  const value = await stored("users/ana/progress/wallet");
  assert.equal(value.balance, 3); assert.equal(value.earned, 3);
  assert.equal((await stored("users/ana/progress/summary")).activeDays, 1);
  assert.equal((await stored(`users/ana/pointDays/${today()}`)).points, 3);
  assert.equal((await a.summary()).state.current, 1);
});
test("no-op, assignment, other-user and old events cannot mint points; branches deduplicate by name", async () => {
  const a = rewards("ana"); await a.initialize();
  const specs = [
    { kind: "updated", changes: { status: { from: "Hecha", to: "Hecha" } } },
    { kind: "updated", changes: { assignee: { fromUid: "", toUid: "ana" } } },
    { day: today() - 1 },
  ];
  for (let i = 0; i < specs.length; i++) { await proof("ana", "invalid-" + i, specs[i]); await a.credit("project", "invalid-" + i); }
  assert.equal(await stored("users/ana/progress/wallet"), undefined);
  await proof("ana", "branch-1", { targetType: "branch", targetTitle: "Feature/One" });
  await proof("ana", "branch-2", { targetType: "branch", targetTitle: "feature/one" });
  await a.credit("project", "branch-1"); await a.credit("project", "branch-2");
  assert.equal((await stored("users/ana/progress/wallet")).balance, 1);
  await proof("bob", "foreign"); await assert.rejects(a.credit("project", "foreign"));
  await assertFails(setDoc(doc(a.db, "users/ana/pointDays/1"), { day: 1, points: 99 }));
});
test("branch receipts are recorded even at the daily cap", async () => {
  const a = rewards("ana"); await a.initialize();
  for (let i = 0; i < 3; i++) { await proof("ana", "task-" + i); await a.credit("project", "task-" + i); }
  await proof("ana", "branch-first", { targetType: "branch", targetTitle: "Feature/Limited" }); await a.credit("project", "branch-first");
  assert.ok(await stored("users/ana/workReceipts/project__branch~feature~limited"));
  assert.equal(await stored("users/ana/pointEvents/project__branch~feature~limited"), undefined);
});
test("purchases are atomic and idempotent; inventory cap and shield price are enforced", async () => {
  const a = rewards("ana"); await wallet("ana"); await a.initialize();
  await Promise.all([a.purchase("single", "same"), a.purchase("single", "same")]);
  assert.equal((await stored("users/ana/progress/wallet")).balance, 37);
  await a.purchase("single", "second");
  await assert.rejects(a.purchase("single", "third"), /dos protectores/);
  await a.purchase("shield", "shield");
  await assert.rejects(a.purchase("shield", "shield2"), /sigue activo/);
  await assert.rejects(a.purchase("shield", "same"), /otra compra/);
  const state = await stored("users/ana/streak/state");
  assert.equal(state.protectors, 2); assert.equal(state.shieldStart, today()); assert.equal(state.shieldEnd, today() + 6);
  assert.equal((await stored("users/ana/progress/wallet")).balance, 19);
  await assertFails(updateDoc(doc(a.db, "users/ana/streak/state"), { protectors: 99 }));
  await assertFails(setDoc(doc(a.db, "users/ana/protectionPurchases/forged"), { product: "shield", price: 0, day: today(), acquiredAt: serverTimestamp() }));
});
test("closed days consume once, prioritize a shield, never increase a protected streak, and skip long broken gaps", async () => {
  const d = today(); await prepared("ana", { managedFrom: d - 8, lastSettledDay: d - 5, protectors: 2, shieldStart: d - 4, shieldEnd: d - 3 });
  await active("ana", d - 5);
  await seed("users/ana/progress/summary", { activeDays: 1, lastRecordedDay: d - 5, updatedAt: Timestamp.now() });
  const a = rewards("ana"), value = await a.summary();
  assert.equal(value.state.current, 1); assert.equal(value.activeDays, 1); assert.equal(value.state.protectors, 0);
  assert.equal(value.calendar.filter((day) => day.kind === "protected").length, 4);
  assert.equal((await stored(`users/ana/protectedDays/${d - 4}`)).source, "shield");
  assert.equal((await stored(`users/ana/protectedDays/${d - 2}`)).source, "single");
  await a.summary(); assert.equal((await stored("users/ana/streak/state")).protectors, 0);
  await prepared("bob", { managedFrom: d - 1000, lastSettledDay: d - 1000 });
  assert.equal((await rewards("bob").summary()).state.current, 0);
  assert.equal((await stored("users/bob/streak/state")).lastSettledDay, d - 1);
});
test("confirmed work queued before midnight is credited before protection is consumed", async () => {
  const d = today(); await prepared("ana", { managedFrom: d - 2, lastSettledDay: d - 2, protectors: 1 });
  await active("ana", d - 2);
  await seed("users/ana/progress/summary", { activeDays: 1, lastRecordedDay: d - 2, updatedAt: Timestamp.now() });
  await proof("ana", "late", { day: d - 1 });
  const result = await rewards("ana").summary();
  assert.equal(result.state.protectors, 1); assert.equal(result.state.current, 2);
  assert.equal((await stored("users/ana/progress/wallet")).balance, 1);
  assert.equal(await stored(`users/ana/protectedDays/${d - 1}`), undefined);
});
const created = (uid, projectId, options = {}) => proof(uid, "project-" + projectId,
  { projectId, targetType: "project", targetId: projectId, targetTitle: projectId, revision: 1, ...options });
/** The same writes as a task credit, including one point: accepted for tasks, refused for a created project. */
async function creditWithPoint(a, projectId, eventId) {
  const event = (await getDoc(doc(a.db, "projects", projectId, "events", eventId))).data();
  const d = dayOf(event.createdAt.toMillis()), key = `${projectId}__${eventId}`, state = await stored(`users/${a.uid}/streak/state`);
  return runTransaction(a.db, async (tx) => {
    tx.set(a.ref(`workReceipts/${key}`), { projectId, eventId, day: d });
    tx.set(a.ref(`activeDays/${d}`), { day: d, projectId, eventId, recordedAt: event.createdAt, key });
    tx.set(a.ref("progress/summary"), { activeDays: 1, lastRecordedDay: d, lastCreditDay: d, updatedAt: serverTimestamp() });
    tx.set(a.visibleRef(d), { day: d, kind: "active" });
    tx.set(a.presenceRef(), coverage(state, d, true, true));
    tx.set(a.ref(`pointEvents/${key}`), { projectId, eventId, day: d, recordedAt: serverTimestamp() });
    tx.set(a.ref(`pointDays/${d}`), { day: d, points: 1, lastAward: key, updatedAt: serverTimestamp() });
    tx.set(a.ref("progress/wallet"), { balance: 1, earned: 1, spent: 0, lastAward: key, lastPurchase: "", updatedAt: serverTimestamp() });
  });
}
test("a created project activates the day, calendar, presence and celebration without points", async () => {
  const a = rewards("ana");
  await created("ana", "alpha"); await a.recordEvent("alpha", "project-alpha");
  await a.recordEvent("alpha", "project-alpha"); // A retry changes nothing.
  const d = today(), value = await a.summary();
  assert.equal(value.state.current, 1); assert.equal(value.activeDays, 1);
  assert.deepEqual(value.calendar.map((entry) => [entry.day, entry.kind, entry.points]), [[d, "active", 0]]);
  assert.equal((await stored(`streakPresence/ana/days/${d}`)).kind, "active");
  assert.equal((await stored("streakPresence/ana")).from, d + 1);
  assert.ok(await stored("users/ana/workReceipts/alpha__project-alpha"));
  for (const path of ["progress/wallet", `pointDays/${d}`, "pointEvents/alpha__project-alpha"]) assert.equal(await stored(`users/ana/${path}`), undefined);
  assert.ok(await a.claimCelebration());
});
test("a created project cannot be paid through a forged credit, and does not use the daily point cap", async () => {
  const bob = rewards("bob"); await bob.initialize();
  await proof("bob", "task-control"); await assertSucceeds(creditWithPoint(bob, "project", "task-control"));
  const a = rewards("ana"); await a.initialize();
  await created("ana", "alpha"); await assertFails(creditWithPoint(a, "alpha", "project-alpha"));
  await a.credit("alpha", "project-alpha");
  await assertFails(setDoc(a.ref("pointEvents/alpha__project-alpha"), { projectId: "alpha", eventId: "project-alpha", day: today(), recordedAt: serverTimestamp() }));
  for (let i = 0; i < 4; i++) { await proof("ana", "task-" + i); await a.credit("project", "task-" + i); }
  assert.equal((await stored("users/ana/progress/wallet")).balance, 3);
  assert.equal((await stored("users/ana/progress/summary")).activeDays, 1);
});
test("several projects in one day count once; the next day continues the streak", async () => {
  const d = today(); await prepared("ana", { managedFrom: d - 1, lastSettledDay: d - 2 });
  await created("ana", "one", { day: d - 1 }); await created("ana", "two", { day: d - 1 });
  await created("ana", "three");
  const value = await rewards("ana").summary();
  assert.equal(value.activeDays, 2); assert.equal(value.state.current, 2);
  assert.deepEqual(value.calendar.map((entry) => entry.day), [d - 1, d]);
  assert.equal(await stored("users/ana/progress/wallet"), undefined);
});
test("a pending project credit is recovered on the confirmed creation day, even after midnight", async () => {
  const d = today(); await prepared("ana", { managedFrom: d - 2, lastSettledDay: d - 2, protectors: 1 });
  await active("ana", d - 2);
  await seed("users/ana/progress/summary", { activeDays: 1, lastRecordedDay: d - 2, updatedAt: Timestamp.now() });
  await created("ana", "late", { day: d - 1 });
  const result = await rewards("ana").summary();
  assert.equal(result.state.current, 2); assert.equal(result.state.protectors, 1);
  assert.equal((await stored(`users/ana/activeDays/${d - 1}`)).eventId, "project-late");
  assert.equal(await stored(`users/ana/protectedDays/${d - 1}`), undefined);
  await created("bob", "foreign"); await assert.rejects(rewards("ana").credit("foreign", "project-foreign"));
});
test("migration preserves balance, legacy history and equipment without retroactive awards", async () => {
  await wallet("ana", 25); await active("ana", today() - 1);
  await seed("users/ana/inventory/valle-nevado", { itemId: "valle-nevado", price: 10, acquiredAt: Timestamp.now() });
  await proof("ana", "old", { day: today() - 10 });
  const a = rewards("ana"); await a.initialize(); await a.credit("project", "old");
  const result = await a.summary();
  assert.equal(result.state.current, 1); assert.equal(result.state.protectors, 0);
  assert.equal((await stored("users/ana/progress/wallet")).balance, 25);
  assert.ok(await stored("users/ana/inventory/valle-nevado"));
});
test("celebration is claimed once across devices and only after actual activity", async () => {
  const a = rewards("ana"), b = rewards("ana");
  assert.equal(await a.claimCelebration(), null);
  await proof("ana", "today"); await a.recordEvent("project", "today");
  const results = await Promise.all([a.claimCelebration(), b.claimCelebration()]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await a.claimCelebration(), null);
});
test("friendships are uncapped and do not grant presence access or start a streak", async () => {
  const ana = social("ana");
  const bob = social("bob"), code = (await bob.getFriendCode()).code;
  const invite = await ana.sendFriendRequest(code, "request");
  assert.equal((await ana.sendFriendRequest(code, "request")).id, invite.id);
  assert.equal((await ana.friends()).length, 0);
  await bob.decideInvite(invite.id, "accept");
  assert.equal((await ana.friends()).length, 1);
  assert.equal((await bob.friends())[0].name, "ana");
  await assertFails(getDoc(doc(bob.db, "users/ana/progress/wallet")));
  await assertFails(getDocs(collection(bob.db, "users/ana/activeDays")));
  await assertFails(getDoc(doc(context("other"), "streakPresence", "ana")));
  await assertFails(getDocs(collection(bob.db, "streakInvites")));
  await assertFails(getDoc(doc(bob.db, "streakPresence", "ana")));
  for (let i = 0; i < 6; i++) { const friend = social("friend" + i), next = await ana.sendFriendRequest((await friend.getFriendCode()).code, "invite-" + i); await friend.decideInvite(next.id, "accept"); }
  assert.equal((await ana.friends()).length, 7);
  assert.equal((await stored("streakSocial/ana")).activeCount, 0);
  const streak = await ana.requestStreak(invite.id, "streak");
  await bob.decideInvite(streak.id, "accept");
  assert.equal((await stored("streakSocial/ana")).activeCount, 1);
  await assertSucceeds(getDoc(doc(bob.db, "streakPresence", "ana")));
});
test("nudges are one per pair/day, respect mute, and ending revokes access", async () => {
  const { left, right, id } = await connect("ana", "bob");
  await right.manageFriend(id, "mute");
  await assert.rejects(left.manageFriend(id, "nudge"), /silenciado/);
  await right.manageFriend(id, "unmute");
  await Promise.all([left.manageFriend(id, "nudge"), left.manageFriend(id, "nudge")]);
  await assert.rejects(right.manageFriend(id, "nudge"), /toque hoy/);
  const nid = id + "_" + today();
  assert.equal((await stored("users/bob/streakNudges/" + nid)).name, "ana");
  await right.readNudge(nid); assert.equal((await stored("users/bob/streakNudges/" + nid)).read, true);
  await assertFails(updateDoc(doc(right.db, "users/bob/streakNudges/" + nid), { name: "forged", read: true }));
  await right.manageFriend(id, "end");
  assert.equal((await left.friends()).length, 1); assert.equal((await left.friends())[0].streakActive, false);
  assert.equal((await stored("streakSocial/ana")).activeCount, 0);
  await assertFails(getDoc(doc(right.db, "streakPresence", "ana")));
});
test("nudges carry a preset phrase; only the recipient marks them seen and replies, once", async () => {
  const { left, right, id } = await connect("ana", "bob");
  const receipt = `streakPairs/${id}/nudges/${today()}`, nid = id + "_" + today();
  await assert.rejects(left.manageFriend(id, "nudge", "free text"), /frases disponibles/);
  await left.manageFriend(id, "nudge", "our_streak");
  assert.equal((await stored(receipt)).message, "our_streak");
  assert.equal((await stored("users/bob/streakNudges/" + nid)).message, "our_streak");
  assert.deepEqual((await left.friends())[0].nudge, { fromMe: true, message: "our_streak", seen: false, reply: null });
  // The sender cannot mark their own nudge as seen or answer it; outsiders cannot touch it.
  await assertFails(updateDoc(doc(left.db, receipt), { seenAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(social("eve").db, receipt), { reply: "thanks" }));
  // Forged replies and fields are rejected even for the recipient.
  await assertFails(updateDoc(doc(right.db, receipt), { reply: "anything" }));
  await assertFails(updateDoc(doc(right.db, receipt), { message: "team" }));
  await right.readNudge(nid);
  assert.ok((await stored(receipt)).seenAt);
  await right.replyNudge(nid, "on_it");
  await right.replyNudge(nid, "on_it"); // idempotent
  await assert.rejects(right.replyNudge(nid, "later"), /Ya respondiste/);
  assert.equal((await stored(receipt)).reply, "on_it");
  assert.deepEqual((await left.friends())[0].nudge, { fromMe: true, message: "our_streak", seen: true, reply: "on_it" });
  assert.deepEqual((await right.friends())[0].nudge, { fromMe: false, message: "our_streak", seen: true, reply: "on_it" });
});
test("shared days use actual activity and coverage forecasts without exposing inventory", async () => {
  const { left, right, id } = await connect("ana", "bob");
  for (const s of [left, right]) { await proof(s.uid, s.uid + "-work"); await s.rewards.recordEvent("project", s.uid + "-work"); }
  assert.equal((await left.friends())[0].current, 1);
  await wallet("ana", 20); await left.rewards.purchase("shield", "shield");
  const p = await stored("streakPresence/ana");
  assert.deepEqual(Object.keys(p).sort(), ["asOf", "from", "through"]);
  assert.equal(p.from, today() + 1); assert.equal(p.through, today() + 6);
  assert.equal((await stored("users/ana/progress/wallet")).balance, 5);
  await assertFails(setDoc(doc(right.db, "streakPresence", "ana"), { asOf: today(), from: today(), through: today() + 100 }));
  await assertFails(updateDoc(doc(right.db, "streakPairs", id), { current: 999 }));
});
test("counter, identity, schema, price, timestamp and replay attacks are rejected", async () => {
  const a = rewards("ana"); await a.initialize(); await wallet("ana", 10);
  for (const patch of [{ protectors: -1 }, { shieldEnd: today() + 999 }, { current: 999 }, { managedFrom: 1 }, { extra: true }])
    await assertFails(updateDoc(doc(a.db, "users/ana/streak/state"), patch));
  await assertFails(setDoc(doc(a.db, "users/ana/activeDays/" + today()), { day: today(), projectId: "project", eventId: "missing", key: "fake", recordedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(a.db, "users/ana/progress/wallet"), { balance: 20, earned: 20, updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(a.db, "users/ana/streak/state")));
  const s = social("ana"); await s.initialize();
  await assertFails(updateDoc(s.index(), { activeCount: 5 }));
  await assertFails(setDoc(doc(a.db, "streakInvites", "f".repeat(48)), { ownerUid: "ana", person: { uid: "ana", name: "bob", photoURL: "" },
    status: "pending", recipientUid: "", createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 7 * DAY_MS) }));
  const unauth = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(unauth, "users/ana/streak/state")));
  await assertFails(getDocs(collection(unauth, "streakPairs")));
});
test("coverage math counts remaining shield dates before individual protectors", () => {
  const state = { ...initialProtection(50), protectors: 2, shieldStart: 50, shieldEnd: 56 };
  assert.deepEqual(coverage(state, 50, false, true), { asOf: 50, from: 50, through: 58 });
  assert.deepEqual(coverage(state, 50, true, true), { asOf: 50, from: 51, through: 58 });
  assert.deepEqual(coverage(state, 50, false, false), { asOf: 50, from: 50, through: 49 });
});

test("one personal protector covers every pair: active/protected, both protected and uncovered absence", async () => {
  const ab = await connect("ana", "bob"), ac = await connect("ana", "carla"), ad = await connect("ana", "david");
  const d = today();
  for (const id of [ab.id, ac.id, ad.id]) await seed("streakPairs/" + id, { ...await stored("streakPairs/" + id), since: d - 2 });
  for (const [uid, stock] of [["ana", 1], ["bob", 0], ["carla", 0], ["david", 1]]) {
    await prepared(uid, { managedFrom: d - 2, lastSettledDay: d - 2, protectors: stock });
    await active(uid, d - 2);
    if (uid === "bob") await active(uid, d - 1);
    await seed(`users/${uid}/progress/summary`, { activeDays: uid === "bob" ? 2 : 1, lastRecordedDay: uid === "bob" ? d - 1 : d - 2, updatedAt: Timestamp.now() });
    await social(uid).friends();
  }
  const pairs = await social("ana").friends();
  assert.equal(pairs.find((pair) => pair.id === ab.id).current, 1);
  assert.equal(pairs.find((pair) => pair.id === ad.id).current, 1);
  assert.equal(pairs.find((pair) => pair.id === ac.id).current, 0);
  assert.equal((await stored("users/ana/streak/state")).protectors, 0);
  const days = await getDocs(collection(context("ana"), "users/ana/protectedDays"));
  assert.equal(days.size, 1);
  assert.equal(await stored("users/ana/progress/wallet"), undefined);
});

test("pending invitations are bounded, can be rejected/cancelled, and cannot be accepted twice", async () => {
  const a = social("ana"), b = social("bob");
  const invites = [];
  for (let i = 0; i < 5; i++) invites.push(await a.sendFriendRequest((await social(i === 0 ? "bob" : "peer" + i).getFriendCode()).code, "pending-" + i));
  await assert.rejects(a.sendFriendRequest((await social("sixth").getFriendCode()).code, "pending-six"), /cinco/);
  await b.decideInvite(invites[0].id, "reject");
  await a.decideInvite(invites[1].id, "cancel");
  await assert.rejects(social("peer1").decideInvite(invites[1].id, "accept"), /no está disponible/);
  const next = await a.sendFriendRequest((await b.getFriendCode()).code, "new");
  await Promise.all([b.decideInvite(next.id, "accept"), b.decideInvite(next.id, "accept")]);
  assert.equal((await stored("streakSocial/ana")).activeCount, 0);
  assert.equal((await stored("streakSocial/bob")).activeCount, 0);
  assert.equal((await a.friends()).length, 1);
});

test("unvalidated timestamps, private history queries, forged day states and profile takeover are denied", async () => {
  const { left, right, id } = await connect("ana", "bob"), d = today();
  await assertFails(getDocs(collection(right.db, "streakPresence/ana/days")));
  await assertFails(getDoc(doc(right.db, "streakPresence/ana/days/" + (d - 1))));
  await assertFails(setDoc(doc(left.db, "streakPresence/ana/days/" + d), { day: d, kind: "active" }));
  await assertFails(setDoc(doc(left.db, "streakPresence/ana/days/" + (d + 1)), { day: d + 1, kind: "protected" }));
  await assertFails(setDoc(doc(left.db, "users/ana/streakClock/time"), { at: Timestamp.fromMillis(0) }));
  await assertFails(setDoc(doc(left.db, "streakPresence/ana"), { asOf: d, from: d, through: d + 99, wallet: 10 }));
  await assertFails(updateDoc(left.pair(id), { "people.bob.name": "Impostor" }));
  await assertFails(updateDoc(left.pair(id), { muted: ["bob"] }));
  await assertFails(updateDoc(left.pair(id), { since: 0 }));
  await assertFails(setDoc(doc(left.db, "users/ana/streakCelebrations/" + d), { day: d, claimedAt: serverTimestamp() }));
});

test("a fresh session recovers confirmed work from the current day without relying on local storage", async () => {
  const a = rewards("ana"); await a.initialize();
  await proof("ana", "saved-before-close");
  const b = rewards("ana"), value = await b.summary();
  assert.equal(value.state.current, 1);
  assert.equal((await stored("users/ana/progress/wallet")).balance, 1);
  await b.summary();
  assert.equal((await stored("users/ana/progress/wallet")).balance, 1);
});

test("friend codes persist across devices, recover collisions and expose only public identity", async () => {
  const a = social("ana"), otherSession = social("ana");
  const [one, two] = await Promise.all([a.getFriendCode(), otherSession.getFriendCode()]);
  assert.equal(one.code, two.code);
  const bob = social("bob"), canonical = one.code.replaceAll("-", "").slice(2);
  assert.deepEqual(await bob.lookupFriendCode(one.code.toLowerCase()), one);
  assert.deepEqual(Object.keys(await stored("streakFriendCodes/" + canonical)).sort(), ["name", "photoURL", "uid"]);
  await assert.rejects(a.lookupFriendCode(one.code), /propio código/);
  await assert.rejects(bob.lookupFriendCode("INVALID!"), /válido/);
  await assert.rejects(bob.lookupFriendCode("ZZZZZZZZ"), /encontramos/);
  await seed("streakFriendCodes/22222222", { uid: "taken", name: "taken", photoURL: "" });
  let attempts = 0;
  const collision = new SparkSocial(rewards("carla"), { uid: "carla", name: "carla", photoURL: "" }, () => ++attempts === 1 ? "22222222" : "33333333");
  assert.equal((await collision.getFriendCode()).code, "CW-3333-3333");
  assert.equal(attempts, 2);
  await assertFails(getDocs(collection(bob.db, "streakFriendCodes")));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "streakFriendCodes", canonical)));
  await assertFails(getDoc(doc(bob.db, "users/ana/friendCode/current")));
  await assertFails(updateDoc(doc(a.db, "users/ana/friendCode/current"), { code: "44444444" }));
  await assertFails(setDoc(doc(a.db, "streakFriendCodes/44444444"), a.person));
  await assertFails(updateDoc(doc(bob.db, "streakFriendCodes", canonical), { name: "spoof" }));
  await assertFails(updateDoc(doc(a.db, "streakFriendCodes", canonical), { email: "leak@test.invalid" }));
  await assertFails(deleteDoc(doc(a.db, "streakFriendCodes", canonical)));
});

test("crossed and duplicate requests reserve one pair without automatic acceptance", async () => {
  const a = social("ana"), b = social("bob");
  const ac = (await a.getFriendCode()).code, bc = (await b.getFriendCode()).code;
  const [one, two] = await Promise.all([a.sendFriendRequest(bc, "a"), b.sendFriendRequest(ac, "b")]);
  assert.equal(one.id, two.id);
  assert.equal([one.direction, two.direction].filter((d) => d === "outgoing").length, 1);
  const request = await stored("streakInvites/" + one.id);
  const sender = request.ownerUid === "ana" ? a : b, recipient = sender === a ? b : a;
  const targetCode = sender === a ? bc : ac;
  assert.equal((await sender.friends()).length, 0);
  assert.equal((await sender.sendFriendRequest(targetCode, "retry-other-id")).id, one.id);
  await assertFails(getDoc(doc(context("stranger"), "streakInvites", one.id)));
  await assertFails(updateDoc(doc(sender.db, "streakInvites", one.id), { recipientUid: "stranger" }));
  await assert.rejects(sender.decideInvite(one.id, "accept"), /No puedes/);
  await assert.rejects(recipient.decideInvite(one.id, "cancel"), /No puedes/);
  await assertFails(getDoc(doc(recipient.db, "streakPresence", sender.uid)));
  await recipient.decideInvite(one.id, "reject");
  const crossedRequestId = sender === a ? "b" : "a";
  const crossedCode = sender === a ? ac : bc;
  assert.deepEqual(await recipient.sendFriendRequest(crossedCode, crossedRequestId),
    { id: one.id, direction: "incoming" });
  assert.equal((await sender.sendFriendRequest(targetCode, "retry-other-id")).id, one.id);
  assert.equal((await stored("streakSocial/" + sender.uid)).pendingCount, 0);
  const fresh = await sender.sendFriendRequest(targetCode, "fresh");
  assert.notEqual(fresh.id, one.id);
  await recipient.decideInvite(fresh.id, "accept");
  await assert.rejects(sender.sendFriendRequest(targetCode, "already-active"), /ya está en tus amigos/);
});

test("expired requests release outgoing capacity and reservations without background jobs", async () => {
  const a = social("ana"), b = social("bob"), code = (await b.getFriendCode()).code;
  const request = await a.sendFriendRequest(code, "first");
  await seed("streakInvites/" + request.id, { ...await stored("streakInvites/" + request.id), createdAt: Timestamp.fromMillis(Date.now() - 8 * DAY_MS) });
  await assert.rejects(b.decideInvite(request.id, "accept"), /caducó/);
  assert.equal((await stored("streakInvites/" + request.id)).status, "expired");
  assert.equal((await stored("streakSocial/ana")).pendingCount, 0);
  const next = await a.sendFriendRequest(code, "next");
  assert.notEqual(next.id, request.id);
  await a.decideInvite(next.id, "cancel"); await a.decideInvite(next.id, "cancel");
  assert.equal((await stored("streakSocial/ana")).pendingCount, 0);
  await assert.rejects(a.sendFriendRequest((await social("carla").getFriendCode()).code, "next"), /otra solicitud/);
});

test("old links cannot be accepted and migration releases their slots while keeping existing pairs", async () => {
  const { left, id: pairId } = await connect("ana", "bob");
  const oldId = "a".repeat(48), old = { ownerUid: "ana", person: left.person, recipientUid: "", status: "pending",
    createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + DAY_MS) };
  await seed("streakInvites/" + oldId, old);
  await seed("streakSocial/ana", { ...await stored("streakSocial/ana"), pendingCount: 1, lastInvite: oldId });
  await assertFails(getDoc(doc(context("carla"), "streakInvites", oldId)));
  await assertFails(updateDoc(doc(context("carla"), "streakInvites", oldId), { status: "accepted", recipientUid: "carla", decidedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(left.db, "streakInvites", "b".repeat(48)), { ...old, createdAt: serverTimestamp() }));
  await left.getFriendCode(); await left.getFriendCode();
  assert.equal((await stored("streakSocial/ana")).pendingCount, 0);
  assert.equal((await stored("streakInvites/" + oldId)).status, "cancelled");
  assert.equal((await stored("streakPairs/" + pairId)).status, "active");
  assert.equal((await left.friends()).length, 1);
});

test("simultaneous acceptances cannot exceed five active pairs", async () => {
  for (let i = 0; i < 4; i++) await connect("ana", "peer" + i);
  const a = social("ana"), code = (await a.getFriendCode()).code;
  const b = social("bob"), c = social("carla");
  const first = await b.sendFriendRequest(code, "b"), second = await c.sendFriendRequest(code, "c");
  await a.decideInvite(first.id, "accept"); await a.decideInvite(second.id, "accept");
  const bs = await b.requestStreak(first.id, "bs"), cs = await c.requestStreak(second.id, "cs");
  const results = await Promise.allSettled([a.decideInvite(bs.id, "accept"), social("ana").decideInvite(cs.id, "accept")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await stored("streakSocial/ana")).activeCount, 5);
  assert.equal((await a.friends()).length, 6);
  assert.equal((await a.activeStreaks()).length, 5);
});

test("acceptance respects the sender's five-pair limit after sending", async () => {
  const a = social("ana"), b = social("bob");
  const friend = await a.sendFriendRequest((await b.getFriendCode()).code, "friend");
  await b.decideInvite(friend.id, "accept");
  const request = await a.requestStreak(friend.id, "before-capacity");
  for (let i = 0; i < 5; i++) await connect("ana", "peer" + i);
  await assert.rejects(b.decideInvite(request.id, "accept"), /cinco rachas/);
  assert.equal((await stored(`streakInvites/${request.id}`)).status, "pending");
  assert.equal((await stored("streakSocial/ana")).activeCount, 5);
});

test("request schema, locks, expiry, profiles and third-party counters cannot be forged", async () => {
  const a = social("ana"), b = social("bob"), code = (await b.getFriendCode()).code;
  const req = await a.sendFriendRequest(code, "valid");
  for (const patch of [{ person: { uid: "ana", name: "fake", photoURL: "" } }, { version: 1 }, { ownerUid: "bob" }, { expiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY_MS) }, { extra: true }])
    await assertFails(updateDoc(doc(a.db, "streakInvites", req.id), patch));
  await assertFails(updateDoc(doc(b.db, "streakSocial/ana"), { pendingCount: 0 }));
  await assertFails(setDoc(a.lock("ana", "bob"), { inviteId: "e".repeat(48) }));
  await assertFails(setDoc(doc(a.db, "streakFriendCodes/55555555"), b.person));
  await assertFails(updateDoc(doc(b.db, "streakInvites", req.id), { status: "expired", decidedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(a.db, "streakInvites", req.id)));
  const forgedId = "c".repeat(48), existing = await stored("streakInvites/" + req.id);
  const batch = writeBatch(a.db);
  batch.set(doc(a.db, "streakInvites", forgedId), { ...existing, createdAt: serverTimestamp() });
  batch.update(a.index(), { pendingCount: 2, lastInvite: forgedId });
  batch.set(a.lock("ana", "bob"), { inviteId: forgedId }); batch.set(a.lock("bob", "ana"), { inviteId: forgedId });
  await assertFails(batch.commit());
});

test("request inboxes paginate twenty items, including timestamp ties, without exposing other users", async () => {
  const a = social("ana"), b = social("bob"), code = (await b.getFriendCode()).code;
  const request = await a.sendFriendRequest(code, "original"), data = await stored("streakInvites/" + request.id);
  // Fixtures model old closed requests; production mutations remain rule-controlled.
  for (let i = 0; i < 24; i++) await seed("streakInvites/" + i.toString(16).padStart(48, "0"), { ...data, status: "rejected" });
  for (const [db, field, uid] of [[a.db, "ownerUid", "ana"], [b.db, "recipientUid", "bob"]]) {
    const base = [where(field, "==", uid), orderBy("createdAt", "desc"), orderBy(documentId(), "desc")];
    const first = await getDocs(query(collection(db, "streakInvites"), ...base, limit(20)));
    const second = await getDocs(query(collection(db, "streakInvites"), ...base, startAfter(first.docs.at(-1)), limit(20)));
    assert.equal(first.size, 20); assert.equal(second.size, 5);
    assert.equal(new Set([...first.docs, ...second.docs].map((entry) => entry.id)).size, 25);
  }
  await assertFails(getDocs(query(collection(context("stranger"), "streakInvites"), where("recipientUid", "==", "bob"), orderBy("createdAt", "desc"), limit(20))));
});
