import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp, writeBatch } from "firebase/firestore";
import { createAccount, resetEmulators, seedProject, signIn, type TestAccount } from "./helpers";

test.setTimeout(120_000);
test.beforeEach(async () => { await resetEmulators(); });
async function seedStreak(account: TestAccount) {
  const today = Math.floor(Date.now() / 86400000);
  const env = await initializeTestEnvironment({ projectId: "vigilia-panel", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const day of [today - 4, today - 3, today - 2]) await setDoc(doc(db, "users", account.uid, "activeDays", String(day)), { day, recordedAt: Timestamp.fromMillis(day * 86400000 + 12 * 3600000) });
    await setDoc(doc(db, "users", account.uid, "progress", "summary"), { activeDays: 3, lastRecordedDay: today - 2, updatedAt: Timestamp.now() });
    await setDoc(doc(db, "users", account.uid, "progress", "wallet"), { balance: 25, earned: 25, spent: 0, lastAward: "seed", lastPurchase: "", updatedAt: Timestamp.now() });
    await setDoc(doc(db, "users", account.uid, "streak", "state"), { version: 1, managedFrom: today - 4, lastSettledDay: today - 2, protectors: 1, shieldStart: -1, shieldEnd: -1, current: 3, best: 3, evaluatedDay: today - 1, badges: [] });
  });
  await env.cleanup();
}

test("personal calendar, protection and purchases work on desktop and phone @mobile @cross", async ({ page }, testInfo) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "streak-home", name: "Camino" });
  await seedStreak(ana);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, ana);
  await page.getByRole("button", { name: /Abrir rachas y puntos/ }).click();
  const panel = page.getByRole("dialog", { name: "Rachas y puntos" });
  await expect(panel.getByText("Tu racha está a salvo")).toBeVisible();
  await expect(panel.locator(".streakHeroMain b")).toHaveText("3");
  await expect(panel.locator(".streakStats")).toContainText("25Puntos disponibles");
  await expect(panel.locator(".streakDay.is-protected")).toHaveCount(1);
  await panel.locator(".streakDay.is-protected").click();
  await expect(panel.locator(".streakDayDetail")).toContainText("Día protegido");
  await panel.getByRole("button", { name: "Comprar · 3 puntos", exact: true }).click();
  await panel.getByRole("button", { name: "Confirmar · 3 puntos", exact: true }).click();
  await expect(panel.getByText("Protector guardado.", { exact: false })).toBeVisible();
  await expect(panel.locator(".streakStats")).toContainText("22Puntos disponibles");
  await panel.getByRole("button", { name: "Comprar · 15 puntos", exact: true }).click();
  await expect(panel.getByText(/cubre hoy y las seis fechas/i)).toBeVisible();
  await panel.getByRole("button", { name: "Confirmar · 15 puntos", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Escudo activo", exact: true })).toBeDisabled();
  await expect(panel.locator(".streakStats")).toContainText("7Puntos disponibles");
  await expect(panel.getByRole("heading", { name: "Insignias ganadas" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.locator(".streakCalendar").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("streak-calendar.png"), fullPage: true });
  await panel.evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath("streak-personal.png"), fullPage: true });
  await panel.getByRole("tab", { name: "Personal", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(panel.getByRole("tab", { name: "Amigos", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false }));
  const downloadPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Compartir mi racha" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("mi-racha-cowork.png");
  await download.saveAs(testInfo.outputPath("mi-racha-cowork.png"));
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("creating a project lights today's streak without awarding points @cross", async ({ page }) => {
  const ana = await createAccount("Ana");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, ana, { keepCreateDialog: true });
  const dialog = page.locator("dialog.projectCreateDialog[open]");
  await dialog.getByPlaceholder("Nombre del proyecto").fill("Racha nueva");
  await dialog.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(dialog.getByRole("heading", { name: "Racha nueva está listo" })).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  // The streak button reflects the credited day; the celebration is claimed once for it.
  await expect(page.getByRole("button", { name: /^Abrir rachas y puntos: 1 días, 0 puntos/ })).toBeVisible({ timeout: 30_000 });
  const celebration = page.getByRole("status", { name: "Racha actualizada" });
  await expect(celebration).toContainText("1 día de racha", { timeout: 15_000 });
  await celebration.getByRole("button", { name: "Cerrar celebración" }).click();
  await page.getByRole("button", { name: /Abrir rachas y puntos/ }).click();
  const panel = page.getByRole("dialog", { name: "Rachas y puntos" });
  await expect(panel.locator(".streakHeroMain b")).toHaveText("1");
  await expect(panel.locator(".streakDaily")).toContainText("Actividad de hoy registrada");
  await expect(panel.locator(".streakDaily")).toContainText("0/3 puntos hoy");
  await expect(panel.locator(".streakStats")).toContainText("1Días activos");
  await expect(panel.locator(".streakStats")).toContainText("0Puntos disponibles");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Actividad/ }).click();
  await page.getByRole("tab", { name: "Actividad", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Centro de actividad" })).toContainText("creó el proyecto «Racha nueva»");
});

test("friend codes require explicit acceptance and support nudges and leaving @mobile @cross", async ({ page, browser }, testInfo) => {
  const ana = await createAccount("Ana"), bob = await createAccount("Bruno");
  await seedProject(ana, { id: "ana-project", name: "Ana" });
  await seedProject(bob, { id: "bob-project", name: "Bruno" });
  await signIn(page, ana);
  await page.getByRole("button", { name: /Abrir rachas y puntos/ }).click();
  let panel = page.getByRole("dialog", { name: "Rachas y puntos" });
  await panel.getByRole("tab", { name: "Amigos", exact: true }).click();
  await expect(panel.getByLabel("Mi código de amigo")).toHaveValue(/^CW-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  const myCode = await panel.getByLabel("Mi código de amigo").inputValue();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true,
    value: { writeText: async (text: string) => { sessionStorage.setItem("copied-friend-code", text); } } }));
  await panel.getByRole("button", { name: "Copiar", exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("copied-friend-code"))).toBe(myCode);
  const other = await browser.newContext(), friend = await other.newPage();
  try {
    await signIn(friend, bob);
    await friend.getByRole("button", { name: /Abrir rachas y puntos/ }).click();
    const friendsPanel = friend.getByRole("dialog", { name: "Rachas y puntos" });
    await friendsPanel.getByRole("tab", { name: "Amigos", exact: true }).click();
    await expect(friendsPanel.getByLabel("Mi código de amigo")).toHaveValue(/^CW-/);
    const code = await friendsPanel.getByLabel("Mi código de amigo").inputValue();
    await panel.getByLabel("Agregar amigo por código").fill("wrong");
    await panel.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("código de amigo válido");
    await panel.getByLabel("Agregar amigo por código").fill(myCode);
    await panel.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("propio código");
    await panel.getByLabel("Agregar amigo por código").fill(code.toLowerCase().replaceAll("-", " "));
    await panel.getByLabel("Agregar amigo por código").press("Enter");
    await expect(panel.locator(".friendRequestPreview")).toContainText("Bruno");
    await expect(panel.locator(".streakFriend")).toHaveCount(0);
    await panel.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
    await expect(friend.getByRole("button", { name: /Abrir rachas y puntos/ })).toHaveAttribute("aria-label", /1 solicitudes recibidas/);
    const incoming = friendsPanel.getByRole("region", { name: "Solicitudes recibidas" });
    await expect(incoming).toContainText("Ana");
    await incoming.getByRole("button", { name: "Aceptar", exact: true }).click();
    await expect(panel.locator(".streakFriend")).toContainText("Bruno");
    // "Dar toque" sends at once with a phrase picked at random from the preset list.
    const phrases = /Un toque amistoso|Tú puedes|No dejemos que se apague|Te espero hoy|gran equipo|Todavía hay tiempo/;
    await panel.getByRole("button", { name: "Dar toque", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Toque enviado hoy" })).toBeDisabled();
    await expect(panel.locator(".nudgeLoop")).toContainText(phrases);
    // The recipient sees the phrase (in Amigos and in Notificaciones) and answers with a preset reply.
    await expect(friendsPanel.locator(".streakNudge")).toContainText("Ana");
    await expect(friendsPanel.locator(".streakNudge")).toContainText(phrases);
    await expect(friend.locator(".activityButton")).toHaveAttribute("aria-label", /sin leer/);
    await friendsPanel.getByRole("group", { name: "Responder a Ana" }).getByRole("button", { name: "¡Voy! 🚀" }).click();
    await expect(friendsPanel.locator(".streakNudge")).toHaveCount(0);
    // The sender sees it was seen and the reply.
    await expect(panel.locator(".nudgeLoop")).toContainText("Visto");
    await expect(panel.locator(".nudgeLoop")).toContainText("Bruno respondió: ¡Voy! 🚀");
    await friendsPanel.getByRole("button", { name: "Silenciar toques" }).click();
    await expect(friendsPanel.getByRole("button", { name: "Activar toques" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("streak-friends.png"), fullPage: true });
    await friendsPanel.getByRole("button", { name: "Finalizar", exact: true }).click();
    await friendsPanel.getByRole("button", { name: "Finalizar racha compartida", exact: true }).click();
    await expect(friendsPanel.locator(".streakFriend")).toHaveCount(0);
    await expect(panel.locator(".streakFriend")).toHaveCount(0);
  } finally { await other.close().catch(() => undefined); }
});

test("Spark backend requires authentication", async ({ request }) => {
  const result = await request.get("http://127.0.0.1:8080/v1/projects/vigilia-panel/databases/(default)/documents/users/private/streak/state");
  expect(result.status()).toBe(403);
  expect((await result.json()).error.status).toBe("PERMISSION_DENIED");
});
test("old streak links show retirement information and open Friends", async ({ page }) => {
  const ana = await createAccount("Ana"); await seedProject(ana, { id: "legacy-home", name: "Ana" });
  await signIn(page, ana, { path: "/?streakInvite=" + "a".repeat(48) });
  const notice = page.getByRole("dialog", { name: "Las invitaciones ahora funcionan con códigos de amigo" });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("button", { name: /Aceptar/ })).toHaveCount(0);
  await notice.getByRole("button", { name: "Ir a Amigos" }).click();
  await expect(page.getByRole("tab", { name: "Amigos", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Mi código de amigo")).toHaveValue(/^CW-/);
  expect(page.url()).not.toContain("streakInvite");
});


test("received requests paginate twenty items and retain page navigation", async ({ page }) => {
  const ana = await createAccount("Ana"), bob = await createAccount("Bruno");
  await seedProject(bob, { id: "inbox-home", name: "Bruno" });
  const env = await initializeTestEnvironment({ projectId: "vigilia-panel", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
  try {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore(), batch = writeBatch(db);
      for (let i = 0; i < 24; i++) batch.set(doc(db, "streakInvites", i.toString(16).padStart(48, "0")), {
        version: 2, ownerUid: ana.uid, person: { uid: ana.uid, name: "Ana " + i, photoURL: "" },
        recipientUid: bob.uid, recipientPerson: { uid: bob.uid, name: "Bruno", photoURL: "" }, recipientCode: "22222222",
        status: "rejected", createdAt: Timestamp.fromMillis(Date.now() - i * 1000), expiresAt: Timestamp.fromMillis(Date.now() + 86400000),
      });
      await batch.commit();
    });
  } finally { await env.cleanup(); }
  await signIn(page, bob);
  await page.getByRole("button", { name: /Abrir rachas y puntos/ }).click();
  const panel = page.getByRole("dialog", { name: "Rachas y puntos" });
  await panel.getByRole("tab", { name: "Amigos", exact: true }).click();
  const incoming = panel.getByRole("region", { name: "Solicitudes recibidas" });
  await expect(incoming.locator(".friendRequestRow")).toHaveCount(20);
  await incoming.getByRole("button", { name: "Siguiente" }).click();
  await expect(incoming.locator(".friendRequestRow")).toHaveCount(4);
  await incoming.getByRole("button", { name: "Anterior" }).click();
  await expect(incoming.locator(".friendRequestRow")).toHaveCount(20);
});
