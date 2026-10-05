import { expect, test } from "@playwright/test";
import { createAccount, resetEmulators, seedProject, signIn } from "./helpers";

test("the project picker stops WebGL drawing while idle and with reduced motion", async ({ page }) => {
  await resetEmulators();
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.drawArrays;
    const state = window as Window & { coworkGpuDraws?: number; coworkGpuButtonDraws?: Record<string, number> };
    state.coworkGpuDraws = 0;
    state.coworkGpuButtonDraws = {};
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      const state = window as Window & { coworkGpuDraws?: number; coworkGpuButtonDraws?: Record<string, number> };
      state.coworkGpuDraws! += 1;
      const button = this.canvas.closest("button");
      const name = ["projectAddButton", "projectJoinButton", "projectSearchDockToggle"].find((candidate) => button?.classList.contains(candidate));
      if (name) state.coworkGpuButtonDraws![name] = (state.coworkGpuButtonDraws![name] ?? 0) + 1;
      return original.apply(this, args);
    };
  });
  const account = await createAccount("Ana");
  await seedProject(account, { id: "motion-project", name: "Movimiento" });
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

  await page.getByRole("button", { name: /Abrir perfil/ }).click();
  await page.getByRole("group", { name: "ANIMACIONES" }).getByRole("button", { name: "Activado" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await page.mouse.move(button!.x + button!.width / 2, button!.y + button!.height / 2);
  const overrideStart = await page.evaluate(() => (window as Window & { coworkGpuDraws?: number }).coworkGpuDraws ?? 0);
  await page.waitForTimeout(300);
  const overrideEnd = await page.evaluate(() => (window as Window & { coworkGpuDraws?: number }).coworkGpuDraws ?? 0);
  expect(overrideEnd).toBeGreaterThan(overrideStart);

  for (const [name, selector] of [
    ["projectJoinButton", ".projectJoinButton"],
    ["projectSearchDockToggle", ".projectSearchDockToggle"],
  ] as const) {
    const action = page.locator(selector).first();
    await expect(action).toBeVisible();
    const duration = await action.evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(duration.split(",").some((part) => Number.parseFloat(part) > 0)).toBe(true);

    const before = await page.evaluate((key) =>
      (window as Window & { coworkGpuButtonDraws?: Record<string, number> }).coworkGpuButtonDraws?.[key] ?? 0, name);
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect.poll(() => page.evaluate((key) =>
      (window as Window & { coworkGpuButtonDraws?: Record<string, number> }).coworkGpuButtonDraws?.[key] ?? 0, name))
      .toBeGreaterThan(before);
  }
});
