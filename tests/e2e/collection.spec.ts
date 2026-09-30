import { expect, test } from "@playwright/test";
import { createAccount, openProject, resetEmulators, seedProject, signIn } from "./helpers";

test.beforeEach(async () => { await resetEmulators(); });

test("real work unlocks the first reward once per UTC day; the choice is validated and shown", async ({ page }) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "uno", name: "Uno" });
  await seedProject(ana, { id: "dos", name: "Dos" });
  await signIn(page, ana);

  await page.getByRole("button", { name: /Abrir perfil/ }).click();
  await page.getByRole("button", { name: "Mi colección" }).click();
  const dialog = page.locator(".collectionDialog");
  await expect(dialog.locator(".collectionStats")).toContainText("0Días activos");
  await expect(dialog.locator(".collectionToday")).toContainText("Todavía no hay actividad hoy");
  await dialog.locator(".collectionItem", { hasText: "Valle al amanecer" }).click();
  await expect(dialog.getByRole("button", { name: "Usar esta combinación" })).toBeDisabled();
  await expect(dialog).toContainText("todavía no está desbloqueada");
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();

  // Opening projects and changing preferences do not count; creating tasks does, once per day.
  await openProject(page, "Uno");
  await page.evaluate(() => { window.location.hash = "#work"; });
  const input = page.getByRole("textbox", { name: "Título de la nueva tarea" });
  for (const title of ["Primera", "Segunda"]) {
    await input.fill(title);
    await input.press("Enter");
    await expect(page.locator(".taskRow", { hasText: title })).toBeVisible();
  }
  await page.getByRole("button", { name: /Abrir perfil/ }).click();
  await page.getByRole("button", { name: "Mi colección" }).click();
  await expect(dialog.locator(".collectionStats")).toContainText("1Días activos");
  await expect(dialog.locator(".collectionStats")).toContainText("1Racha actual");
  await expect(dialog.locator(".collectionToday")).toContainText("Actividad de hoy registrada");
  await dialog.locator(".collectionItem", { hasText: "Valle al amanecer" }).click();
  await dialog.getByRole("button", { name: "Usar esta combinación" }).click();
  await expect(dialog).toContainText("Tu escena quedó guardada");
  // Locked items stay unavailable.
  await dialog.locator(".collectionItem", { hasText: "Gato explorador" }).click();
  await expect(dialog.getByRole("button", { name: "Usar esta combinación" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();

  await page.evaluate(() => { window.location.hash = "#home"; });
  await expect(page.locator(".ambientCard .clockLabel")).toHaveText("Valle al amanecer");
});

test("work earns up to three points a day; the shop charges once and bought items can be equipped", async ({ page }) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "uno", name: "Uno" });
  await signIn(page, ana);
  await openProject(page, "Uno");
  await page.evaluate(() => { window.location.hash = "#work"; });
  const input = page.getByRole("textbox", { name: "Título de la nueva tarea" });
  for (const title of ["Una", "Dos", "Tres", "Cuatro"]) {
    await input.fill(title);
    await input.press("Enter");
    await expect(page.locator(".taskRow", { hasText: title })).toBeVisible();
    // Reaching 3/3 is explained right away.
    if (title === "Tres") await expect(page.locator("#toast")).toContainText("llegaste al máximo de 3 puntos por hoy");
  }

  await page.getByRole("button", { name: /Abrir perfil/ }).click();
  await page.getByRole("button", { name: "Mi colección" }).click();
  const dialog = page.locator(".collectionDialog");
  const points = dialog.locator(".collectionPoints");
  await expect(points).toContainText("3Saldo");
  await expect(dialog.locator(".collectionToday")).toContainText("Puntos de hoy: 3/3");

  // Top up the wallet directly in the emulator so a purchase is possible today.
  const { initializeTestEnvironment } = await import("@firebase/rules-unit-testing");
  const { readFileSync } = await import("node:fs");
  const { doc, getDoc, setDoc } = await import("firebase/firestore");
  const env = await initializeTestEnvironment({ projectId: "vigilia-panel", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (context) => {
    const ref = doc(context.firestore(), "users", ana.uid, "progress", "wallet");
    const wallet = (await getDoc(ref)).data()!;
    await setDoc(ref, { ...wallet, balance: 13, earned: 13 });
  });
  await expect(points).toContainText("13Saldo");

  await dialog.getByRole("tab", { name: "Tienda" }).click();
  await expect(dialog.locator(".shopItem", { hasText: "Pinar bajo la aurora" }).getByRole("button", { name: "Faltan 12 puntos" })).toBeDisabled();
  const winter = dialog.locator(".shopItem", { hasText: "Farolero invernal" });
  await winter.getByRole("button", { name: "Comprar · 10 puntos" }).click();
  await winter.getByRole("button", { name: "Canjear 10 puntos" }).click();
  await expect(dialog).toContainText("«Farolero invernal» ya es tuyo");
  await expect(points).toContainText("3Saldo");
  // The history explains the balance: 13 earned, 10 spent.
  await expect(dialog.locator(".collectionLedger")).toContainText("Gastados 10");
  await expect(dialog.locator(".collectionLedger")).toContainText("Farolero invernal");
  await expect(winter).toContainText("En tu colección");
  await env.withSecurityRulesDisabled(async (context) => {
    const wallet = (await getDoc(doc(context.firestore(), "users", ana.uid, "progress", "wallet"))).data()!;
    expect(wallet).toMatchObject({ balance: 3, earned: 13, spent: 10, lastPurchase: "farolero-invernal" });
  });
  await env.cleanup();

  // Bought and day-unlocked items live together in the collection.
  await dialog.getByRole("tab", { name: "Colección" }).click();
  await dialog.locator(".collectionItem", { hasText: "Farolero invernal" }).click();
  await dialog.getByRole("button", { name: "Usar esta combinación" }).click();
  await expect(dialog).toContainText("Tu escena quedó guardada");
  await expect(dialog.locator(".collectionItem", { hasText: "Espíritu del bosque" })).toHaveCount(0);
});

test("migration: dry run first, unique names linked, ambiguous and unknown left for review", async ({ page }) => {
  const olga = await createAccount("Olga");
  const ana = await createAccount("Ana");
  const anaBis = await createAccount("Anabel");
  await seedProject(olga, { id: "uno", name: "Uno", members: [ana, anaBis] });
  // Legacy tasks: only a name label, no account reference, no revision.
  const { initializeTestEnvironment } = await import("@firebase/rules-unit-testing");
  const { readFileSync } = await import("node:fs");
  const { doc, setDoc } = await import("firebase/firestore");
  const env = await initializeTestEnvironment({ projectId: "vigilia-panel", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // Two members share the display name "Ana" in the directory history.
    await setDoc(doc(db, "projects", "uno", "members", anaBis.uid), { uid: anaBis.uid, email: anaBis.email, emailLower: anaBis.email, name: "Ana", role: "member", status: "active", joinedAt: "2026-01-01", accessRequestId: anaBis.uid });
    await setDoc(doc(db, "projects", "uno", "tasks", "t1"), { id: "t1", order: 1, phase: "General", title: "De Olga", status: "Pendiente", assignee: "olga" });
    await setDoc(doc(db, "projects", "uno", "tasks", "t2"), { id: "t2", order: 2, phase: "General", title: "De alguna Ana", status: "Pendiente", assignee: "Ana" });
    await setDoc(doc(db, "projects", "uno", "tasks", "t3"), { id: "t3", order: 3, phase: "General", title: "De Zoe", status: "Pendiente", assignee: "Zoe" });
  });
  await env.cleanup();

  await signIn(page, olga);
  await openProject(page, "Uno");
  await page.evaluate(() => { window.location.hash = "#settings-page"; });
  await page.getByRole("button", { name: "Simular" }).click();
  const plan = page.locator(".migrationPlan");
  await expect(plan).toContainText("«De Olga» → Olga");
  await expect(plan).toContainText("«De alguna Ana» · “Ana” coincide con varios miembros");
  await expect(plan).toContainText("«De Zoe» · “Zoe” no coincide con ningún miembro");
  await page.getByRole("button", { name: "Aplicar cambios" }).click();
  await expect(page.getByText("Datos del equipo actualizados")).toBeVisible();

  await page.evaluate(() => { window.location.hash = "#work"; });
  await expect(page.locator(".taskRow", { hasText: "De Olga" }).getByRole("button", { name: /: Olga\./ })).toBeVisible();
  await expect(page.locator(".taskRow", { hasText: "De alguna Ana" }).getByRole("button", { name: /Ana · por revisar/ })).toBeVisible();
  await expect(page.locator(".taskRow", { hasText: "De Zoe" }).getByRole("button", { name: /Zoe · por revisar/ })).toBeVisible();

  // Repeatable: a second dry run finds nothing left to link.
  await page.evaluate(() => { window.location.hash = "#settings-page"; });
  await page.getByRole("button", { name: "Simular" }).click();
  await expect(plan).not.toContainText("Tareas a enlazar");
  await expect(plan).toContainText("Por revisar manualmente: 2");
});
