import { expect, test } from "@playwright/test";
import { createAccount, resetEmulators, signIn } from "./helpers";

test("the project picker stops WebGL drawing while idle and with reduced motion", async ({ page }) => {
  await resetEmulators();
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.drawArrays;
    (window as Window & { coworkGpuDraws?: number }).coworkGpuDraws = 0;
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      (window as Window & { coworkGpuDraws?: number }).coworkGpuDraws! += 1;
      return original.apply(this, args);
    };
  });
  const account = await createAccount("Ana");
  await signIn(page, account);
  await expect(page.locator(".projectPicker:not([aria-busy])")).toBeVisible();
  await page.mouse.move(1200, 680);
  await page.waitForTimeout(350);
  const idleStart = await page.evaluate(() => (window as Window & { coworkGpuDraws?: number }).coworkGpuDraws ?? 0);
  await page.waitForTimeout(500);
  const idleEnd = await page.evaluate(() => (window as Window & { coworkGpuDraws?: number }).coworkGpuDraws ?? 0);
  expect(idleEnd - idleStart).toBe(0);

  const button = await page.locator(".projectPickerActions .projectAddButton").first().boundingBox();
  expect(button).not.toBeNull();
  await page.mouse.move(button!.x + button!.width / 2, button!.y + button!.height / 2);
  await page.waitForTimeout(300);
  const hoverEnd = await page.evaluate(() => (window as Window & { coworkGpuDraws?: number }).coworkGpuDraws ?? 0);
  expect(hoverEnd).toBeGreaterThan(idleEnd);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(200);
  const reducedStart = await page.evaluate(() => (window as Window & { coworkGpuDraws?: number }).coworkGpuDraws ?? 0);
  await page.waitForTimeout(500);
  const reducedEnd = await page.evaluate(() => (window as Window & { coworkGpuDraws?: number }).coworkGpuDraws ?? 0);
  expect(reducedEnd - reducedStart).toBe(0);
  const card = page.locator(".projectPreviewStage .card").first();
  const stillStart = await card.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(700);
  const stillEnd = await card.evaluate((element) => getComputedStyle(element).transform);
  expect(stillEnd).toBe(stillStart);
});
