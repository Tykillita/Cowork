import { expect, test } from "@playwright/test";

test("scrambled text stays readable when motion is reduced @cross @mobile", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/tests/fixtures/motion.html");
  const title = page.locator(".scrambled-text-animated");
  await expect(title).toBeVisible();
  await expect.poll(() => title.locator(".scrambled-text-char").count()).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await expect(title.locator(".scrambled-text-char")).toHaveCount(0);
  await expect(title).toHaveText("Movimiento legible");
  await expect(title).toBeVisible();

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => title.locator(".scrambled-text-char").count()).toBeGreaterThan(0);
});
