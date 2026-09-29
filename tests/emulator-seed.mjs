// Creates verified test accounts in the local Auth emulator (never production).
// Usage: node tests/emulator-seed.mjs  (with `firebase emulators:start --only auth,firestore` running)
const host = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const projectId = process.env.FIREBASE_PROJECT_ID || "vigilia-panel";
const base = `http://${host}/identitytoolkit.googleapis.com/v1`;

export const TEST_ACCOUNTS = [
  { email: "propietaria@cowork.test", password: "cowork-emulador", displayName: "Propietaria" },
  { email: "solicitante@cowork.test", password: "cowork-emulador", displayName: "Solicitante" },
  { email: "sin-verificar@cowork.test", password: "cowork-emulador", displayName: "Sin verificar", unverified: true },
];

for (const account of TEST_ACCOUNTS) {
  const response = await fetch(`${base}/accounts:signUp?key=emulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password, displayName: account.displayName, returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok) {
    console.log(`${account.email}: ${body.error?.message ?? response.status}`);
    continue;
  }
  if (!account.unverified) {
    await fetch(`${base}/projects/${projectId}/accounts:update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
      body: JSON.stringify({ localId: body.localId, emailVerified: true }),
    });
  }
  console.log(`${account.email}: creada${account.unverified ? " (sin verificar)" : ""}`);
}
