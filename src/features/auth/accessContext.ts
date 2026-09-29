import type { AccessContext, EntryIntent } from "../../types";
import { readRetiredStreakNotice, readStreakInvite } from "../streaks/streakClient";

const PROJECT_PARAM = "accessProject";
const LINK_PARAM = "accessLink";
const LEGACY_PROJECT_PARAM = "inviteProject";
const LEGACY_INVITATION_PARAM = "invitationId";
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function parseUrl(value: string) {
  try { return new URL(value, window.location.origin); } catch { return null; }
}

function contextFromUrl(value: string, depth: number): AccessContext | null {
  if (depth > 3) return null;
  const url = parseUrl(value);
  if (!url) return null;

  const projectId = url.searchParams.get(PROJECT_PARAM) || "";
  const linkId = url.searchParams.get(LINK_PARAM) || "";
  if (SAFE_ID.test(projectId) && SAFE_ID.test(linkId)) return { kind: "link", projectId, linkId };
  if (url.searchParams.get(LEGACY_PROJECT_PARAM) && url.searchParams.get(LEGACY_INVITATION_PARAM)) return { kind: "legacy" };

  // Firebase email actions wrap the original URL in `continueUrl` or `link`.
  for (const key of ["continueUrl", "link"]) {
    const nested = url.searchParams.get(key);
    if (!nested) continue;
    const result = contextFromUrl(nested, depth + 1);
    if (result) return result;
  }
  return null;
}

export function readAccessContext(value: string): AccessContext | null {
  return contextFromUrl(value, 0);
}

function intentFromUrl(value: string, depth: number): EntryIntent {
  if (depth > 3) return null;
  const url = parseUrl(value);
  if (!url) return null;
  const intent = url.searchParams.get("coworkAction");
  if (intent === "create" || intent === "join") return intent;
  for (const key of ["continueUrl", "link"]) {
    const nested = url.searchParams.get(key);
    if (!nested) continue;
    const result = intentFromUrl(nested, depth + 1);
    if (result) return result;
  }
  return null;
}

export function readEntryIntent(value: string) {
  return intentFromUrl(value, 0);
}

/** Public URL encoded in the QR code and shared by the owner. */
export function accessLinkUrl(projectId: string, linkId: string) {
  const url = new URL("/", window.location.origin);
  url.searchParams.set(PROJECT_PARAM, projectId);
  url.searchParams.set(LINK_PARAM, linkId);
  return url.toString();
}

function actionUrl(context: AccessContext | null, intent: EntryIntent) {
  const url = new URL("/", window.location.origin);
  if (context?.kind === "link") {
    url.searchParams.set(PROJECT_PARAM, context.projectId);
    url.searchParams.set(LINK_PARAM, context.linkId);
  }
  if (intent) url.searchParams.set("coworkAction", intent);
  if (readStreakInvite() || readRetiredStreakNotice()) url.searchParams.set("streakCodeNotice", "1");
  return url;
}

export function accessContinueUrl(context: AccessContext | null, intent: EntryIntent = null) {
  return actionUrl(context, intent).toString();
}

/**
 * Rewrites the address bar so only the context still in use survives a reload.
 * Pass `keepHash` to preserve the current section while removing the parameters.
 */
export function clearAuthActionUrl(context: AccessContext | null, intent: EntryIntent = null, keepHash = false) {
  const url = actionUrl(context, intent);
  url.hash = keepHash && window.location.hash ? window.location.hash : "home";
  window.history.replaceState({}, document.title, url.toString());
}
