import { collection, doc, getDocFromServer, getDocs, increment, query, serverTimestamp, where } from "firebase/firestore";
import { DAY_MS, FRIEND_LIMIT, dayOf } from "./streakModel.ts";
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
  index(uid = this.uid) { return doc(this.db, "streakSocial", uid); }
  pair(id: string) { return doc(this.db, "streakPairs", id); }
  link(uid: string, peer: string) { return doc(this.db, "streakLinks", uid, "peers", peer); }
  lock(uid: string, peer: string) { return doc(this.db, "streakRequestLocks", uid, "peers", peer); }
  async initialize() {
    await this.rewards.initialize();
    await ledgerTransaction(this.db, async (tx) => {
      const ref = this.index(), snapshot = await tx.get(ref), value = snapshot.data();
      if (!value || !("activeCount" in value)) tx.set(ref, {
        activeCount: value?.active?.length ?? 0, pendingCount: value?.pending?.length ?? 0, lastPair: "", lastInvite: "",
      });
    });
    const pending = await getDocs(query(collection(this.db, "streakInvites"), where("ownerUid", "==", this.uid), where("status", "==", "pending")));
    for (const entry of pending.docs) {
      if (entry.get("version") !== 2) await this.closeRequest(entry.id, "cancel");
      else if (expiresAt(entry.get("createdAt")) <= this.rewards.now()) await this.closeRequest(entry.id, "expire");
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
    if (person.uid === this.uid) return fail("Este es tu propio código de amigo.");
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
        tx.get(this.lock(this.uid, person.uid)), tx.get(this.link(this.uid, person.uid)),
      ]);
      if (receipt.exists()) {
        if (receipt.get("recipientUid") !== person.uid) return fail("Esta operación pertenece a otra solicitud.");
        return { id: receipt.get("token") as string, direction: receipt.get("direction") as "incoming" | "outgoing" };
      }
      if (!profile.exists() || profile.get("uid") !== person.uid) return fail("El código ya no está disponible.");
      const priorPair = link.exists() ? await tx.get(this.pair(link.get("pairId"))) : null;
      if (priorPair?.get("status") === "active") return fail("Ya compartes una racha con esta persona.");
      const priorRequest = lock.exists() ? await tx.get(doc(this.db, "streakInvites", lock.get("inviteId"))) : null;
      if (priorRequest?.get("status") === "pending") {
        const direction = priorRequest.get("ownerUid") === this.uid ? "outgoing" as const : "incoming" as const;
        tx.set(receiptRef, { token: priorRequest.id, recipientUid: person.uid, direction, createdAt: serverTimestamp() });
        return { id: priorRequest.id, direction };
      }
      if (index.get("activeCount") >= FRIEND_LIMIT || index.get("pendingCount") >= FRIEND_LIMIT)
        return fail("Puedes tener cinco parejas y hasta cinco solicitudes enviadas pendientes.");
      tx.set(doc(this.db, "streakInvites", token), {
        version: 2, ownerUid: this.uid, person: this.person, recipientUid: person.uid, recipientPerson: profile.data(), recipientCode: code,
        status: "pending", createdAt: serverTimestamp(),
      });
      tx.set(this.lock(this.uid, person.uid), { inviteId: token });
      tx.set(this.lock(person.uid, this.uid), { inviteId: token });
      tx.update(this.index(), { pendingCount: increment(1), lastInvite: token });
      tx.set(receiptRef, { token, recipientUid: person.uid, direction: "outgoing", createdAt: serverTimestamp() });
      return { id: token, direction: "outgoing" as const };
    });
  }
  async decideInvite(id: string, decision: "accept" | "reject" | "cancel") {
    await this.initialize();
    if (decision === "accept") {
      const invite = await getDocFromServer(doc(this.db, "streakInvites", id));
      if (invite.exists() && invite.get("version") === 2 && invite.get("status") === "pending"
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
      const legacy = data.version !== 2;
      if (legacy && (decision !== "cancel" || owner !== this.uid)) return fail("Las invitaciones ahora funcionan con códigos de amigo.");
      if (decision === "cancel" ? owner !== this.uid : decision === "expire" ? ![owner, recipient].includes(this.uid) : recipient !== this.uid)
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
        const [index, link] = await Promise.all([tx.get(this.index()), tx.get(this.link(this.uid, owner))]);
        const previous = link.exists() ? await tx.get(this.pair(link.get("pairId"))) : null;
        if (previous?.get("status") === "active") return fail("Ya compartes una racha con esta persona.");
        if (index.get("activeCount") >= FRIEND_LIMIT) return fail("Ya tienes cinco parejas activas.");
        tx.set(this.pair(id), { memberUids: [owner, this.uid], people: { [owner]: data.person, [this.uid]: this.person },
          since: dayOf(this.rewards.now()), status: "active", muted: [], createdAt: serverTimestamp(), token: id });
        tx.set(this.link(this.uid, owner), { pairId: id }); tx.set(this.link(owner, this.uid), { pairId: id });
        tx.update(this.index(), { activeCount: increment(1), lastPair: id });
        tx.update(this.index(owner), { activeCount: increment(1), pendingCount: increment(-1), lastPair: id, lastInvite: id });
      } else tx.update(this.index(owner), { pendingCount: increment(-1), lastInvite: id });
      tx.update(ref, { status, decidedAt: serverTimestamp() });
    });
  }
  async publishHistory(): Promise<void> {}
}
