import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp } from "firebase/firestore";

/** Must match VITE_FIREBASE_PROJECT_ID in .env.local; only emulators are touched. */
export const PROJECT_ID = process.env.E2E_FIREBASE_PROJECT_ID || "vigilia-panel";
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`;
const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080"}`;
export const PASSWORD = "cowork-emulador";

let env: RulesTestEnvironment | null = null;

async function environment() {
  env ??= await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE.replace(/^http:\/\//, "").split(":")[0],
      port: Number(FIRESTORE.split(":").pop()),
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  return env;
}

/** Empties Auth and Firestore in the emulators. */
export async function resetEmulators() {
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
}

export type TestAccount = { uid: string; email: string; name: string };

export async function createAccount(name: string, verified = true): Promise<TestAccount> {
  const email = `${name.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}@cowork.test`;
  const response = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, displayName: name, returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "signUp failed");
  if (verified) {
    await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
      body: JSON.stringify({ localId: body.localId, emailVerified: true }),
    });
  }
  return { uid: body.localId, email, name };
}

/** Writes a project with its owner (rules bypassed; used only for setup). */
export async function seedProject(owner: TestAccount, input: { id: string; name: string; description?: string; createdAt?: string; previewUrl?: string; repositoryUrl?: string; githubPolicy?: { branchWrite: "owner" | "members" }; members?: TestAccount[]; schedule?: Record<string, string> }) {
  const test = await environment();
  await test.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const createdAt = input.createdAt ?? new Date().toISOString();
    await setDoc(doc(db, "projects", input.id), {
      id: input.id, name: input.name, description: input.description ?? "", repositoryUrl: input.repositoryUrl ?? "", previewUrl: input.previewUrl ?? "", kind: "general", createdAt, ownerUid: owner.uid,
      ...(input.schedule ? { schedule: input.schedule } : {}),
      ...(input.githubPolicy ? { githubPolicy: input.githubPolicy } : {}),
    });
    const people = [{ account: owner, role: "owner" }, ...(input.members ?? []).map((account) => ({ account, role: "member" }))];
    for (const { account, role } of people) {
      await setDoc(doc(db, "projects", input.id, "members", account.uid), {
        uid: account.uid, email: account.email, emailLower: account.email, name: account.name, role, status: "active", joinedAt: createdAt,
        ...(role === "member" ? { accessRequestId: account.uid } : {}),
      });
      await setDoc(doc(db, "users", account.uid, "projectAccess", input.id), { projectId: input.id, role, joinedAt: createdAt });
      await setDoc(doc(db, "projects", input.id, "directory", account.uid), { uid: account.uid, name: account.name, photoURL: "", active: true, updatedAt: createdAt });
    }
  });
}

export async function seedAccessLink(projectId: string, projectName: string, ownerUid: string, linkId = "a".repeat(32)) {
  const test = await environment();
  await test.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "projects", projectId, "accessLinks", linkId), {
      id: linkId, projectId, projectName, status: "active", createdAt: new Date().toISOString(), expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86_400_000), createdByUid: ownerUid,
    });
  });
  return `/?accessProject=${projectId}&accessLink=${linkId}`;
}

export async function seedActivityEvents(projectId: string, count: number, actor: TestAccount) {
  const test = await environment();
  await test.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const now = Date.now();
    await Promise.all(Array.from({ length: count }, (_, index) => setDoc(doc(db, "projects", projectId, "events", `task-seeded-${index}`), {
      id: `task-seeded-${index}`, projectId, kind: "created", targetType: "task", targetId: `seeded-${index}`,
      targetTitle: `Actividad ${projectId} ${index}`, revision: 1, actorUid: actor.uid, actorName: actor.name,
      createdAt: Timestamp.fromMillis(now - index * 1000), changes: {},
    })));
  });
}

export type SeedTask = { id: string; title: string; status?: "Pendiente" | "En curso" | "Hecha"; assignee?: TestAccount; phase?: string; order?: number; milestoneId?: string; details?: Record<string, unknown> };

/** Writes tasks straight into Firestore (rules bypassed; used only for setup). */
export async function seedTasks(projectId: string, tasks: SeedTask[], updatedBy: TestAccount) {
  const test = await environment();
  await test.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [index, task] of tasks.entries()) {
      await setDoc(doc(db, "projects", projectId, "tasks", task.id), {
        id: task.id, order: task.order ?? (index + 1) * 1_048_576, phase: task.phase ?? "General", title: task.title, status: task.status ?? "Pendiente",
        assignee: task.assignee?.name ?? "", assigneeUid: task.assignee?.uid ?? "", milestoneId: task.milestoneId ?? "", revision: 1, updatedByUid: updatedBy.uid,
        ...(task.details ?? {}),
      });
    }
  });
}

export async function removeMember(projectId: string, uid: string) {
  const test = await environment();
  await test.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const { deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "projects", projectId, "members", uid));
    await deleteDoc(doc(db, "users", uid, "projectAccess", projectId));
  });
}

/**
 * Real sign-in through the portal ("Crear un proyecto" is its sign-in entry).
 * Closes the create dialog afterwards unless asked to keep it.
 */
export async function signIn(page: Page, account: TestAccount, { keepCreateDialog = false, path = "/" } = {}) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  if (path === "/") await page.getByRole("button", { name: "Crear un proyecto" }).click();
  const email = page.getByRole("textbox", { name: "Correo electrónico" });
  await email.fill(account.email);
  await email.press("Enter");
  const password = page.getByRole("textbox", { name: "Contraseña" });
  await password.fill(PASSWORD);
  await password.press("Enter");
  // Auth and the first Firestore stream can start slowly in the local emulators.
  await expect(page.locator(".projectPicker:not([aria-busy]), .app-shell:not([aria-busy])").first()).toBeVisible({ timeout: 30_000 });
  if (!keepCreateDialog && path === "/") {
    const dialog = page.locator("dialog.projectCreateDialog[open]");
    if (await dialog.count()) await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
}

export async function signOut(page: Page) {
  const button = page.getByRole("button", { name: /^(Cerrar sesión|Bloquear)$/ });
  await button.click();
  await expect(page.getByRole("button", { name: "Crear un proyecto" })).toBeVisible();
}

export async function openProject(page: Page, name: string) {
  // Cards are stacked; keyboard activation avoids clicking through the stack.
  const tab = page.getByRole("button", { name: `Abrir el proyecto ${name}` });
  await tab.focus();
  await tab.press("Enter");
  await expect(page.locator(".app-shell:not([aria-busy])")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}
