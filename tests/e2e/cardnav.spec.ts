import { expect, test, type Page } from "@playwright/test";
import { createAccount, openProject, resetEmulators, seedProject, signIn } from "./helpers";

async function mainTop(page: Page) {
  return page.locator(".app-shell:not([aria-busy]) main").evaluate((element) => Math.round(element.getBoundingClientRect().top));
}

async function navHeight(page: Page) {
  return page.locator(".card-nav").evaluate((element) => Math.round(element.getBoundingClientRect().height));
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await resetEmulators();
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "uno", name: "Uno" });
  await signIn(page, ana);
  await openProject(page, "Uno");
});

test("opens with its animation over the content, closes, and never moves the page @cross", async ({ page }) => {
  const hamburger = page.getByRole("button", { name: "Abrir menú" });
  const before = await mainTop(page);
  await hamburger.click();
  // Mid-animation the height is between the closed bar and the open card.
  await page.waitForTimeout(150);
  const midway = await navHeight(page);
  expect(midway).toBeGreaterThan(60);
  await expect.poll(() => navHeight(page)).toBeGreaterThanOrEqual(250);
  expect(await mainTop(page)).toBe(before);
  const lastCard = page.locator(".nav-card").last();
  await expect(lastCard).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Cerrar menú" }).click();
  await expect.poll(() => navHeight(page)).toBe(60);
  expect(await mainTop(page)).toBe(before);
});

test("rapid repeated toggles settle in the last requested state @cross", async ({ page }) => {
  const hamburger = page.locator(".hamburger-menu");
  for (let index = 0; index < 5; index += 1) {
    await hamburger.click();
    await page.waitForTimeout(40);
  }
  // Five clicks → open.
  await expect(hamburger).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => navHeight(page)).toBeGreaterThanOrEqual(250);
  await hamburger.click();
  await hamburger.click();
  await hamburger.click();
  await expect(hamburger).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => navHeight(page)).toBe(60);
});

test("keyboard, Escape, outside click and navigation @cross", async ({ page }) => {
  const hamburger = page.locator(".hamburger-menu");
  // Closed links are not focusable.
  await expect(page.locator(".card-nav-content")).toHaveAttribute("inert", "");
  await hamburger.focus();
  await page.keyboard.press("Enter");
  await expect(hamburger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText(/Cambiar/);
  await page.keyboard.press("Escape");
  await expect(hamburger).toHaveAttribute("aria-expanded", "false");
  await expect(hamburger).toBeFocused();

  await hamburger.click();
  await page.mouse.click(10, 600);
  await expect(hamburger).toHaveAttribute("aria-expanded", "false");

  await hamburger.click();
  await page.getByRole("link", { name: "Abrir el plan de trabajo" }).click();
  await expect(page).toHaveURL(/#work$/);
  await expect(hamburger).toHaveAttribute("aria-expanded", "false");
});

test("reduced motion opens and closes instantly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator(".app-shell:not([aria-busy])")).toBeVisible();
  const hamburger = page.locator(".hamburger-menu");
  await hamburger.click();
  expect(await navHeight(page)).toBeGreaterThanOrEqual(250);
  await hamburger.click();
  expect(await navHeight(page)).toBe(60);
});

test("switching to reduced motion settles an in-progress menu @cross", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const hamburger = page.locator(".hamburger-menu");
  await hamburger.click();
  await page.waitForTimeout(100);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await expect.poll(() => navHeight(page)).toBeGreaterThanOrEqual(250);
  await expect(page.locator(".nav-card").last()).toHaveCSS("opacity", "1");
  await hamburger.click();
  expect(await navHeight(page)).toBe(60);
});

test("the personal motion setting overrides the system preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("button", { name: /Abrir perfil/ }).click();
  await page.getByRole("button", { name: "Activado" }).click();
  await page.keyboard.press("Escape");
  await page.locator(".hamburger-menu").click();
  await page.waitForTimeout(120);
  const midway = await navHeight(page);
  expect(midway).toBeGreaterThan(60);
  expect(midway).toBeLessThan(250);
});

test("mobile: the menu overlays the content without shifting it @mobile", async ({ page }) => {
  const before = await mainTop(page);
  await page.locator(".hamburger-menu").click();
  await expect.poll(() => navHeight(page)).toBeGreaterThan(200);
  expect(await mainTop(page)).toBe(before);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
