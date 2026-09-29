import { useEffect, useSyncExternalStore } from "react";
import { auth } from "../../lib/firebase";
import type { PanelUser } from "../../types";

/**
 * GitHub access token for the signed-in account. Firebase only hands it over
 * when signing in, linking or re-authenticating and never refreshes it, so it
 * lives in memory and in this tab's sessionStorage — never in Firestore.
 */
export type GitHubSessionStatus = "none" | "checking" | "ready";

export interface GitHubSessionState {
  uid: string;
  /** github.com is one of the account's sign-in methods. */
  linked: boolean;
  /** Another sign-in method remains if GitHub is unlinked. */
  canUnlink: boolean;
  token: string;
  status: GitHubSessionStatus;
  login: string;
  avatarUrl: string;
  scopes: string[];
}

const EMPTY: GitHubSessionState = { uid: "", linked: false, canUnlink: false, token: "", status: "none", login: "", avatarUrl: "", scopes: [] };
let state = EMPTY;
const listeners = new Set<() => void>();
let validation = 0;

function storageKey(uid: string) {
  return `cowork.github.${uid}`;
}

function readStoredToken(uid: string) {
  try { return sessionStorage.getItem(storageKey(uid)) || ""; } catch { return ""; }
}

function writeStoredToken(uid: string, token: string) {
  try {
    if (token) sessionStorage.setItem(storageKey(uid), token);
    else sessionStorage.removeItem(storageKey(uid));
  } catch { /* The token still works for this page until it reloads. */ }
}

function providerState(uid: string) {
  const user = auth?.currentUser;
  const providers = user && user.uid === uid ? user.providerData.map((provider) => provider.providerId) : [];
  const linked = providers.includes("github.com");
  return { linked, canUnlink: linked && providers.length > 1 };
}

function setState(next: GitHubSessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function validate(uid: string, token: string) {
  const run = ++validation;
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" },
      cache: "no-cache",
    });
    if (run !== validation || state.uid !== uid || state.token !== token) return;
    if (response.status === 401) { rejectGitHubToken(token); return; }
    const payload: unknown = await response.json().catch(() => ({}));
    const profile = payload as { login?: unknown; avatar_url?: unknown };
    const scopes = (response.headers.get("x-oauth-scopes") || "").split(",").map((scope) => scope.trim()).filter(Boolean);
    setState({
      ...state,
      status: "ready",
      login: response.ok && typeof profile.login === "string" ? profile.login : "",
      avatarUrl: response.ok && typeof profile.avatar_url === "string" ? profile.avatar_url : "",
      scopes,
    });
  } catch {
    // Offline: keep the token; GitHub requests will report their own errors.
    if (run === validation && state.uid === uid && state.token === token) setState({ ...state, status: "ready" });
  }
}

/** Points the session at the signed-in account (or none) and restores its token. */
export function syncGitHubSession(uid: string) {
  if (!uid) { if (state !== EMPTY) setState(EMPTY); return; }
  const token = readStoredToken(uid);
  const providers = providerState(uid);
  if (state.uid === uid && state.token === token && state.linked === providers.linked && state.canUnlink === providers.canUnlink) return;
  if (state.uid === uid && state.token === token) { setState({ ...state, ...providers }); return; }
  setState({ ...EMPTY, uid, ...providers, token, status: token ? "checking" : "none" });
  if (token) void validate(uid, token);
}

/** Called by the auth flows right after GitHub returns a credential. */
export function storeGitHubToken(uid: string, token: string) {
  writeStoredToken(uid, token);
  setState({ ...EMPTY, uid, ...providerState(uid), token, status: token ? "checking" : "none" });
  if (token) void validate(uid, token);
}

export function clearGitHubToken(uid?: string) {
  const target = uid || state.uid;
  if (target) writeStoredToken(target, "");
  if (!target || state.uid === target) setState(target ? { ...EMPTY, uid: target, ...providerState(target) } : EMPTY);
}

/** GitHub answered 401: the token was revoked or expired, so ask to reconnect. */
export function rejectGitHubToken(token: string) {
  if (!token || state.token !== token) return;
  clearGitHubToken(state.uid);
}

export function getGitHubSession() {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useGitHubSession(user: PanelUser | null) {
  const uid = user?.id ?? "";
  const providers = user?.authProviders.join(",") ?? "";
  useEffect(() => { syncGitHubSession(uid); }, [uid, providers]);
  const session = useSyncExternalStore(subscribe, getGitHubSession, getGitHubSession);
  return session.uid === uid ? session : { ...EMPTY, uid };
}
