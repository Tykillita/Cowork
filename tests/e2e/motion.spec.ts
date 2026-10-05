import { expect, test, type Page } from "@playwright/test";
import { createAccount, resetEmulators, signIn } from "./helpers";

async function flameFrame(page: Page) {
  return page.locator(".streakHeaderButton .pixelFlameStrip").evaluate((strip) =>
    (strip as SVGGElement).transform.animVal.getItem(0).matrix.e);
}

async function expectSteadyFlame(page: Page) {
  await expect(page.locator(".streakHeaderButton .pixelFlameStrip animateTransform")).toHaveCount(0);
  await expect.poll(() => flameFrame(page)).toBe(0);
  await page.waitForTimeout(360);
  expect(await flameFrame(page)).toBe(0);
  await expect(page.locator(".streakHeaderButton .pixelFlame")).toBeVisible();
}

async function expectFlicker(page: Page) {
  const samples = await page.locator(".streakHeaderButton .pixelFlameStrip").evaluate(async (strip) => {
    const positions: number[] = [];
    for (let index = 0; index < 42; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const x = (strip as SVGGElement).transform.animVal.getItem(0).matrix.e;
      if (![0, -16, -32].includes(x)) throw new Error(`Fotograma incompleto en posición ${x}.`);
      positions.push(x);
    }
    return positions;
  });
  expect(new Set(samples).size).toBeGreaterThan(1);
}

test("the pill flame stays visible through profile motion settings", async ({ page }) => {
  test.setTimeout(120_000);
  await resetEmulators();
  const ana = await createAccount("Ana");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await signIn(page, ana, { keepCreateDialog: true });
  const dialog = page.locator("dialog.projectCreateDialog[open]");
  await dialog.getByPlaceholder("Nombre del proyecto").fill("Llama visible");
  await dialog.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(dialog.getByRole("heading", { name: "Llama visible está listo" })).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page.locator(".streakHeaderButton .pixelFlame[data-tone='lit']")).toBeVisible({ timeout: 30_000 });
  const celebration = page.getByRole("status", { name: "Racha actualizada" });
  await expect(celebration).toBeVisible({ timeout: 15_000 });
  await celebration.getByRole("button", { name: "Cerrar celebración" }).click();

  await expectFlicker(page);
  await page.getByRole("button", { name: /Abrir perfil/ }).click();
  const motion = page.getByRole("group", { name: "ANIMACIONES" });
  await motion.getByRole("button", { name: "Reducido" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await expectSteadyFlame(page);
  await page.getByRole("button", { name: "Cerrar perfil" }).click();
  await page.getByRole("button", { name: /Abrir rachas y puntos/ }).click();
  await expect(page.locator(".streakHeroMain .pixelFlame")).toBeVisible();
  await expect(page.locator(".streakHeroMain .pixelFlameStrip animateTransform")).toHaveCount(0);
  expect(await page.locator(".streakHeroMain .pixelFlameStrip").evaluate((strip) => (strip as SVGGElement).transform.animVal.getItem(0).matrix.e)).toBe(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Abrir perfil/ }).click();
  const restoredMotion = page.getByRole("group", { name: "ANIMACIONES" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await restoredMotion.getByRole("button", { name: "Activado" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expectFlicker(page);
  await restoredMotion.getByRole("button", { name: "Sistema" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await expectSteadyFlame(page);
});
