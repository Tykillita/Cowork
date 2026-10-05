import { expect, test } from "@playwright/test";

test("the card stack freezes visibly and resumes @cross @mobile", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/tests/fixtures/motion.html");
  const card = page.locator(".fixtureCards .card").first();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  const transform = () => card.evaluate((element) => getComputedStyle(element).transform);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.waitForTimeout(100);
  const still = await transform();
  await page.waitForTimeout(400);
  expect(await transform()).toBe(still);
  await expect(card).toBeVisible();

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect.poll(transform, { timeout: 10_000 }).not.toBe(still);
});

test("explicitly enabled motion overrides the system reduced-motion setting for the card stack", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/fixtures/motion.html");
  const card = page.locator(".fixtureCards .card").first();
  await card.scrollIntoViewIfNeeded();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");

  const transform = () => card.evaluate((element) => getComputedStyle(element).transform);
  const still = await transform();
  await page.evaluate(() => { document.documentElement.dataset.motion = "full"; });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect.poll(transform, { timeout: 10_000 }).not.toBe(still);
});
