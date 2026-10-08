import { deleteUser, getAdditionalUserInfo, GithubAuthProvider, GoogleAuthProvider, inMemoryPersistence, setPersistence, signInWithEmailAndPassword, signInWithPopup, signOut, type User } from "firebase/auth";
import { collection, doc, getDocFromServer, getDocs, increment, limit, query, runTransaction, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import { accountMergeAuth, auth, firebaseConfigured, getAccountMergeFirestore, getCoworkFirestore } from "../../lib/firebase";
import { dayOf, pairHistory, type CalendarDay } from "../streaks/streakModel";

export type MergeProvider = "google" | "github";
export interface MergedIdentity {
  mergeId: string;
  memberUids: string[];
  profileUid: string;
  name: string;
  email: string;
  photoURL: string;
}
export interface MergePairPreview { id: string; ownerUid: string; friendUid: string; name: string; photoURL: string; since: number }

const TEMPORARY_UID_KEY = "cowork.account-merge.temporary-uid";
let temporaryAccountUid = "";

function unavailable() {
  return Object.assign(new Error("La fusión de cuentas no está disponible."), { code: "cowork/merge-unavailable" });
}

function profile(user: User) {
  const email = user.email?.trim().toLowerCase() ?? "";
  return {
    name: user.displayName?.trim().slice(0, 100) || email.split("@")[0] || "Miembro de Cowork",
    email,
    photoURL: user.photoURL?.startsWith("https://") ? user.photoURL.slice(0, 1500) : "",
  };
}

function randomMergeId() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function rememberedTemporaryUid() {
  if (temporaryAccountUid) return temporaryAccountUid;
  try { return sessionStorage.getItem(TEMPORARY_UID_KEY) ?? ""; } catch { return ""; }
}

function rememberTemporaryUid(uid: string) {
  temporaryAccountUid = uid;
  try { sessionStorage.setItem(TEMPORARY_UID_KEY, uid); } catch { /* Keep the in-memory retry guard. */ }
}

function clearTemporaryUid() {
  temporaryAccountUid = "";
  try { sessionStorage.removeItem(TEMPORARY_UID_KEY); } catch { /* The in-memory guard is cleared. */ }
}

async function rejectTemporaryIdentity(user: User, isNewUser: boolean) {
  const pendingUid = rememberedTemporaryUid();
  if (pendingUid && pendingUid !== user.uid) {
    await signOut(accountMergeAuth!).catch(() => undefined);
    throw Object.assign(new Error("Hay un acceso temporal pendiente de retirar. Vuelve a elegir el proveedor usado en el intento anterior."), {
      code: "cowork/merge-cleanup-pending",
    });
  }
  if (!isNewUser && !pendingUid) return user;
  try {
    await deleteUser(user);
    clearTemporaryUid();
  } catch (error) {
    rememberTemporaryUid(user.uid);
    throw Object.assign(new Error("Firebase creó una cuenta nueva para ese método y no se pudo retirar. Vuelve a verificarla para reintentar la limpieza."), {
      code: "cowork/merge-new-account-cleanup-failed", cause: error,
    });
  }
  throw Object.assign(new Error("Ese método no corresponde a una cuenta existente de Cowork."), { code: "cowork/merge-new-account" });
}

export async function discardVerifiedAccount() {
  if (accountMergeAuth?.currentUser) await signOut(accountMergeAuth);
}

export async function verifyOtherAccount(provider: MergeProvider) {
  if (!accountMergeAuth || !firebaseConfigured) throw unavailable();
  await setPersistence(accountMergeAuth, inMemoryPersistence);
  await discardVerifiedAccount();
  const authProvider = provider === "google" ? new GoogleAuthProvider() : new GithubAuthProvider();
  if (provider === "github") {
    authProvider.addScope("read:user");
    authProvider.addScope("user:email");
  }
  const result = await signInWithPopup(accountMergeAuth, authProvider);
  // OAuth can create a Firebase user on first sign-in. Remove that empty
  // identity; if deletion fails, remember it and retry before any merge.
  return rejectTemporaryIdentity(result.user, !!getAdditionalUserInfo(result)?.isNewUser);
}

export async function verifyOtherAccountWithPassword(emailValue: string, password: string) {
  if (!accountMergeAuth || !firebaseConfigured) throw unavailable();
  const email = emailValue.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("Escribe el correo de la otra cuenta."), { code: "cowork/invalid-email" });
  }
  if (!password) throw Object.assign(new Error("Escribe la contraseña de la otra cuenta."), { code: "cowork/invalid-password" });
  await setPersistence(accountMergeAuth, inMemoryPersistence);
  await discardVerifiedAccount();
  return rejectTemporaryIdentity((await signInWithEmailAndPassword(accountMergeAuth, email, password)).user, false);
}

export async function previewAccountMerge(otherUid: string): Promise<MergePairPreview[]> {
  const current = auth?.currentUser;
  const [db, secondaryDb] = await Promise.all([getCoworkFirestore(), getAccountMergeFirestore()]);
  if (!current?.uid || !db || !secondaryDb || !otherUid || otherUid === current.uid) throw unavailable();
  const pairs = await Promise.all([
    getDocs(query(collection(db, "streakPairs"), where("memberUids", "array-contains", current.uid), where("status", "==", "active"), limit(10))),
    getDocs(query(collection(secondaryDb, "streakPairs"), where("memberUids", "array-contains", otherUid), where("status", "==", "active"), limit(10))),
  ]);
  return [...new Map(pairs.flatMap((page) => page.docs).map((entry) => [entry.id, entry])).values()]
    .filter((entry) => entry.get("status") === "active")
    .map((entry) => {
      const members = entry.get("memberUids") as string[], ownerUid = members.find((uid) => uid === current.uid || uid === otherUid) ?? "";
      const friendUid = members.find((uid) => uid !== current.uid && uid !== otherUid) ?? "";
      const person = friendUid ? entry.get("people")?.[friendUid] : null;
      return { id: entry.id, ownerUid, friendUid, name: person?.name ?? "Otra cuenta", photoURL: person?.photoURL ?? "", since: Number(entry.get("since") ?? 0) };
    }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

async function closeUnselectedPair(id: string, actorUid: string, database: NonNullable<Awaited<ReturnType<typeof getCoworkFirestore>>>) {
  const pairRef = doc(database, "streakPairs", id);
  const pairBefore = await getDocFromServer(pairRef);
  if (!pairBefore.exists() || pairBefore.get("status") !== "active") return;
  const pair = pairBefore.data(), members = pair.memberUids as string[], peer = members.find((uid) => uid !== actorUid);
  if (!peer || !members.includes(actorUid)) throw unavailable();
  const since = Number(pair.since), today = dayOf(Date.now());
  const readDays = async (uid: string): Promise<CalendarDay[]> => {
    const days = await getDocs(query(collection(database, "streakPresence", uid, "days"), where("day", ">=", since)));
    return days.docs.map((entry) => ({ day: Number(entry.get("day")), kind: entry.get("kind"), points: 0, firstAt: null } as CalendarDay));
  };
  const [left, right] = await Promise.all([readDays(actorUid), readDays(peer)]);
  const history = pairHistory(left, right, since, today), friendRef = doc(database, "streakFriendships", String(pair.friendshipId ?? id));
  await runTransaction(database, async (tx) => {
    const [current, friend, firstIndex, secondIndex] = await Promise.all([
      tx.get(pairRef), tx.get(friendRef), tx.get(doc(database, "streakSocial", members[0])), tx.get(doc(database, "streakSocial", members[1])),
    ]);
    if (!current.exists() || current.get("status") !== "active") return;
    const best = Math.max(Number(current.get("best") ?? 0), history.best);
    tx.update(pairRef, { status: "ended", best, closedCurrent: history.current, endedAt: serverTimestamp() });
    if (friend.exists()) tx.update(friendRef, { best: Math.max(Number(friend.get("best") ?? 0), best) });
    for (const [uid, index] of [[members[0], firstIndex], [members[1], secondIndex]] as const) {
      if (!index.exists() || Number(index.get("activeCount") ?? 0) < 1) throw unavailable();
      tx.update(doc(database, "streakSocial", uid), { activeCount: increment(-1), lastPair: id });
    }
  });
}

async function findPendingPair(otherUid: string, currentUid: string, secondaryDb: NonNullable<Awaited<ReturnType<typeof getAccountMergeFirestore>>>) {
  const member = await getDocFromServer(doc(secondaryDb, "accountMergeMembers", otherUid));
  if (!member.exists()) return null;
  const mergeId = String(member.get("mergeId") ?? "");
  if (!/^[a-f0-9]{48}$/.test(mergeId)) throw unavailable();
  const group = await getDocFromServer(doc(secondaryDb, "accountMerges", mergeId));
  if (!group.exists()) throw unavailable();
  const data = group.data();
  if (data.status !== "pending" || data.requestedByUid !== currentUid || !Array.isArray(data.memberUids)
    || !data.memberUids.includes(otherUid) || !data.memberUids.includes(currentUid)) {
    throw Object.assign(new Error("Una de estas cuentas ya participa en otra fusión."), { code: "cowork/merge-already-linked" });
  }
  return { mergeId, profileUid: String(data.profileUid ?? "") };
}

/**
 * Both identities must approve from their own Firebase Auth sessions. The
 * secondary app writes the second member record; the current session can then
 * atomically approve itself and activate the shared profile.
 */
export async function mergeVerifiedAccount(other: User, profileUid: string, retainedPairIds?: readonly string[], expectedPairIds?: readonly string[]): Promise<MergedIdentity> {
  const current = auth?.currentUser;
  const [db, secondaryDb] = await Promise.all([getCoworkFirestore(), getAccountMergeFirestore()]);
  if (!current?.uid || !db || !secondaryDb || !other.uid || other.uid === current.uid || !other.email) throw unavailable();
  if (!current.email) throw unavailable();
  const memberUids = [current.uid, other.uid].sort();
  if (profileUid !== current.uid && profileUid !== other.uid) throw unavailable();

  const currentMember = await getDocFromServer(doc(db, "accountMergeMembers", current.uid));
  if (currentMember.exists()) {
    throw Object.assign(new Error("Esta cuenta ya forma parte de otra fusión."), { code: "cowork/merge-already-linked" });
  }
  const existing = await findPendingPair(other.uid, current.uid, secondaryDb);
  const activePairs = await previewAccountMerge(other.uid), externalPairs = activePairs.filter((pair) => pair.friendUid);
  if (expectedPairIds) {
    const expected = [...new Set(expectedPairIds)].sort(), actual = activePairs.map((pair) => pair.id).sort();
    if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
      throw Object.assign(new Error("Las rachas activas cambiaron. Revisa cuáles conservar antes de fusionar."), { code: "cowork/merge-pairs-changed" });
    }
  }
  const retained = retainedPairIds ? [...new Set(retainedPairIds)] : externalPairs.map((pair) => pair.id);
  if (retained.length > 5 || externalPairs.length > 5 && retained.length !== 5
    || retained.some((id) => !externalPairs.some((pair) => pair.id === id))) {
    throw Object.assign(new Error("Las rachas activas cambiaron. Revisa cuáles conservar antes de fusionar."), { code: "cowork/merge-pairs-changed" });
  }
  const mergeId = existing?.mergeId ?? randomMergeId();
  if (existing && existing.profileUid !== profileUid) {
    throw Object.assign(new Error("La fusión pendiente usa otra cuenta como perfil principal. Reanúdala con esa misma elección."), { code: "cowork/merge-profile-mismatch" });
  }
  const groupRef = doc(db, "accountMerges", mergeId);
  if (!existing) {
    const primary = profile(profileUid === current.uid ? current : other);
    const otherProfile = profile(profileUid === current.uid ? other : current);
    await setDoc(groupRef, {
      version: 1,
      status: "pending",
      requestedByUid: current.uid,
      memberUids,
      profileUid,
      profileName: primary.name,
      profileEmail: primary.email,
      profilePhotoURL: primary.photoURL,
      otherName: otherProfile.name,
      createdAt: serverTimestamp(),
    });
  }

  // This write is signed by the other Firebase UID through the isolated Auth app.
  const otherMemberRef = doc(secondaryDb, "accountMergeMembers", other.uid);
  const otherMember = await getDocFromServer(otherMemberRef);
  if (!otherMember.exists()) await setDoc(otherMemberRef, { mergeId, createdAt: serverTimestamp() });
  else if (otherMember.get("mergeId") !== mergeId) throw Object.assign(new Error("La otra cuenta ya está vinculada a un perfil Cowork."), { code: "cowork/merge-already-linked" });

  // End only the unselected streaks after both identities have approved and
  // the pending merge is resumable. A changed list is rejected above so a new
  // streak cannot be closed without having appeared in the user's review.
  const retainedSet = new Set(retained);
  for (const pair of activePairs) if (!pair.friendUid || !retainedSet.has(pair.id)) {
    const ownerIsCurrent = pair.ownerUid === current.uid;
    await closeUnselectedPair(pair.id, ownerIsCurrent ? current.uid : other.uid, ownerIsCurrent ? db : secondaryDb);
  }

  // The account currently in use gives its independent approval. Activation
  // and this member's mapping are one atomic commit in Firestore Rules.
  const ownMemberRef = doc(db, "accountMergeMembers", current.uid);
  const batch = writeBatch(db);
  batch.set(ownMemberRef, { mergeId, createdAt: serverTimestamp() });
  batch.update(groupRef, { status: "active", activatedAt: serverTimestamp() });
  await batch.commit();
  await signOut(accountMergeAuth!).catch(() => undefined);

  const chosen = profile(profileUid === current.uid ? current : other);
  return { mergeId, memberUids, profileUid, ...chosen };
}

export async function readMergedIdentity(uid: string): Promise<MergedIdentity | null> {
  const db = await getCoworkFirestore();
  if (!db || !uid) return null;
  const member = await getDocFromServer(doc(db, "accountMergeMembers", uid));
  if (!member.exists()) return null;
  const mergeId = String(member.get("mergeId") ?? "");
  if (!/^[a-f0-9]{48}$/.test(mergeId)) return null;
  const group = await getDocFromServer(doc(db, "accountMerges", mergeId));
  if (!group.exists() || group.get("status") !== "active") return null;
  const data = group.data();
  if (!Array.isArray(data.memberUids) || data.memberUids.length !== 2 || !data.memberUids.includes(uid)
    || typeof data.profileUid !== "string" || !data.memberUids.includes(data.profileUid)) return null;
  return {
    mergeId,
    memberUids: data.memberUids as string[],
    profileUid: data.profileUid,
    name: typeof data.profileName === "string" ? data.profileName : "Miembro de Cowork",
    email: typeof data.profileEmail === "string" ? data.profileEmail : "",
    photoURL: typeof data.profilePhotoURL === "string" ? data.profilePhotoURL : "",
  };
}
