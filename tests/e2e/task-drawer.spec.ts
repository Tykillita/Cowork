import { expect, test, type Page } from "@playwright/test";
import { createAccount, openProject, resetEmulators, seedProject, seedTasks, signIn, type TestAccount } from "./helpers";

let ana: TestAccount;

test.beforeEach(async () => {
  await resetEmulators();
  ana = await createAccount("Ana");
  await seedProject(ana, { id: "uno", name: "Uno" });
  await seedTasks("uno", [{ id: "t1", title: "Preparar demo", assignee: ana }, { id: "t2", title: "Otra tarea" }], ana);
});

async function openTask(page: Page, id = "t1") {
  await signIn(page, ana);
  await openProject(page, "Uno");
  await page.evaluate((taskId) => { window.location.hash = `#work?task=${taskId}`; }, id);
  const drawer = page.getByRole("dialog", { name: /^Tarea / });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("status").first()).toContainText("Cambios guardados");
  return drawer;
}

test("a deep link opens the task; every field saves and shows on the card", async ({ page }) => {
  const drawer = await openTask(page);
  const saved = drawer.locator(".drawerSaveState");

  const titleField = drawer.locator(".drawerTitleField textarea");
  await titleField.fill("Preparar la demo final");
  await titleField.press("Enter");
  await expect(saved).toHaveText("Cambios guardados");

  await drawer.getByRole("combobox", { name: "Prioridad" }).selectOption("alta");
  await drawer.getByLabel("Fecha límite").fill("2031-05-10");
  await drawer.getByRole("combobox", { name: "Fase" }).fill("Lanzamiento");
  await drawer.getByRole("combobox", { name: "Fase" }).press("Enter");
  await drawer.getByRole("combobox", { name: "Rama" }).fill("con espacio");
  await drawer.getByRole("combobox", { name: "Rama" }).press("Enter");
  await expect(drawer.locator(".drawerFieldError")).toContainText("espacios");
  await drawer.getByRole("combobox", { name: "Rama" }).fill("feature/demo");
  await drawer.getByRole("combobox", { name: "Rama" }).press("Enter");

  const description = drawer.getByRole("textbox", { name: "Descripción" });
  await description.fill("Mostrar el flujo completo.");
  await drawer.getByRole("button", { name: "Guardar descripción" }).click();
  await expect(drawer.getByRole("button", { name: "Guardar descripción" })).toHaveCount(0);

  for (const step of ["Guion", "Datos", "Ensayo"]) {
    await drawer.getByRole("textbox", { name: "Nuevo paso" }).fill(step);
    await drawer.getByRole("button", { name: "Añadir", exact: true }).click();
    await expect(drawer.locator(".drawerSteps li", { hasText: "" }).filter({ has: page.locator(`input[value="${step}"]`) })).toHaveCount(1);
  }
  await drawer.getByRole("checkbox", { name: "Hecho: Guion" }).check();
  await expect(drawer.locator(".drawerSectionHead small").nth(1)).toHaveText("1/3");
  await expect(saved).toHaveText("Cambios guardados");

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/#work$/);
  const card = page.locator(".taskItem", { hasText: "Preparar la demo final" });
  await expect(card.getByLabel("1 de 3 pasos hechos")).toBeVisible();
  await expect(card).toContainText("Prioridad alta");
  await expect(card).toContainText("Vence 10 may");
  await expect(card).toContainText("feature/demo");

  // Everything survives a reload and the activity tells what happened.
  await page.reload();
  await expect(page.locator(".taskItem", { hasText: "Preparar la demo final" })).toContainText("Prioridad alta");
  await page.evaluate(() => { window.location.hash = "#home"; });
  await expect(page.locator(".homeActivity")).toContainText("actualizó la lista (1/3)");
});

test("deleting asks inline and removes the task", async ({ page }) => {
  const drawer = await openTask(page, "t2");
  await drawer.getByRole("button", { name: "Eliminar tarea" }).click();
  await drawer.getByRole("group", { name: "Confirmar eliminación" }).getByRole("button", { name: "Cancelar" }).click();
  await drawer.getByRole("button", { name: "Eliminar tarea" }).click();
  await drawer.getByRole("group", { name: "Confirmar eliminación" }).getByRole("button", { name: "Eliminar tarea" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.locator(".taskItem", { hasText: "Otra tarea" })).toHaveCount(0);
});

test("a link to a deleted task just shows the plan", async ({ page }) => {
  await signIn(page, ana);
  await openProject(page, "Uno");
  await page.evaluate(() => { window.location.hash = "#work?task=nada"; });
  await expect(page.locator(".taskItem")).toHaveCount(2);
  await expect(page).toHaveURL(/#work$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("on a phone the drawer is a centred modal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const drawer = await openTask(page);
  const box = (await drawer.boundingBox())!;
  expect(box.x).toBeGreaterThan(0);
  expect(box.x + box.width).toBeLessThan(390);
  await page.screenshot({ path: "test-results/drawer-390.png" });
});

test("drawer on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const drawer = await openTask(page);
  // Measured once the slide-in has finished.
  await expect.poll(async () => { const box = (await drawer.boundingBox())!; return Math.round(box.x + box.width); }).toBe(1280);
  await page.screenshot({ path: "test-results/drawer-1280.png" });
});

test("my overdue task is a notice that opens it", async ({ page }) => {
  await seedTasks("uno", [{ id: "t3", title: "Entregar informe", assignee: ana, order: 9_000_000, details: { dueDate: "2026-01-01", timeZone: "UTC", dueAt: "2026-01-02T00:00:00.000Z", description: "", priority: "media", checklist: "", branch: "", createdAt: "", createdByUid: "" } }], ana);
  await signIn(page, ana);
  await openProject(page, "Uno");
  await page.locator(".activityButton").click();
  const notice = page.locator(".activityEntry", { hasText: "Vencido: tarea «Entregar informe»" });
  await expect(notice).toBeVisible();
  await notice.click();
  await expect(page.getByRole("dialog", { name: "Tarea Entregar informe" })).toBeVisible();
});
