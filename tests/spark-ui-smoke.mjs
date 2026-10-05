import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
const project = "vigilia-panel";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Emulators only");
const auth = "http://127.0.0.1:9099", fs = "http://127.0.0.1:8080", base = "http://127.0.0.1:5190";
const out = ".firebase/spark-ui";
await mkdir(out, { recursive: true });
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "5190", "--strictPort"], {
  cwd: process.cwd(), stdio: "ignore", env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=128" }, windowsHide: true,
});
let browser;
const errors = [];
function value(v) {
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, v]) => [k, value(v)])) } };
}
async function seed(path, data) {
  const result = await fetch(fs + "/v1/projects/" + project + "/databases/(default)/documents/" + path, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ fields: value(data).mapValue.fields }),
  });
  if (!result.ok) throw new Error(await result.text());
}
async function account(name) {
  const email = name.toLowerCase() + "@cowork.test";
  const result = await fetch(auth + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "cowork-emulador", displayName: name, returnSecureToken: true }),
  });
  const data = await result.json(); if (!result.ok) throw new Error(JSON.stringify(data));
  const uid = data.localId, id = name.toLowerCase(), now = new Date().toISOString();
  const verification = await fetch(auth + "/identitytoolkit.googleapis.com/v1/projects/" + project + "/accounts:update", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ localId: uid, emailVerified: true }),
  });
  if (!verification.ok) throw new Error("Emulator verification failed: " + (await verification.json()).error?.message);
  const credentials = await fetch(auth + "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "cowork-emulador", returnSecureToken: true }),
  });
  if (!credentials.ok) throw new Error("Emulator fixture password failed: " + (await credentials.json()).error?.message);
  await seed("projects/" + id, { id, name, description: "", repositoryUrl: "", previewUrl: "", kind: "general", createdAt: now, ownerUid: uid });
  await seed(`projects/${id}/members/${uid}`, { uid, email, emailLower: email, name, role: "owner", status: "active", joinedAt: now });
  await seed(`users/${uid}/projectAccess/${id}`, { projectId: id, role: "owner", joinedAt: now });
  await seed(`projects/${id}/directory/${uid}`, { uid, name, photoURL: "", active: true, updatedAt: now });
  return { uid, email, name };
}
async function signIn(page, who, path = "/") {
  page.on("console", (message) => { if (message.text().includes("streak-operation-failed")) errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  if (path === "/") await page.getByRole("button", { name: "Crear un proyecto" }).click();
  await page.getByRole("textbox", { name: "Correo electrónico" }).fill(who.email);
  await page.getByRole("textbox", { name: "Correo electrónico" }).press("Enter");
  await page.getByRole("textbox", { name: "Contraseña" }).fill("cowork-emulador");
  await page.getByRole("textbox", { name: "Contraseña" }).press("Enter");
  await expect(page.locator(".projectPicker:not([aria-busy]), .app-shell:not([aria-busy])").first()).toBeVisible({ timeout: 30000 });
  if (path === "/" && await page.locator("dialog.projectCreateDialog[open]").count()) await page.keyboard.press("Escape");
}
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await fetch(auth + "/emulator/v1/projects/" + project + "/accounts", { method: "DELETE" });
  await fetch(fs + "/emulator/v1/projects/" + project + "/databases/(default)/documents", { method: "DELETE" });
  const unauth = await fetch(fs + "/v1/projects/" + project + "/databases/(default)/documents/users/private/streak/state");
  expect(unauth.status).toBe(403); console.log("PASS unauthenticated access denied");
  const ana = await account("Ana"), bob = await account("Bruno"), day = Math.floor(Date.now() / 86400000);
  for (const d of [day - 4, day - 3, day - 2]) await seed(`users/${ana.uid}/activeDays/${d}`, { day: d, recordedAt: new Date(d * 86400000 + 3600000) });
  await seed(`users/${ana.uid}/progress/summary`, { activeDays: 3, lastRecordedDay: day - 2, updatedAt: new Date() });
  await seed(`users/${ana.uid}/progress/wallet`, { balance: 25, earned: 25, spent: 0, lastAward: "seed", lastPurchase: "", updatedAt: new Date() });
  await seed(`users/${ana.uid}/streak/state`, { version: 1, managedFrom: day - 4, lastSettledDay: day - 2, protectors: 1, shieldStart: -1, shieldEnd: -1, current: 3, best: 3, evaluatedDay: day - 1, badges: [] });
  browser = await chromium.launch({ headless: true, args: ["--disable-gpu", "--renderer-process-limit=1"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce", locale: "es-ES", timezoneId: "America/Panama", baseURL: base });
  const page = await ctx.newPage(); await signIn(page, ana);
  await page.getByRole("button", { name: /Abrir rachas y puntos/ }).click();
  const panel = page.getByRole("dialog", { name: "Rachas y puntos" });
  await expect(panel.getByText("Tu racha está a salvo")).toBeVisible({ timeout: 30000 });
  await expect(panel.locator(".streakHeroMain b")).toHaveText("3");
  await expect(panel.locator(".streakDay.is-protected")).toHaveCount(1);
  await panel.getByRole("button", { name: "Comprar · 3 puntos", exact: true }).click();
  await panel.getByRole("button", { name: "Confirmar · 3 puntos", exact: true }).click();
  await expect(panel.locator(".streakStats")).toContainText("22Puntos disponibles");
  await panel.getByRole("button", { name: "Comprar · 15 puntos", exact: true }).click();
  await panel.getByRole("button", { name: "Confirmar · 15 puntos", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Escudo activo", exact: true })).toBeDisabled();
  await expect(panel.locator(".streakStats")).toContainText("7Puntos disponibles");
  await panel.evaluate((el) => { el.scrollTop = 0; });
  await page.screenshot({ path: out + "/personal.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: out + "/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await panel.getByRole("tab", { name: "Personal", exact: true }).focus(); await page.keyboard.press("ArrowRight");
  await expect(panel.getByRole("tab", { name: "Amigos", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false }));
  const download = page.waitForEvent("download"); await panel.getByRole("button", { name: "Compartir mi racha" }).click();
  await (await download).saveAs(out + "/share.png");
  console.log("PASS calendar, protection, prices, keyboard, mobile and PNG share");
  await expect(panel.getByLabel("Mi código de amigo")).toHaveValue(/^CW-/);
  const other = await browser.newContext({ viewport: { width: 1000, height: 800 }, reducedMotion: "reduce", baseURL: base });
  const friend = await other.newPage(); await signIn(friend, bob);
  await friend.getByRole("button", { name: /Abrir rachas y puntos/ }).click();
  const fp = friend.getByRole("dialog", { name: "Rachas y puntos" });
  await fp.getByRole("tab", { name: "Amigos", exact: true }).click();
  await expect(fp.getByLabel("Mi código de amigo")).toHaveValue(/^CW-/);
  const bobCode = await fp.getByLabel("Mi código de amigo").inputValue();
  const myCode = await panel.getByLabel("Mi código de amigo").inputValue();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true,
    value: { writeText: async (text) => sessionStorage.setItem("copied-friend-code", text) } }));
  await panel.getByRole("button", { name: "Copiar", exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("copied-friend-code"))).toBe(myCode);
  await panel.getByLabel("Agregar amigo por código").fill(bobCode.toLowerCase().replaceAll("-", " "));
  await panel.getByLabel("Agregar amigo por código").press("Enter");
  await expect(panel.locator(".friendRequestPreview")).toContainText("Bruno");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: out + "/friend-code-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await panel.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  await fp.getByRole("region", { name: "Solicitudes recibidas" }).getByRole("button", { name: "Aceptar", exact: true }).click();
  await expect(panel.locator(".streakFriend")).toContainText("Bruno", { timeout: 30000 });
  await panel.getByRole("button", { name: "Dar toque", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Toque enviado hoy" })).toBeDisabled();
  await expect(fp.locator(".streakNudge")).toContainText("Ana");
  await fp.getByRole("button", { name: "Entendido" }).click(); await expect(fp.locator(".streakNudge")).toHaveCount(0);
  if (await fp.count() === 0) {
    await friend.getByRole("button", { name: /Abrir rachas y puntos/ }).click();
    await fp.getByRole("tab", { name: "Amigos", exact: true }).click();
  }
  await fp.getByRole("button", { name: "Silenciar toques" }).click();
  await expect(fp.getByRole("button", { name: "Activar toques" })).toBeVisible();
  await page.screenshot({ path: out + "/friends.png", fullPage: true });
  await fp.getByRole("button", { name: "Finalizar", exact: true }).click();
  await fp.getByRole("button", { name: "Finalizar racha compartida", exact: true }).click();
  await expect(fp.locator(".streakFriend")).toHaveCount(0); await expect(panel.locator(".streakFriend")).toHaveCount(0);
  // An ended pair can receive a new explicit request; rejection and cancellation are separate actions.
  async function resend() {
    await panel.getByLabel("Agregar amigo por código").fill(bobCode);
    await panel.getByRole("button", { name: "Buscar", exact: true }).click();
    await panel.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  }
  await resend();
  await fp.getByRole("region", { name: "Solicitudes recibidas" }).getByRole("button", { name: "Rechazar", exact: true }).click();
  await expect(panel.getByRole("region", { name: "Solicitudes enviadas" })).toContainText("Rechazada");
  await resend();
  await panel.getByRole("button", { name: "Cancelar solicitud", exact: true }).click();
  await expect(fp.getByRole("region", { name: "Solicitudes recibidas" })).toContainText("Cancelada");
  for (let i = 0; i < 24; i++) await seed("streakInvites/" + i.toString(16).padStart(48, "0"), {
    version: 2, ownerUid: ana.uid, person: { uid: ana.uid, name: "Ana", photoURL: "" },
    recipientUid: bob.uid, recipientPerson: { uid: bob.uid, name: "Bruno", photoURL: "" }, recipientCode: bobCode.replaceAll("-", "").slice(2),
    status: "rejected", createdAt: new Date(Date.now() - i * 1000), expiresAt: new Date(Date.now() + 86400000),
  });
  const sentRequests = panel.getByRole("region", { name: "Solicitudes enviadas" });
  await expect(sentRequests.locator(".friendRequestRow")).toHaveCount(20);
  await sentRequests.getByRole("button", { name: "Siguiente" }).click();
  await expect(sentRequests.locator(".friendRequestRow")).toHaveCount(7);
  await sentRequests.getByRole("button", { name: "Anterior" }).click();
  await expect(sentRequests.locator(".friendRequestRow")).toHaveCount(20);
  await other.close(); console.log("PASS friend code, copy, acceptance, nudge, mute, ending, reject, cancel and pagination");
  await page.keyboard.press("Escape");
  const projectButton = page.getByRole("button", { name: "Abrir el proyecto Ana" });
  await projectButton.focus(); await projectButton.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Ana" })).toBeVisible();
  await page.evaluate(() => { location.hash = "#work"; });
  const input = page.getByRole("textbox", { name: "Título de la nueva tarea" });
  await input.fill("Actividad Spark"); await input.press("Enter");
  await expect(page.locator(".taskItem", { hasText: "Actividad Spark" })).toBeVisible();
  await page.getByRole("button", { name: /Abrir rachas y puntos/ }).click();
  await expect(panel.locator(".streakHeroMain b")).toHaveText("4", { timeout: 30000 });
  await expect(panel.locator(".streakStats")).toContainText("8Puntos disponibles");
  await page.screenshot({ path: out + "/active.png", fullPage: true });
  console.log("PASS real work credits a point and resumes the flame");
  if (errors.length) throw new Error("Browser errors: " + errors.join("; "));
  console.log("PASS no browser application errors");
} catch (error) {
  console.error(error);
  if (browser) for (const ctx of browser.contexts()) for (const page of ctx.pages()) {
    console.error((await page.locator("body").innerText().catch(() => "")).slice(-7000));
    await page.screenshot({ path: out + "/failure-" + browser.contexts().indexOf(ctx) + ".png" }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  preview.kill();
}
