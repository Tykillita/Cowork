/**
 * Preset nudge phrases and replies, in the spirit of Duolingo's friend nudges:
 * very short, warm, "you"/"we", at most one emoji, never guilt-tripping.
 * Only the ids travel and are validated (firestore.rules mirrors both lists).
 */
export const NUDGE_MESSAGES = {
  friendly: "¡Un toque amistoso! 👋",
  you_can: "¡Tú puedes! Una tarea y listo.",
  our_streak: "No dejemos que se apague nuestra racha 🔥",
  waiting: "Te espero hoy en Cowork.",
  team: "¡Somos un gran equipo!",
  still_time: "Todavía hay tiempo hoy ⏳",
} as const;
export const NUDGE_REPLIES = {
  on_it: "¡Voy! 🚀",
  thanks: "¡Gracias por el toque!",
  today: "Hoy sin falta 💪",
  later: "Más tarde, lo prometo",
} as const;
export type NudgeMessage = keyof typeof NUDGE_MESSAGES;
export type NudgeReply = keyof typeof NUDGE_REPLIES;
export const DEFAULT_NUDGE: NudgeMessage = "friendly";

/** Each nudge carries a phrase picked at random, so repeated nudges still feel fresh. */
export function randomNudge(): NudgeMessage {
  const ids = Object.keys(NUDGE_MESSAGES) as NudgeMessage[];
  return ids[Math.floor(Math.random() * ids.length)];
}
export const isNudgeMessage = (value: unknown): value is NudgeMessage => typeof value === "string" && Object.hasOwn(NUDGE_MESSAGES, value);
export const isNudgeReply = (value: unknown): value is NudgeReply => typeof value === "string" && Object.hasOwn(NUDGE_REPLIES, value);
/** Nudges stored before phrases existed read as the default one. */
export const nudgeText = (value: unknown) => NUDGE_MESSAGES[isNudgeMessage(value) ? value : DEFAULT_NUDGE];
export const replyText = (value: unknown) => isNudgeReply(value) ? NUDGE_REPLIES[value] : null;
