import { collection, doc, getDocFromServer, getDocs, increment, query, serverTimestamp, where } from "firebase/firestore";
import { DAY_MS, PENDING_REQUEST_LIMIT, SHARED_STREAK_LIMIT, dayOf } from "./streakModel.ts";
import { fail, millis, SparkRewards } from "./sparkRewards.ts";
import { ledgerTransaction } from "./sparkTransaction.ts";
import { formatFriendCode, normalizeFriendCode, randomFriendCode, type FriendCodeView, type PublicPerson } from "./friendCodes.ts";

const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");
const expiresAt = (createdAt: unknown) => (millis(createdAt) ?? 0) + 7 * DAY_MS;
export class SparkInvitations {
  rewards: SparkRewards;
  person: PublicPerson;
  generateCode: () => string;
  constructor(rewards: SparkRewards, person: PublicPerson, generateCode = randomFriendCode) {
    this.rewards = rewards; this.person = person; this.generateCode = generateCode;
  }
  get db() { return this.rewards.db; }
  get uid() { return this.rewards.uid; }
  get identityUids() { return this.rewards.identityUids; }
  selfUid(memberUids: readonly string[]) { return memberUids.find((uid) => this.identityUids.includes(uid)) ?? ""; }
  peerUid(memberUids: readonly string[]) { return memberUids.find((uid) => !this.identityUids.includes(uid)) ?? ""; }
  personFor(uid: string): PublicPerson { return { ...this.person, uid }; }
  index(uid = this.uid) { return doc(this.db, "streakSocial", uid); }
  pair(id: string) { return doc(this.db, "streakPairs", id); }
  friendship(id: string) { return doc(this.db, "streakFriendships", id); }
  friendLink(uid: string, peer: string) { return doc(this.db, "friendLinks", uid, "peers", peer); }
  link(uid: string, peer: string) { return doc(this.db, "streakLinks", uid, "peers", peer); }
  lock(uid: string, peer: string) { return doc(this.db, "streakRequestLocks", uid, "peers", peer); }
  async initialize() {
    await this.rewards.initialize();
    for (const uid of this.identityUids) {
      await ledgerTransaction(this.db, async (tx) => {
        const ref = this.index(uid), snapshot = await tx.get(ref), value = snapshot.data();
        if (!value || !("activeCount" in value)) tx.set(ref, {
          activeCount: value?.active?.length ?? 0, pendingCount: value?.pending?.length ?? 0,
          streakPendingCount: 0, lastPair: "", lastInvite: "",
        });
        else if (!("streakPendingCount" in value)) tx.update(ref, { streakPendingCount: 0 });
      });
      await this.migrateFriendships(uid);
      const pending = await getDocs(query(collection(this.db, "streakInvites"), where("ownerUid", "==", uid), where("status", "==", "pending")));
      for (const entry of pending.docs) {
        if (this.identityUids.includes(entry.get("recipientUid"))) await this.closeRequest(entry.id, "cancel");
        else if (![2, 3].includes(entry.get("version"))) await this.closeRequest(entry.id, "cancel");
        else if (expiresAt(entry.get("createdAt")) <= this.rewards.now()) await this.closeRequest(entry.id, "expire");
      }
    }
  }
  /** Existing accepted pairs retain their streak and gain a separate friendship. */
  async migrateFriendships(uid = this.uid) {
    const pairs = await getDocs(query(collection(this.db, "streakPairs"), where("memberUids", "array-contains", uid)));
    for (const entry of pairs.docs.filter((pair) => pair.get("status") === "active" && !pair.get("friendshipId"))) {
      await ledgerTransaction(this.db, async (tx) => {
        const prior = await tx.get(entry.ref), data = prior.data();
        if (!data || data.status !== "active" || data.friendshipId) return;
        const peer = (data.memberUids as string[]).find((member) => member !== uid)!;
        const friend = await tx.get(this.friendship(entry.id));
        if (friend.exists()) return fail("Esta amistad anterior necesita revisión.");
        tx.set(this.friendship(entry.id), { memberUids: data.memberUids, people: data.people,
          status: "active", createdAt: data.createdAt, token: entry.id, pairId: entry.id, best: data.best ?? 0 });
        tx.set(this.friendLink(uid, peer), { friendshipId: entry.id });
        tx.set(this.friendLink(peer, uid), { friendshipId: entry.id });
        tx.update(entry.ref, { friendshipId: entry.id });
      });
    }
  }
  async getFriendCode(): Promise<FriendCodeView> {
    await this.initialize();
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = normalizeFriendCode(this.generateCode());
      const result = await ledgerTransaction(this.db, async (tx) => {
        const assignment = this.rewards.ref("friendCode/current"), prior = await tx.get(assignment);
        const code = prior.exists() ? prior.get("code") as string : candidate;
        const publicRef = doc(this.db, "streakFriendCodes", code), profile = await tx.get(publicRef);
        if (!prior.exists() && profile.exists()) return null;
        if (!prior.exists()) tx.set(assignment, { code });
        const person = profile.data() as PublicPerson | undefined;
        if (!person || person.name !== this.person.name || person.photoURL !== this.person.photoURL) tx.set(publicRef, this.person);
        return { ...this.person, code: formatFriendCode(code) };
      });
      if (result) return result;
    }
    return fail("No se pudo crear tu código. Vuelve a intentarlo.");
  }
  async lookupFriendCode(input: string): Promise<FriendCodeView> {
    const code = normalizeFriendCode(input);
    const snapshot = await getDocFromServer(doc(this.db, "streakFriendCodes", code));
    if (!snapshot.exists()) return fail("No encontramos ese código de amigo.");
    const person = snapshot.data() as PublicPerson;
    if (this.identityUids.includes(person.uid)) return fail("Este es tu propio código de amigo.");
    return { ...person, code: formatFriendCode(code) };
  }
  async sendFriendRequest(input: string, requestId: string): Promise<{ id: string; direction: "incoming" | "outgoing" }> {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(requestId)) fail("La solicitud no es válida.");
    const code = normalizeFriendCode(input);
    await this.initialize();
    const person = await this.lookupFriendCode(code);
    // Release a stale mutual reservation before attempting a new request.
    const reservation = await getDocFromServer(this.lock(this.uid, person.uid));
    if (reservation.exists()) {
      const previous = await getDocFromServer(doc(this.db, "streakInvites", reservation.get("inviteId")));
      if (previous.get("status") === "pending" && expiresAt(previous.get("createdAt")) <= this.rewards.now())
        await this.closeRequest(previous.id, "expire");
    }
    const token = randomToken();
    return ledgerTransaction(this.db, async (tx) => {
      const receiptRef = this.rewards.ref(`streakRequests/${requestId}`);
      const [receipt, profile, index, lock, link] = await Promise.all([
        tx.get(receiptRef), tx.get(doc(this.db, "streakFriendCodes", code)), tx.get(this.index()),
        tx.get(this.lock(this.uid, person.uid)), tx.get(this.friendLink(this.uid, person.uid)),
      ]);
      if (receipt.exists()) {
        if (receipt.get("recipientUid") !== person.uid) return fail("Esta operación pertenece a otra solicitud.");
        return { id: receipt.get("token") as string, direction: receipt.get("direction") as "incoming" | "outgoing" };
      }
      if (!profile.exists() || profile.get("uid") !== person.uid) return fail("El código ya no está disponible.");
      const priorFriend = link.exists() ? await tx.get(this.friendship(link.get("friendshipId"))) : null;
      if (priorFriend?.get("status") === "active") return fail("Esta persona ya está en tus amigos.");
      const priorRequest = lock.exists() ? await tx.get(doc(this.db, "streakInvites", lock.get("inviteId"))) : null;
      if (priorRequest?.get("status") === "pending") {
        const direction = this.identityUids.includes(priorRequest.get("ownerUid")) ? "outgoing" as const : "incoming" as const;
        tx.set(receiptRef, { token: priorRequest.id, recipientUid: person.uid, direction, createdAt: serverTimestamp() });
        return { id: priorRequest.id, direction };
      }
      if (index.get("pendingCount") >= PENDING_REQUEST_LIMIT)
        return fail("Puedes tener hasta cinco solicitudes de amistad enviadas pendientes.");
      tx.set(doc(this.db, "streakInvites", token), {
        version: 3, kind: "friend", friendshipId: "", ownerUid: this.uid, person: this.personFor(this.uid),
        recipientUid: person.uid, recipientPerson: profile.data(), recipientCode: code,
        status: "pending", createdAt: serverTimestamp(),
      });
      tx.set(this.lock(this.uid, person.uid), { inviteId: token });
      tx.set(this.lock(person.uid, this.uid), { inviteId: token });
      tx.update(this.index(), { pendingCount: increment(1), lastInvite: token });
      tx.set(receiptRef, { token, recipientUid: person.uid, direction: "outgoing", createdAt: serverTimestamp() });
      return { id: token, direction: "outgoing" as const };
    });
  }
  async requestStreak(friendshipId: string, requestId: string): Promise<{ id: string; direction: "incoming" | "outgoing" }> {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(requestId)) fail("La solicitud no es válida.");
    await this.initialize();
    const friendship = await getDocFromServer(this.friendship(friendshipId)), data = friendship.data();
    const members = (data?.memberUids ?? []) as string[], owner = this.selfUid(members), peer = this.peerUid(members);
    if (!data || data.status !== "active" || !owner || !peer) return fail("Esta amistad ya no está disponible.");
    const reservation = await getDocFromServer(this.lock(owner, peer));
    if (reservation.exists()) {
      const previous = await getDocFromServer(doc(this.db, "streakInvites", reservation.get("inviteId")));
      if (previous.get("status") === "pending" && expiresAt(previous.get("createdAt")) <= this.rewards.now())
        await this.closeRequest(previous.id, "expire");
    }
    const token = randomToken();
    return ledgerTransaction(this.db, async (tx) => {
      const receiptRef = this.rewards.ref(`streakRequests/${requestId}`);
      const [friend, index, lock, receipt] = await Promise.all([
        tx.get(friendship.ref), tx.get(this.index(owner)), tx.get(this.lock(owner, peer)), tx.get(receiptRef),
      ]);
      if (receipt.exists()) {
        if (receipt.get("recipientUid") !== peer) return fail("Esta operación pertenece a otra solicitud.");
        return { id: receipt.get("token") as string, direction: receipt.get("direction") as "incoming" | "outgoing" };
      }
      if (friend.get("status") !== "active") return fail("Esta amistad ya no está disponible.");
      const pair = friend.get("pairId") ? await tx.get(this.pair(friend.get("pairId"))) : null;
      if (pair?.get("status") === "active") return fail("Ya compartes una racha con esta persona.");
      const prior = lock.exists() ? await tx.get(doc(this.db, "streakInvites", lock.get("inviteId"))) : null;
      if (prior?.get("status") === "pending") {
        const direction = this.identityUids.includes(prior.get("ownerUid")) ? "outgoing" as const : "incoming" as const;
        tx.set(receiptRef, { token: prior.id, recipientUid: peer, direction, createdAt: serverTimestamp() });
        return { id: prior.id, direction };
      }
      const activeCount = (await Promise.all(this.identityUids.map((uid) => tx.get(this.index(uid)))))
        .reduce((sum, entry) => sum + Number(entry.get("activeCount") ?? 0), 0);
      if (activeCount >= SHARED_STREAK_LIMIT) return fail("Ya tienes cinco rachas compartidas activas.");
      if ((index.get("streakPendingCount") ?? 0) >= PENDING_REQUEST_LIMIT) return fail("Ya tienes cinco solicitudes de racha enviadas pendientes.");
      tx.set(doc(this.db, "streakInvites", token), { version: 3, kind: "streak", friendshipId,
        ownerUid: owner, person: this.personFor(owner), recipientUid: peer, recipientPerson: friend.get("people")[peer],
        recipientCode: "", status: "pending", createdAt: serverTimestamp() });
      tx.set(this.lock(owner, peer), { inviteId: token }); tx.set(this.lock(peer, owner), { inviteId: token });
      tx.update(this.index(owner), { streakPendingCount: increment(1), lastInvite: token });
      tx.set(receiptRef, { token, recipientUid: peer, direction: "outgoing", createdAt: serverTimestamp() });
      return { id: token, direction: "outgoing" as const };
    });
  }
  async decideInvite(id: string, decision: "accept" | "reject" | "cancel") {
    await this.initialize();
    if (decision === "accept") {
      const invite = await getDocFromServer(doc(this.db, "streakInvites", id));
      if (invite.exists() && [2, 3].includes(invite.get("version")) && invite.get("status") === "pending"
          && expiresAt(invite.get("createdAt")) <= this.rewards.now()) {
        await this.closeRequest(id, "expire"); return fail("Esta solicitud caducó.");
      }
    }
    await this.closeRequest(id, decision);
    if (decision === "accept") { await this.rewards.summary(); await this.publishHistory(); }
  }
  async closeRequest(id: string, decision: "accept" | "reject" | "cancel" | "expire") {
    await ledgerTransaction(this.db, async (tx) => {
      const ref = doc(this.db, "streakInvites", id), invite = await tx.get(ref);
      if (!invite.exists()) return fail("La solicitud no existe.");
      const data = invite.data()!, owner = data.ownerUid as string, recipient = data.recipientUid as string;
      const legacy = ![2, 3].includes(data.version);
      const shared = data.kind === "streak", pendingField = shared ? "streakPendingCount" : "pendingCount";
      const isOwner = this.identityUids.includes(owner), isRecipient = this.identityUids.includes(recipient);
      if (legacy && (decision !== "cancel" || !isOwner)) return fail("Las invitaciones ahora funcionan con códigos de amigo.");
      if (decision === "cancel" ? !isOwner : decision === "expire" ? !isOwner && !isRecipient : !isRecipient)
        return fail("No puedes realizar esta acción con esta solicitud.");
      const status = decision === "accept" ? "accepted" : decision === "reject" ? "rejected" : decision === "expire" ? "expired" : "cancelled";
      if (data.status !== "pending") {
        if (data.status === status || decision === "expire") return;
        return fail("Esta solicitud ya no está disponible.");
      }
      const expired = expiresAt(data.createdAt) <= this.rewards.now();
      if (decision === "expire" && !expired) return fail("Esta solicitud todavía no ha caducado.");
      if ((decision === "accept" || decision === "reject") && expired) return fail("Esta solicitud caducó.");
      if (decision === "accept") {
        if (shared) {
          const [recipientIndex, ownerIndex, friend] = await Promise.all([tx.get(this.index(recipient)), tx.get(this.index(owner)), tx.get(this.friendship(data.friendshipId))]);
          const previous = friend.get("pairId") ? await tx.get(this.pair(friend.get("pairId"))) : null;
          if (friend.get("status") !== "active") return fail("Esta amistad ya no está disponible.");
          if (previous?.get("status") === "active") return fail("Ya compartes una racha con esta persona.");
          const localIndexes = await Promise.all(this.identityUids.map((uid) => tx.get(this.index(uid))));
          const localTotal = localIndexes.reduce((sum, entry) => sum + Number(entry.get("activeCount") ?? 0), 0);
          const ownerTotal = isOwner ? localTotal : Number(ownerIndex.get("activeCount") ?? 0);
          const recipientTotal = isRecipient ? localTotal : Number(recipientIndex.get("activeCount") ?? 0);
          if (recipientTotal >= SHARED_STREAK_LIMIT || ownerTotal >= SHARED_STREAK_LIMIT)
            return fail("Una de las dos personas ya tiene cinco rachas compartidas activas.");
          const recipientPerson = this.personFor(recipient);
          tx.set(this.pair(id), { memberUids: [owner, recipient], people: { [owner]: data.person, [recipient]: recipientPerson },
            since: dayOf(this.rewards.now()), status: "active", muted: [], createdAt: serverTimestamp(), token: id, friendshipId: data.friendshipId });
          tx.update(friend.ref, { pairId: id });
          tx.set(this.link(recipient, owner), { pairId: id }); tx.set(this.link(owner, recipient), { pairId: id });
          tx.update(this.index(recipient), { activeCount: increment(1), lastPair: id });
          tx.update(this.index(owner), { activeCount: increment(1), streakPendingCount: increment(-1), lastPair: id, lastInvite: id });
        } else {
          const link = await tx.get(this.friendLink(recipient, owner));
          const previous = link.exists() ? await tx.get(this.friendship(link.get("friendshipId"))) : null;
          if (previous?.get("status") === "active") return fail("Esta persona ya está en tus amigos.");
          const recipientPerson = this.personFor(recipient);
          tx.set(this.friendship(id), { memberUids: [owner, recipient], people: { [owner]: data.person, [recipient]: recipientPerson },
            status: "active", createdAt: serverTimestamp(), token: id, pairId: "", best: 0 });
          tx.set(this.friendLink(recipient, owner), { friendshipId: id }); tx.set(this.friendLink(owner, recipient), { friendshipId: id });
          tx.update(this.index(owner), { pendingCount: increment(-1), lastInvite: id });
        }
      } else tx.update(this.index(owner), { [pendingField]: increment(-1), lastInvite: id });
      tx.update(ref, { status, decidedAt: serverTimestamp() });
    });
  }
  async publishHistory(): Promise<void> {}
}
