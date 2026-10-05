import { expect, test } from "@playwright/test";

test("the actual flame component keeps a complete frame across motion changes @cross @mobile", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/tests/fixtures/motion.html");
  const flame = page.locator(".pixelFlame");
  const strip = page.locator(".pixelFlameStrip");
  const position = () => strip.evaluate((element) => (element as SVGGElement).transform.animVal.getItem(0).matrix.e);
  await expect(flame).toBeVisible();
  await expect(strip.locator("animateTransform")).toHaveCount(1);
  expect(await flame.locator("path[d]").count()).toBe(12);
  const first = await position();
  await expect.poll(position, { timeout: 10_000 }).not.toBe(first);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await expect(strip.locator("animateTransform")).toHaveCount(0);
  await expect.poll(position).toBe(0);
  await expect(flame).toBeVisible();
  await page.waitForTimeout(250);
  expect(await position()).toBe(0);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(strip.locator("animateTransform")).toHaveCount(1);
  const resumed = await position();
  await expect.poll(position, { timeout: 10_000 }).not.toBe(resumed);
});
