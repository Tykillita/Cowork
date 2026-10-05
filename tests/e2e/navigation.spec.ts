import { expect, test } from "@playwright/test";
import { createAccount, openProject, removeMember, resetEmulators, seedProject, signIn, signOut } from "./helpers";

test.beforeEach(async () => { await resetEmulators(); });

test("fresh login with zero projects opens the picker with the create dialog @cross", async ({ page }) => {
  const ana = await createAccount("Ana");
  await signIn(page, ana, { keepCreateDialog: true });
  await expect(page.getByRole("heading", { name: "Añadir un proyecto" })).toBeVisible();
  await expect(page).not.toHaveURL(/coworkAction/);
  // The create action is consumed: reloading does not reopen it.
  await page.reload();
  await expect(page.locator(".projectPicker:not([aria-busy])")).toBeVisible();
  await expect(page.locator("dialog.projectCreateDialog[open]")).toHaveCount(0);
});

test("fresh login with one or several projects always lands on the picker @cross", async ({ page }) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "uno", name: "Uno" });
  await signIn(page, ana);
  await expect(page.locator(".projectPicker:not([aria-busy])")).toBeVisible();
  await expect(page.locator(".app-shell:not([aria-busy])")).toHaveCount(0);

  await openProject(page, "Uno");
  await signOut(page);
  await seedProject(ana, { id: "dos", name: "Dos" });
  await signIn(page, ana);
  await expect(page.locator(".projectPicker:not([aria-busy])")).toBeVisible();
});

test("reload keeps the project and section; switching project persists the picker @cross", async ({ page }) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "uno", name: "Uno" });
  await signIn(page, ana);
  await openProject(page, "Uno");
  for (const section of ["#work", "#branches-page", "#settings-page", "#home"]) {
    await page.evaluate((hash) => { window.location.hash = hash; }, section);
    await page.reload();
    await expect(page.locator(".app-shell:not([aria-busy])")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${section}$`));
    await expect(page.locator(`[data-page="${section.slice(1)}"]`).first()).toBeVisible();
  }
  await page.getByRole("button", { name: /Cambiar proyecto|Cambiar/ }).first().click();
  await expect(page.locator(".projectPicker:not([aria-busy])")).toBeVisible();
  await page.reload();
  await expect(page.locator(".projectPicker:not([aria-busy])")).toBeVisible();
});

test("losing access returns to the picker, live and after reload", async ({ page }) => {
  const owner = await createAccount("Olga");
  const ana = await createAccount("Ana");
  await seedProject(owner, { id: "uno", name: "Uno", members: [ana] });
  await signIn(page, ana);
  await openProject(page, "Uno");
  await removeMember("uno", ana.uid);
  await expect(page.locator(".projectPicker:not([aria-busy])")).toBeVisible();
  await expect(page.locator("#toast")).toContainText("ya no está disponible");
  await page.reload();
  await expect(page.locator(".projectPicker:not([aria-busy])")).toBeVisible();
});

test("page parameters keep the section instead of sending it home", async ({ page }) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "uno", name: "Uno" });
  await signIn(page, ana);
  await openProject(page, "Uno");
  await page.evaluate(() => { window.location.hash = "#work?foo=1"; });
  await expect(page.locator('[data-page="work"]').first()).toBeVisible();
  await page.reload();
  await expect(page.locator(".app-shell:not([aria-busy])")).toBeVisible();
  await expect(page).toHaveURL(/#work\?foo=1$/);
  await expect(page.locator('[data-page="work"]').first()).toBeVisible();
});
