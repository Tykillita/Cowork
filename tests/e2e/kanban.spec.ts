import { expect, test, type Page } from "@playwright/test";
import { createAccount, openProject, resetEmulators, seedProject, seedTasks, signIn, type TestAccount } from "./helpers";

let ana: TestAccount;

test.beforeEach(async () => {
  await resetEmulators();
  ana = await createAccount("Ana");
  await seedProject(ana, { id: "uno", name: "Uno" });
  await seedTasks("uno", [{ id: "a", title: "Tarea A" }, { id: "b", title: "Tarea B" }, { id: "c", title: "Tarea C", status: "Hecha" }], ana);
});

async function openBoard(page: Page) {
  await signIn(page, ana);
  await openProject(page, "Uno");
  await page.evaluate(() => { window.location.hash = "#work"; });
  await expect(page.locator("#taskHint")).toContainText("Cualquier miembro");
  await expect(page.locator(".kanban .taskCard")).toHaveCount(3);
}

/** The first work of the day may celebrate the streak; it takes the focus, so close it. */
async function dismissCelebration(page: Page) {
  await page.getByRole("button", { name: "Cerrar celebración" }).click({ timeout: 4000 }).catch(() => undefined);
}

const column = (page: Page, status: string) => page.locator(`.kanbanColumn[data-status="${status}"]`);

test("the board is the default view and the choice is remembered", async ({ page }) => {
  await openBoard(page);
  await expect(column(page, "Pendiente").locator(".taskCard")).toHaveText([/Tarea A/, /Tarea B/]);
  await expect(column(page, "Hecha").locator(".taskCard")).toHaveText([/Tarea C/]);
  await page.getByRole("button", { name: "Lista" }).click();
  await expect(page.locator(".taskRow")).toHaveCount(3);
  await page.reload();
  await expect(page.locator(".app-shell:not([aria-busy])")).toBeVisible();
  await expect(page.locator(".taskRow")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
});

test("keyboard: lift, move to another column and within it, drop; it persists", async ({ page }) => {
  await openBoard(page);
  const handle = page.getByRole("button", { name: "Mover «Tarea A»" });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".kanban [role=status]")).toContainText("tomada");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(column(page, "En curso").locator(".taskCard")).toHaveText([/Tarea A/]);
  await dismissCelebration(page);

  // Across and then down inside the column: B lands under A.
  await page.getByRole("button", { name: "Mover «Tarea B»" }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(column(page, "En curso").locator(".taskCard")).toHaveText([/Tarea A/, /Tarea B/]);

  // Escape cancels.
  await page.getByRole("button", { name: "Mover «Tarea A»" }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(column(page, "En curso").locator(".taskCard")).toHaveText([/Tarea A/, /Tarea B/]);
  await expect(page.locator('.taskCard[aria-busy="true"]')).toHaveCount(0);

  await page.reload();
  await expect(column(page, "En curso").locator(".taskCard")).toHaveText([/Tarea A/, /Tarea B/]);
  await expect(column(page, "Pendiente").locator(".kanbanEmpty")).toBeVisible();
});

test("pointer: drag a card to another column and above another card", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await openBoard(page);
  // Everything fits without scrolling, away from the edges where the page scrolls by itself.
  await page.evaluate(() => window.scrollTo(0, 0));
  const drag = async (title: string, target: { x: number; y: number }) => {
    const card = page.locator(".taskCard", { hasText: title });
    const box = (await card.boundingBox())!;
    // The card body, away from the title button and the controls.
    await page.mouse.move(box.x + box.width - 50, box.y + 6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 40, box.y + 20, { steps: 4 });
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await expect(page.locator(".taskCardPlaceholder")).toBeVisible();
    await page.mouse.up();
  };
  const done = (await column(page, "Hecha").boundingBox())!;
  await drag("Tarea B", { x: done.x + done.width / 2, y: done.y + done.height - 20 });
  await expect(column(page, "Hecha").locator(".taskCard")).toHaveText([/Tarea C/, /Tarea B/]);
  await dismissCelebration(page);

  const cCard = (await column(page, "Hecha").locator(".taskCard", { hasText: "Tarea C" }).boundingBox())!;
  await drag("Tarea A", { x: cCard.x + cCard.width / 2, y: cCard.y + 4 });
  await expect(column(page, "Hecha").locator(".taskCard")).toHaveText([/Tarea A/, /Tarea C/, /Tarea B/]);
  // The move shows at once; wait until it is saved before reloading.
  await expect(page.locator('.taskCard[aria-busy="true"]')).toHaveCount(0);
  await page.reload();
  await expect(column(page, "Hecha").locator(".taskCard")).toHaveText([/Tarea A/, /Tarea C/, /Tarea B/]);
});

test("the status select moves a card without dragging, on a phone too", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page);
  await page.getByRole("combobox", { name: "Estado: Tarea A" }).selectOption("Hecha");
  await expect(column(page, "Hecha").locator(".taskCard")).toHaveText([/Tarea C/, /Tarea A/]);
  // Columns scroll sideways inside the board; the page itself never does.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/kanban-390.png", fullPage: true });
});

test("board layout at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openBoard(page);
  const boxes = await Promise.all(["Pendiente", "En curso", "Hecha"].map(async (status) => (await column(page, status).boundingBox())!));
  expect(Math.abs(boxes[0].y - boxes[2].y)).toBeLessThan(2);
  expect(boxes[0].x).toBeLessThan(boxes[1].x);
  await page.screenshot({ path: "test-results/kanban-1280.png", fullPage: true });
});
