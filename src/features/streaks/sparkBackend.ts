import { auth, getCoworkFirestore } from "../../lib/firebase";
import { SparkRewards, fail } from "./sparkRewards";
import { SparkSocial } from "./sparkSocial";
import type { ProtectionProduct } from "./streakModel";
import { DEFAULT_NUDGE, isNudgeMessage, isNudgeReply, type NudgeMessage, type NudgeReply } from "./nudgeCatalog";
import { readMergedIdentity } from "../account-merge/accountMerge";

let session: { key: string; rewards: SparkRewards; social: SparkSocial } | null = null;
export async function backend() {
  const user = auth?.currentUser, db = await getCoworkFirestore();
  if (!user?.email || !db) fail("Inicia sesión para acceder a tus recompensas.");
  const current = user!, database = db!;
  let merged = null;
  try { merged = await readMergedIdentity(current.uid); } catch { /* Fall back to the signed-in UID while offline. */ }
  const uid = merged?.profileUid ?? current.uid;
  const key = `${current.uid}:${merged?.mergeId ?? ""}:${uid}`;
  if (!session || session.key !== key) {
    const identityUids = merged?.memberUids ?? [current.uid];
    const rewards = new SparkRewards(database, uid, identityUids);
    const token = await current.getIdTokenResult();
    const name = merged?.name || (typeof token.claims.name === "string" && token.claims.name ? token.claims.name : "Persona de Cowork");
    const photoURL = merged?.photoURL || (typeof token.claims.picture === "string" && token.claims.picture.startsWith("https://") ? token.claims.picture : "");
    session = { key, rewards, social: new SparkSocial(rewards, { uid, name: name.slice(0, 100), photoURL: photoURL.slice(0, 1500) }) };
  }
  return session;
}
function identifier(data: Record<string, unknown>, key: string, pattern = /^[a-zA-Z0-9_-]{1,150}$/) {
  const value = data[key];
  if (typeof value !== "string" || !pattern.test(value)) fail("El identificador no es válido.");
  return value as string;
}
async function dispatch(action: string, data: Record<string, unknown>) {
  const { rewards, social } = await backend();
  switch (action) {
    case "summary": return rewards.summary();
    case "recordEvent": return rewards.recordEvent(identifier(data, "projectId"), identifier(data, "eventId"));
    case "buyProtection": return rewards.purchase(data.product as ProtectionProduct, identifier(data, "requestId"));
    case "claimCelebration": return rewards.claimCelebration();
    case "friends": return social.friends();
    case "friendPage": return social.friendPage(typeof data.cursor === "string" ? data.cursor : "");
    case "activeStreaks": return social.activeStreaks();
    case "requestStreak": return social.requestStreak(identifier(data, "friendshipId"), identifier(data, "requestId"));
    case "removeFriend": return social.removeFriend(identifier(data, "friendshipId"));
    case "getFriendCode": return social.getFriendCode();
    case "lookupFriendCode": return social.lookupFriendCode(typeof data.code === "string" ? data.code : "");
    case "sendFriendRequest": return social.sendFriendRequest(typeof data.code === "string" ? data.code : "", identifier(data, "requestId"));
    case "acceptInvite": return social.decideInvite(identifier(data, "token", /^[a-f0-9]{48}$/), "accept");
    case "rejectInvite": return social.decideInvite(identifier(data, "token", /^[a-f0-9]{48}$/), "reject");
    case "cancelInvite": return social.decideInvite(identifier(data, "token", /^[a-f0-9]{48}$/), "cancel");
    case "mute": case "unmute": case "end": return social.manageFriend(identifier(data, "pairId"), action);
    case "nudge": {
      const message = data.message ?? DEFAULT_NUDGE;
      if (!isNudgeMessage(message)) fail("Elige una de las frases disponibles.");
      return social.manageFriend(identifier(data, "pairId"), "nudge", message as NudgeMessage);
    }
    case "readNudge": return social.readNudge(identifier(data, "id", /^[a-zA-Z0-9_-]{1,300}$/));
    case "replyNudge": {
      if (!isNudgeReply(data.reply)) fail("Elige una de las respuestas disponibles.");
      return social.replyNudge(identifier(data, "id", /^[a-zA-Z0-9_-]{1,300}$/), data.reply as NudgeReply);
    }
    default: return fail("Esta operación no está disponible.");
  }
}

/** Operational diagnostics contain only the action and error code, never work content. */
export async function runSparkCommand(action: string, data: Record<string, unknown>) {
  try { return await dispatch(action, data); }
  catch (error) {
    console.warn("streak-operation-failed", { action, code: (error as { code?: string }).code || "unknown" });
    throw error;
  }
}
