import { expect, test } from "@playwright/test";
import { createAccount, openProject, resetEmulators, seedProject, signIn, type TestAccount } from "./helpers";

let olga: TestAccount;
let ana: TestAccount;

test.beforeEach(async () => {
  await resetEmulators();
  olga = await createAccount("Olga");
  ana = await createAccount("Ana");
  await seedProject(olga, { id: "uno", name: "Uno", members: [ana] });
});

async function goToWork(page: import("@playwright/test").Page, account: TestAccount) {
  await signIn(page, account);
  await openProject(page, "Uno");
  await page.evaluate(() => { window.location.hash = "#work"; });
  await expect(page.getByRole("heading", { name: "Plan de trabajo" })).toBeVisible();
  await expect(page.locator("#taskHint")).toContainText("Cualquier miembro");
}

test("create, assign with the member picker, filter and release by account", async ({ page }) => {
  await goToWork(page, olga);
  const input = page.getByRole("textbox", { name: "Título de la nueva tarea" });
  await input.fill("Diseñar portada");
  await page.getByRole("button", { name: "Agregar tarea" }).click();
  await expect(input).toHaveValue("");
  const row = page.locator(".taskItem", { hasText: "Diseñar portada" });
  await expect(row).toBeVisible();

  // Choose Ana from the accessible menu (keyboard).
  await row.getByRole("button", { name: /Responsable de Diseñar portada/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "Ana" })).toBeVisible();
  // Options: Sin asignar, Ana, Olga.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio", { name: "Ana" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(row.getByRole("button", { name: /Responsable de Diseñar portada: Ana/ })).toBeVisible();

  await input.fill("Revisar textos");
  await input.press("Enter");
  const second = page.locator(".taskItem", { hasText: "Revisar textos" });
  await second.getByRole("button", { name: "Asignarme" }).click();
  await expect(second.getByRole("button", { name: /Olga/ })).toBeVisible();
  await expect(second.getByRole("combobox", { name: /Estado/ })).toHaveValue("En curso");

  await page.getByRole("button", { name: "Mis tareas", exact: true }).click();
  await expect(page.locator(".taskItem")).toHaveCount(1);
  await expect(page.locator(".taskItem")).toContainText("Revisar textos");
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("Pendiente");
  await expect(page.getByText("Ninguna tarea coincide con los filtros.")).toBeVisible();
  await page.getByRole("button", { name: "Quitar filtros" }).click();
  await expect(page.locator(".taskItem")).toHaveCount(2);

  await second.getByRole("button", { name: "Soltar" }).click();
  await expect(second.getByRole("button", { name: /Sin asignar/ })).toBeVisible();
});

test("a failed save keeps the typed text and shows the error", async ({ page, context }) => {
  await goToWork(page, ana);
  const input = page.getByRole("textbox", { name: "Título de la nueva tarea" });
  await input.fill("Tarea sin conexión");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Agregar tarea" }).click();
  await expect(page.locator(".taskCreate + .projectSettingsError, [role=alert]").first()).toBeVisible({ timeout: 20_000 });
  await expect(input).toHaveValue("Tarea sin conexión");
  await context.setOffline(false);
});

test("concurrent edits: a stale copy gets a conflict and nothing is overwritten", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const olgaPage = await first.newPage();
  const anaPage = await second.newPage();
  await goToWork(olgaPage, olga);
  await olgaPage.getByRole("textbox", { name: "Título de la nueva tarea" }).fill("Compartida");
  await olgaPage.getByRole("button", { name: "Agregar tarea" }).click();
  await goToWork(anaPage, ana);
  await expect(anaPage.locator(".taskItem", { hasText: "Compartida" })).toBeVisible();

  // Ana keeps the copy she is looking at (same client code the app uses).
  await anaPage.evaluate(async () => {
    const workboard = await import("/src/features/workboard/firestoreWorkboard.ts");
    await new Promise<void>((resolve) => {
      void workboard.listenForTasks("uno", (tasks) => {
        const found = tasks.find((task) => task.title === "Compartida");
        const holder = window as unknown as { staleTask?: unknown };
        if (found && !holder.staleTask) { holder.staleTask = found; resolve(); }
      }, () => resolve());
    });
  });
  await olgaPage.locator(".taskItem", { hasText: "Compartida" }).getByRole("combobox", { name: /Estado/ }).selectOption("Hecha");
  await expect(anaPage.locator(".taskItem", { hasText: "Compartida" }).getByRole("combobox", { name: /Estado/ })).toHaveValue("Hecha");

  const result = await anaPage.evaluate(async (uid) => {
    const workboard = await import("/src/features/workboard/firestoreWorkboard.ts");
    const stale = (window as unknown as { staleTask: import("../../src/types").Task }).staleTask;
    const user = { id: uid, name: "Ana", email: "ana@cowork.test", photoURL: "", emailVerified: true, authProviders: ["password"] };
    try {
      await workboard.updateTask("uno", stale, { ...stale, assigneeUid: uid, assignee: "Ana", status: "En curso" }, user);
      return "saved";
    } catch (error) {
      return (error as { code?: string }).code ?? "error";
    }
  }, ana.uid);
  expect(result).toBe("cowork/conflict");
  const olgaRow = olgaPage.locator(".taskItem", { hasText: "Compartida" });
  await expect(olgaRow.getByRole("combobox", { name: /Estado/ })).toHaveValue("Hecha");
  await expect(olgaRow.getByRole("button", { name: /Sin asignar/ })).toBeVisible();
  await first.close();
  await second.close();
});

test("a member who left keeps the historical reference but is not offered", async ({ page }) => {
  await goToWork(page, olga);
  const input = page.getByRole("textbox", { name: "Título de la nueva tarea" });
  await input.fill("Tarea de Ana");
  await input.press("Enter");
  const row = page.locator(".taskItem", { hasText: "Tarea de Ana" });
  await row.getByRole("button", { name: /Responsable de Tarea de Ana/ }).click();
  await page.getByRole("menuitemradio", { name: "Ana" }).click();
  await expect(row.getByRole("button", { name: /: Ana\./ })).toBeVisible();

  await page.evaluate(() => { window.location.hash = "#settings-page"; });
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator(".projectMemberRow", { hasText: "ana@cowork.test" }).getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByText("ya no tiene acceso")).toBeVisible();

  await page.evaluate(() => { window.location.hash = "#work"; });
  await expect(row.getByRole("button", { name: /Miembro sin acceso/ })).toBeVisible();
  await row.getByRole("button", { name: /Responsable de Tarea de Ana/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "Ana" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // Editing another field keeps the historical reference.
  await row.getByRole("combobox", { name: /Estado/ }).selectOption("Hecha");
  await expect(row.getByRole("button", { name: /Miembro sin acceso/ })).toBeVisible();
});

test("milestones: empty, partial, complete, reopened and archived", async ({ page }) => {
  await goToWork(page, olga);
  await page.getByRole("button", { name: "Nuevo hito" }).click();
  await page.getByRole("textbox", { name: "Título", exact: true }).fill("Prototipo");
  await page.locator(".milestoneForm input[type=date]").fill("2031-05-10");
  await page.getByRole("button", { name: "Crear hito" }).click();
  const item = page.locator(".milestoneItem", { hasText: "Prototipo" });
  await expect(item).toContainText("Sin tareas vinculadas");
  await expect(item).toContainText("Pendiente");

  const input = page.getByRole("textbox", { name: "Título de la nueva tarea" });
  for (const title of ["Parte A", "Parte B"]) {
    await page.getByRole("combobox", { name: "Hito de la nueva tarea" }).selectOption({ label: "Prototipo" });
    await input.fill(title);
    await input.press("Enter");
    await expect(page.locator(".taskItem", { hasText: title })).toBeVisible();
  }
  await expect(item).toContainText("0 de 2 tareas hechas");
  await page.locator(".taskItem", { hasText: "Parte A" }).getByRole("combobox", { name: /Estado/ }).selectOption("Hecha");
  await expect(item).toContainText("1 de 2 tareas hechas");
  await page.locator(".taskItem", { hasText: "Parte B" }).getByRole("combobox", { name: /Estado/ }).selectOption("Hecha");
  await expect(item).toContainText("Terminado");
  await page.locator(".taskItem", { hasText: "Parte B" }).getByRole("combobox", { name: /Estado/ }).selectOption("En curso");
  await expect(item).toContainText("Pendiente");

  await page.evaluate(() => { window.location.hash = "#home"; });
  await expect(page.locator(".homeMilestone")).toContainText("Prototipo");
  await page.evaluate(() => { window.location.hash = "#work"; });
  await item.getByRole("button", { name: "Archivar" }).click();
  await expect(page.locator(".milestoneItem", { hasText: "Prototipo" })).toHaveCount(0);
  await expect(page.locator(".taskItem", { hasText: "Parte A" })).toContainText("Prototipo");
});
