import { expect, test } from "@playwright/test";

test("the menu settles open and closed when motion changes @cross @mobile", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/tests/fixtures/motion.html");
  const menu = page.locator(".fixtureMenu .card-nav");
  const hamburger = page.locator(".fixtureMenu .hamburger-menu");
  const height = () => menu.evaluate((element) => Math.round(element.getBoundingClientRect().height));
  await hamburger.click();
  await page.waitForTimeout(80);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await expect(hamburger).toHaveAttribute("aria-expanded", "true");
  await expect.poll(height).toBeGreaterThan(150);
  await expect(menu.locator(".nav-card").last()).toHaveCSS("opacity", "1");
  await hamburger.click();
  await expect(hamburger).toHaveAttribute("aria-expanded", "false");
  await expect.poll(height).toBeLessThanOrEqual(62);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await hamburger.click();
  await expect.poll(height).toBeGreaterThan(150);
});
