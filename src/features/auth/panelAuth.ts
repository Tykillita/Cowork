import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  GithubAuthProvider,
  GoogleAuthProvider,
  getRedirectResult,
  isSignInWithEmailLink,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
  sendEmailVerification,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  unlink,
  updateProfile,
  type User,
  type UserCredential,
} from "firebase/auth";
import type { AccessContext, EntryIntent, PanelUser } from "../../types";
import { auth, firebaseConfigured } from "../../lib/firebase";
import { accessContinueUrl, clearAuthActionUrl } from "./accessContext";
import { clearGitHubToken, storeGitHubToken } from "../github/githubSession";

const EMAIL_STORAGE_KEY = "cowork.email-link-address";

function authUnavailable() {
  return Object.assign(new Error("Firebase Authentication no está configurado."), { code: "cowork/firebase-not-configured" });
}

export function panelProfileForAuthUser(user: User | null): PanelUser | null {
  if (!user?.uid || !user.email) return null;
  const email = user.email.trim().toLowerCase();
  const name = user.displayName?.trim() || email.split("@")[0] || "Miembro del equipo";
  return {
    id: user.uid,
    name,
    email,
    photoURL: user.photoURL || "",
    emailVerified: user.emailVerified,
    authProviders: user.providerData.map((provider) => provider.providerId),
  };
}

export function observePanelAuth(onChange: (user: PanelUser | null) => void) {
  const authClient = auth;
  if (!authClient || !firebaseConfigured) return () => undefined;
  return onAuthStateChanged(authClient, (firebaseUser) => onChange(panelProfileForAuthUser(firebaseUser)));
}

export function isEmailLinkSignIn() {
  return Boolean(auth && isSignInWithEmailLink(auth, window.location.href));
}

export function storedEmailForSignIn() {
  try { return localStorage.getItem(EMAIL_STORAGE_KEY) || ""; } catch { return ""; }
}

export async function sendEmailSignInLink(emailValue: string, context: AccessContext | null, rememberEmail = true, intent: EntryIntent = null) {
  if (!auth || !firebaseConfigured) throw authUnavailable();
  const email = emailValue.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("Escribe un correo válido."), { code: "cowork/invalid-email" });
  }
  const continueUrl = accessContinueUrl(context, intent);
  await sendSignInLinkToEmail(auth, email, { url: continueUrl, handleCodeInApp: true });
  if (rememberEmail) {
    try { localStorage.setItem(EMAIL_STORAGE_KEY, email); } catch { /* The link can still be completed by entering the address. */ }
  }
}

function validateEmail(emailValue: string) {
  const email = emailValue.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("Escribe un correo válido."), { code: "cowork/invalid-email" });
  }
  return email;
}

export async function loginWithEmailPassword(emailValue: string, password: string) {
  if (!auth || !firebaseConfigured) throw authUnavailable();
  const email = validateEmail(emailValue);
  if (!password) throw Object.assign(new Error("Escribe tu contraseña."), { code: "cowork/invalid-password" });
  await setPersistence(auth, browserLocalPersistence);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const profile = panelProfileForAuthUser(credential.user);
  if (!profile) throw Object.assign(new Error("Firebase no devolvió una cuenta con correo."), { code: "cowork/missing-email" });
  return profile;
}

export async function sendAccountEmailVerification(context: AccessContext | null) {
  if (!auth || !firebaseConfigured || !auth.currentUser) throw authUnavailable();
  await sendEmailVerification(auth.currentUser, {
    url: accessContinueUrl(context, context ? "join" : null),
    handleCodeInApp: false,
  });
}

export async function refreshPanelAuthUser() {
  if (!auth || !firebaseConfigured || !auth.currentUser) throw authUnavailable();
  const currentUser = auth.currentUser;
  await currentUser.reload();
  await currentUser.getIdToken(true);
  const profile = panelProfileForAuthUser(currentUser);
  if (!profile) throw Object.assign(new Error("Firebase no devolvió una cuenta con correo."), { code: "cowork/missing-email" });
  return profile;
}

export async function registerWithEmailPassword(emailValue: string, password: string, displayName: string) {
  if (!auth || !firebaseConfigured) throw authUnavailable();
  const email = validateEmail(emailValue);
  if (password.length < 6) throw Object.assign(new Error("La contraseña debe tener al menos 6 caracteres."), { code: "cowork/weak-password" });
  await setPersistence(auth, browserLocalPersistence);
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  try {
    if (displayName.trim()) await updateProfile(credential.user, { displayName: displayName.trim() });
    const profile = panelProfileForAuthUser(credential.user);
    if (!profile) throw Object.assign(new Error("Firebase no devolvió una cuenta con correo."), { code: "cowork/missing-email" });
    return profile;
  } catch (error) {
    await signOut(auth).catch(() => undefined);
    throw error;
  }
}

export async function sendPasswordRecovery(emailValue: string) {
  if (!auth || !firebaseConfigured) throw authUnavailable();
  const email = validateEmail(emailValue);
  await sendPasswordResetEmail(auth, email);
}

export async function completeEmailLinkSignIn(emailValue: string, context: AccessContext | null, intent: EntryIntent = null) {
  if (!auth || !firebaseConfigured) throw authUnavailable();
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    throw Object.assign(new Error("Este enlace de acceso ya no es válido. Solicita uno nuevo."), { code: "auth/invalid-action-code" });
  }
  const email = emailValue.trim().toLowerCase();
  if (!email) throw Object.assign(new Error("Escribe el correo al que llegó el enlace."), { code: "cowork/invalid-email" });
  await setPersistence(auth, browserLocalPersistence);
  const credential = await signInWithEmailLink(auth, email, window.location.href);
  try { localStorage.removeItem(EMAIL_STORAGE_KEY); } catch { /* Ignore unavailable browser storage. */ }
  clearAuthActionUrl(context, intent);
  const profile = panelProfileForAuthUser(credential.user);
  if (!profile) throw Object.assign(new Error("Firebase no devolvió una cuenta con correo."), { code: "cowork/missing-email" });
  return profile;
}

/** Phones, Safari and installed apps block or lose popups, so they use a full redirect. */
function prefersRedirect() {
  if (typeof window === "undefined") return false;
  const agent = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/i.test(agent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari\//i.test(agent) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Opera)/i.test(agent);
  return ios || safari || window.matchMedia("(max-width: 768px)").matches
    || window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

function popupWasBlocked(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "auth/popup-blocked");
}

type OAuthKind = "google" | "github";
const PROVIDER_ID: Record<OAuthKind, string> = { google: "google.com", github: "github.com" };
const PROVIDER_NAME: Record<OAuthKind, string> = { google: "Google", github: "GitHub" };

function oauthProvider(kind: OAuthKind) {
  if (kind === "google") return new GoogleAuthProvider();
  // `repo` lets members create and delete branches of public and private repositories.
  const provider = new GithubAuthProvider();
  provider.addScope("repo");
  provider.addScope("read:user");
  provider.addScope("user:email");
  return provider;
}

/** Firebase only exposes the GitHub token in the credential it just returned. */
function keepGitHubToken(result: UserCredential) {
  if (result.providerId !== PROVIDER_ID.github) return;
  const token = GithubAuthProvider.credentialFromResult(result)?.accessToken;
  if (token) storeGitHubToken(result.user.uid, token);
}

function profileFromCredential(result: UserCredential, kind: OAuthKind) {
  keepGitHubToken(result);
  const profile = panelProfileForAuthUser(result.user);
  if (!profile) throw Object.assign(new Error(`La cuenta de ${PROVIDER_NAME[kind]} no compartió un correo.`), { code: "cowork/missing-email" });
  return profile;
}

async function signInWithProvider(kind: OAuthKind) {
  if (!auth || !firebaseConfigured) throw authUnavailable();
  await setPersistence(auth, browserLocalPersistence);
  const provider = oauthProvider(kind);
  if (prefersRedirect()) {
    await signInWithRedirect(auth, provider);
    return null;
  }
  try {
    return profileFromCredential(await signInWithPopup(auth, provider), kind);
  } catch (error) {
    if (!popupWasBlocked(error)) throw error;
    await signInWithRedirect(auth, provider);
    return null;
  }
}

export function loginWithGoogle() {
  return signInWithProvider("google");
}

export function loginWithGitHub() {
  return signInWithProvider("github");
}

async function linkProvider(kind: OAuthKind) {
  if (!auth?.currentUser || !firebaseConfigured) throw authUnavailable();
  if (auth.currentUser.providerData.some((provider) => provider.providerId === PROVIDER_ID[kind])) {
    const current = panelProfileForAuthUser(auth.currentUser);
    if (current) return current;
  }
  const provider = oauthProvider(kind);
  if (prefersRedirect()) {
    await linkWithRedirect(auth.currentUser, provider);
    return null;
  }
  try {
    return profileFromCredential(await linkWithPopup(auth.currentUser, provider), kind);
  } catch (error) {
    if (!popupWasBlocked(error)) throw error;
    await linkWithRedirect(auth.currentUser, provider);
    return null;
  }
}

export function linkGoogleProvider() {
  return linkProvider("google");
}

export function linkGitHubProvider() {
  return linkProvider("github");
}

/** Asks GitHub for a fresh token when this tab has none (new tab, revoked or expired). */
export async function reconnectGitHub() {
  if (!auth?.currentUser || !firebaseConfigured) throw authUnavailable();
  if (!auth.currentUser.providerData.some((provider) => provider.providerId === PROVIDER_ID.github)) return linkGitHubProvider();
  const provider = oauthProvider("github");
  if (prefersRedirect()) {
    await reauthenticateWithRedirect(auth.currentUser, provider);
    return null;
  }
  try {
    return profileFromCredential(await reauthenticateWithPopup(auth.currentUser, provider), "github");
  } catch (error) {
    if (!popupWasBlocked(error)) throw error;
    await reauthenticateWithRedirect(auth.currentUser, provider);
    return null;
  }
}

export async function unlinkGitHub() {
  if (!auth?.currentUser || !firebaseConfigured) throw authUnavailable();
  if (auth.currentUser.providerData.length < 2) {
    throw Object.assign(new Error("GitHub es tu único método de acceso. Vincula otro antes de desvincularlo."), { code: "cowork/last-provider" });
  }
  const user = await unlink(auth.currentUser, PROVIDER_ID.github);
  clearGitHubToken(user.uid);
  return panelProfileForAuthUser(user);
}

let redirectResultPromise: ReturnType<typeof getRedirectResult> | null = null;

/** Result of a Google or GitHub redirect (sign-in, link or GitHub reconnection). */
export async function getAuthRedirectResult() {
  if (!auth || !firebaseConfigured) return null;
  redirectResultPromise ??= getRedirectResult(auth);
  const result = await redirectResultPromise;
  if (!result) return null;
  const kind: OAuthKind = result.providerId === PROVIDER_ID.github ? "github" : "google";
  return { operationType: result.operationType, provider: kind, profile: profileFromCredential(result, kind) };
}

export async function endSession() {
  clearGitHubToken();
  if (auth) await signOut(auth);
}
