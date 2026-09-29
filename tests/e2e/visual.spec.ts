import { expect, test, type Page } from "@playwright/test";
import { createAccount, openProject, resetEmulators, seedProject, signIn } from "./helpers";

// Layout review at the agreed widths: no horizontal overflow, nothing clipped
// by the viewport, and a screenshot of each screen for manual inspection.
const WIDTHS = [320, 375, 390, 430, 768, 1440];

async function assertNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        if (!box.width || !box.height) return false;
        const style = getComputedStyle(element);
        if (style.position === "fixed" && style.visibility === "hidden") return false;
        // Elements inside horizontally scrollable containers are allowed to overflow them.
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const parentStyle = getComputedStyle(parent);
          if (/(auto|scroll|hidden|clip)/.test(parentStyle.overflowX) && parent !== document.body && parent !== document.documentElement) return false;
        }
        return box.right > width + 1 || box.left < -1;
      })
      .slice(0, 5)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}`);
    return { scroll: document.documentElement.scrollWidth - width, offenders };
  });
  expect(overflow.scroll, `${label}: horizontal scroll`).toBeLessThanOrEqual(0);
  expect(overflow.offenders, `${label}: elements outside the viewport`).toEqual([]);
}

test("layout at every reference width", async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmulators();
  const olga = await createAccount("Olga Fernández");
  const ana = await createAccount("Ana");
  await seedProject(olga, { id: "vigilia", name: "Vigilia", description: "Una página de admisiones de Emergencia con un Agente de ia.", members: [ana] });
  await seedProject(olga, { id: "api", name: "API de datos" });
  await signIn(page, olga);
  await openProject(page, "Vigilia");
  await page.evaluate(() => { window.location.hash = "#work"; });
  const input = page.getByRole("textbox", { name: "Título de la nueva tarea" });
  await input.fill("Una tarea con un título bastante largo para comprobar el ajuste de línea en pantallas estrechas");
  await input.press("Enter");
  await expect(page.locator(".taskRow")).toHaveCount(1);
  await page.getByRole("button", { name: "Nuevo hito" }).click();
  await page.getByRole("textbox", { name: "Título", exact: true }).fill("Prototipo navegable");
  await page.locator(".milestoneForm input[type=date]").fill("2031-05-10");
  await page.getByRole("button", { name: "Crear hito" }).click();
  await expect(page.locator(".milestoneItem")).toHaveCount(1);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
    for (const section of ["home", "work", "settings-page"]) {
      await page.evaluate((hash) => { window.location.hash = hash; }, `#${section}`);
      await expect(page.locator(`[data-page="${section}"]`).first()).toBeVisible();
      await page.waitForTimeout(150);
      await assertNoOverflow(page, `${section} @${width}`);
      await page.screenshot({ path: `test-results/visual/${width}-${section}.png`, fullPage: true });
    }
    await page.evaluate(() => { window.location.hash = "#home"; window.scrollTo(0, 0); });
    await page.locator(".hamburger-menu").click();
    await page.waitForTimeout(700);
    await assertNoOverflow(page, `cardnav @${width}`);
    await page.screenshot({ path: `test-results/visual/${width}-cardnav.png` });
    await page.keyboard.press("Escape");
    await page.locator(".activityButton").click();
    await assertNoOverflow(page, `activity @${width}`);
    await page.screenshot({ path: `test-results/visual/${width}-activity.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Abrir perfil/ }).click();
    await page.getByRole("button", { name: "Mi colección" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/visual/${width}-collection.png` });
    await page.locator(".collectionDialog").getByRole("button", { name: "Cerrar", exact: true }).click();
  }

  await page.getByRole("button", { name: /Cambiar proyecto|Cambiar/ }).first().click();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(200);
    await assertNoOverflow(page, `picker @${width}`);
    await page.screenshot({ path: `test-results/visual/${width}-picker.png`, fullPage: true });
  }
});
