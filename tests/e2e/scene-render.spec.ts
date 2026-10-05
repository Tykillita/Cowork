import { expect, test } from "@playwright/test";

test("the pixel scene stays painted and still with reduced motion @cross @mobile", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/tests/fixtures/motion.html");
  const canvas = page.locator(".fixtureCanvas");
  const bitmap = () => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await expect.poll(async () => (await bitmap()).length).toBeGreaterThan(1000);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.waitForTimeout(150);
  const still = await bitmap();
  await page.waitForTimeout(400);
  expect(await bitmap()).toBe(still);
  expect(still.length).toBeGreaterThan(1000);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect.poll(bitmap, { timeout: 10_000 }).not.toBe(still);
});
