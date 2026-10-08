import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

// Firebase configuration is public, but each Cowork installation must point
// to its own Firebase project instead of silently inheriting another team's data.
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || "";
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim() || "";
const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim() || "";

export const firebaseConfigured = Boolean(apiKey && appId && projectId);

const app = firebaseConfigured
  ? getApps().find((candidate) => candidate.options.projectId === projectId)
    ?? initializeApp({
      apiKey,
      appId,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || `${projectId}.firebaseapp.com`,
      projectId,
    })
  : null;

export const auth = app ? getAuth(app) : null;

// A second Auth instance lets the user prove the other Firebase identity
// without signing out of the account whose data they are currently using.
const mergeApp = app
  ? getApps().find((candidate) => candidate.name === "cowork-account-merge")
    ?? initializeApp(app.options, "cowork-account-merge")
  : null;
export const accountMergeAuth = mergeApp ? getAuth(mergeApp) : null;

const emulatorRequested = import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true"
  || (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS !== "false");
const hostname = typeof window === "undefined" ? "" : window.location.hostname.toLowerCase();
const ipv4Octets = hostname.split(".").map(Number);
const isPrivateIpv4 = ipv4Octets.length === 4 && ipv4Octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
  && (ipv4Octets[0] === 10
    || (ipv4Octets[0] === 192 && ipv4Octets[1] === 168)
    || (ipv4Octets[0] === 172 && ipv4Octets[1] >= 16 && ipv4Octets[1] <= 31));
const isLocalEmulatorHost = hostname === "localhost"
  || hostname.endsWith(".localhost")
  || hostname.endsWith(".local")
  || hostname === "127.0.0.1"
  || hostname === "::1"
  || hostname === "[::1]"
  || isPrivateIpv4;

// A build accidentally made with emulator flags must never route a public
// deployment to 127.0.0.1 on each visitor's own device.
const useEmulators = emulatorRequested && isLocalEmulatorHost;
export const firebaseEmulatorsEnabled = useEmulators;



if (auth && useEmulators) {
  const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || "127.0.0.1";
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
}
if (accountMergeAuth && useEmulators) {
  const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || "127.0.0.1";
  connectAuthEmulator(accountMergeAuth, `http://${host}:9099`, { disableWarnings: true });
}

let firestorePromise: Promise<Firestore | null> | null = null;

export function getCoworkFirestore(): Promise<Firestore | null> {
  if (!app) return Promise.resolve(null);
  firestorePromise ??= import("firebase/firestore").then(({ connectFirestoreEmulator, getFirestore }) => {
    const db = getFirestore(app);
    if (useEmulators) {
      const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || "127.0.0.1";
      connectFirestoreEmulator(db, host, 8080);
    }
    return db;
  });
  return firestorePromise;
}

let accountMergeFirestorePromise: Promise<Firestore | null> | null = null;

export function getAccountMergeFirestore(): Promise<Firestore | null> {
  if (!mergeApp) return Promise.resolve(null);
  accountMergeFirestorePromise ??= import("firebase/firestore").then(({ connectFirestoreEmulator, getFirestore }) => {
    const db = getFirestore(mergeApp);
    if (useEmulators) {
      const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || "127.0.0.1";
      connectFirestoreEmulator(db, host, 8080);
    }
    return db;
  });
  return accountMergeFirestorePromise;
}
