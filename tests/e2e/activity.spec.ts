import { expect, test, type Page } from "@playwright/test";
import { createAccount, openProject, resetEmulators, seedAccessLink, seedActivityEvents, seedProject, signIn, signOut, type TestAccount } from "./helpers";

let olga: TestAccount;
let ana: TestAccount;

test.beforeEach(async () => {
  await resetEmulators();
  olga = await createAccount("Olga");
  ana = await createAccount("Ana");
});

async function createTask(page: Page, title: string) {
  await page.evaluate(() => { window.location.hash = "#work"; });
  const input = page.getByRole("textbox", { name: "Título de la nueva tarea" });
  await input.fill(title);
  await page.getByRole("button", { name: "Agregar tarea" }).click();
  await expect(page.locator(".taskRow", { hasText: title })).toBeVisible();
}

test("activity from another member is unread until opened or marked; read state syncs", async ({ browser }) => {
  // The project deadline ends within 24 hours, so a delivery notice appears once.
  const endsAt = new Date(Date.now() + 6 * 3_600_000).toISOString();
  await seedProject(olga, { id: "uno", name: "Uno", members: [ana], schedule: { startDate: "2026-01-01", endDate: "2026-01-01", timeZone: "UTC", startsAt: "2026-01-01T00:00:00.000Z", endsAt } });
  const olgaContext = await browser.newContext();
  const anaContext = await browser.newContext();
  const olgaPage = await olgaContext.newPage();
  const anaPage = await anaContext.newPage();
  await signIn(olgaPage, olga);
  await signIn(anaPage, ana);
  await openProject(anaPage, "Uno");
  await createTask(anaPage, "Preparar demo");

  const button = olgaPage.locator(".activityButton");
  await expect(button).toHaveAttribute("aria-label", /sin leer/);
  await button.click();
  await expect(olgaPage.locator(".activityEntry", { hasText: "Vence en menos de 24 h" })).toHaveCount(1);
  await olgaPage.getByRole("tab", { name: "Actividad" }).click();
  const entry = olgaPage.locator(".activityEntry", { hasText: "Preparar demo" });
  await expect(entry).toContainText("Ana");
  await expect(entry).toContainText("creó la tarea");
  await expect(entry).toHaveClass(/isUnread/);

  await olgaPage.getByRole("button", { name: "Marcar como leído" }).click();
  await expect(entry).not.toHaveClass(/isUnread/);
  await expect(button).not.toHaveAttribute("aria-label", /sin leer/);

  // Same account on another device sees the same read state.
  const secondDevice = await (await browser.newContext()).newPage();
  await signIn(secondDevice, olga);
  await expect(secondDevice.locator(".activityButton")).not.toHaveAttribute("aria-label", /sin leer/);
  await olgaContext.close();
  await anaContext.close();
});

test("owners see the pending request count; decisions reach the requester", async ({ page }) => {
  await seedProject(olga, { id: "uno", name: "Uno" });
  const link = await seedAccessLink("uno", "Uno", olga.uid);
  await signIn(page, ana, { path: link });
  await page.getByRole("button", { name: "Solicitar acceso" }).click();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await signOut(page);

  await signIn(page, olga);
  await expect(page.locator(".activityCount")).toHaveText("1");
  await page.locator(".activityButton").click();
  await page.locator(".activityEntry", { hasText: "Ana solicita acceso" }).click();
  await expect(page).toHaveURL(/#settings-page$/);
  await page.locator(".accessRequestRow", { hasText: "Ana" }).getByRole("button", { name: "Aprobar" }).click();
  await expect(page.locator(".activityCount")).toHaveCount(0);
  await signOut(page);

  await signIn(page, ana);
  await page.locator(".activityButton").click();
  await expect(page.locator(".activityEntry", { hasText: "Te aprobaron en Uno" })).toBeVisible();
});

test("paging one project's activity keeps the other project's entries visible", async ({ page }) => {
  await seedProject(olga, { id: "uno", name: "Uno" });
  await seedProject(olga, { id: "dos", name: "Dos" });
  await seedActivityEvents("uno", 16, olga);
  await seedActivityEvents("dos", 2, olga);
  await signIn(page, olga);
  await page.locator(".activityButton").click();
  await page.getByRole("tab", { name: "Actividad" }).click();
  const entries = page.getByRole("tabpanel", { name: "Actividad" }).locator(".activityEntry");
  await expect(entries).toHaveCount(17);
  await page.locator(".activityFilter select").selectOption("uno");
  await expect(entries).toHaveCount(15);
  await page.getByRole("button", { name: "Cargar actividad anterior" }).click();
  await expect(entries).toHaveCount(16);
  await page.locator(".activityFilter select").selectOption("dos");
  await expect(entries).toHaveCount(2);
});
