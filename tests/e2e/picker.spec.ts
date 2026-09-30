import { expect, test } from "@playwright/test";
import { createAccount, resetEmulators, seedProject, signIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetEmulators();
  const ana = await createAccount("Ana");
  const names = [["vigilia", "Vigilia", "Admisiones de emergencia"], ["diseno", "Diseño UX", ""], ["api", "API", "Servicio de datos"], ["web", "Sitio web", ""], ["movil", "App móvil", ""]];
  for (const [index, [id, name, description]] of names.entries()) {
    await seedProject(ana, { id, name, description, createdAt: `2026-09-0${index + 1}T00:00:00.000Z` });
  }
  await signIn(page, ana);
});

const cardTitles = (page: import("@playwright/test").Page) => page.locator(".projectBrowserTab span:last-child").allTextContents();

test("search ignores case and accents and resets pagination; empty state @cross", async ({ page }) => {
  const search = page.getByRole("searchbox");
  await expect(page.locator(".projectPager")).toContainText("1 / 2");
  await page.getByRole("button", { name: "Más proyectos" }).click();
  await page.getByRole("button", { name: "Buscar proyectos", exact: true }).click();
  await search.fill("DISENO");
  await expect(page.locator(".projectResultsStatus")).toHaveText("1 de 5 proyectos");
  await expect.poll(() => cardTitles(page)).toEqual(["Diseño UX"]);
  await expect(page.locator(".projectPager")).toHaveCount(0);
  await search.fill("emergencia");
  await expect.poll(() => cardTitles(page)).toEqual(["Vigilia"]);
  await search.fill("zzz");
  await expect(page.locator(".projectSearchDockEmpty")).toContainText("Ningún proyecto coincide");
  await page.getByRole("button", { name: "Mostrar todos los proyectos" }).click();
  await expect(search).toHaveValue("");
});

test("favourites come first, filter, and persist across reloads", async ({ page }) => {
  // The cards keep swapping places, so a pointer click at fixed coordinates can land on
  // another card. The keyboard route is deterministic and is the accessible one.
  await page.getByRole("button", { name: "Marcar como favorito: App móvil" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Quitar de favoritos: App móvil" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Buscar proyectos", exact: true }).click();
  await page.getByRole("button", { name: "Favoritos", exact: true }).click();
  await expect.poll(() => cardTitles(page)).toEqual(["App móvil"]);
  await page.reload();
  await page.getByRole("button", { name: "Buscar proyectos", exact: true }).click();
  await expect(page.getByRole("button", { name: "Favoritos", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => cardTitles(page)).toEqual(["App móvil"]);
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await expect.poll(async () => (await cardTitles(page))[0]).toBe("App móvil");
});

test("sort by name and personal order with accessible up/down controls", async ({ page }) => {
  await page.getByRole("button", { name: "Buscar proyectos", exact: true }).click();
  await page.getByRole("combobox", { name: "Ordenar por" }).selectOption("name");
  await expect.poll(() => cardTitles(page)).toEqual(["API", "App móvil", "Diseño UX"]);
  await page.getByRole("combobox", { name: "Ordenar por" }).selectOption("custom");
  await page.getByRole("button", { name: "Editar mi orden" }).click();
  const up = page.getByRole("button", { name: "Subir Vigilia" });
  await up.focus();
  for (let index = 0; index < 4; index += 1) await page.keyboard.press("Enter");
  await expect(page.locator(".projectOrderItem").first()).toContainText("Vigilia");
  await expect(page.getByRole("button", { name: "Subir Vigilia" })).toBeDisabled();
  await page.getByRole("button", { name: "Listo" }).click();
  await expect.poll(async () => (await cardTitles(page))[0]).toBe("Vigilia");
  await page.reload();
  await expect.poll(async () => (await cardTitles(page))[0]).toBe("Vigilia");
});

test("cards show the real icon of each preview site, or the initial when it has none", async ({ page }) => {
  const ana = await createAccount("Beatriz");
  await seedProject(ana, { id: "con-icono", name: "Con icono", previewUrl: "https://sitio-con-icono.test/app/", createdAt: "2026-09-10T00:00:00.000Z" });
  await seedProject(ana, { id: "sin-icono", name: "Sin icono", previewUrl: "https://sitio-sin-icono.test/", createdAt: "2026-09-09T00:00:00.000Z" });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#f00"/></svg>';
  await page.route(/https:\/\/sitio-(con|sin)-icono\.test\/.*/, (route) => {
    const url = route.request().url();
    if (url === "https://sitio-con-icono.test/app/favicon.svg") return route.fulfill({ contentType: "image/svg+xml", body: svg });
    if (route.request().resourceType() === "document") return route.fulfill({ contentType: "text/html", body: "<p>preview</p>" });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.evaluate(() => window.localStorage.removeItem("cowork.site-favicons"));
  await page.getByRole("button", { name: /Cerrar sesión/ }).click();
  await signIn(page, ana);
  const withIcon = page.getByRole("button", { name: "Abrir el proyecto Con icono" }).locator(".projectBrowserFavicon img");
  await expect(withIcon).toHaveAttribute("src", "https://sitio-con-icono.test/app/favicon.svg");
  const withoutIcon = page.getByRole("button", { name: "Abrir el proyecto Sin icono" }).locator(".projectBrowserFavicon");
  await expect.poll(() => withoutIcon.textContent(), { timeout: 20_000 }).toBe("S");
  await expect(withoutIcon.locator("img")).toHaveCount(0);
});

test("an icon set in the project settings wins over the detected one", async ({ page }) => {
  const ana = await createAccount("Carla");
  await seedProject(ana, { id: "manual", name: "Manual", previewUrl: "https://sitio-con-icono.test/app/", createdAt: "2026-09-10T00:00:00.000Z" });
  const svg = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${color}"/></svg>`;
  await page.route(/https:\/\/(sitio-con-icono|cdn)\.test\/.*/, (route) => {
    const url = route.request().url();
    if (url === "https://sitio-con-icono.test/app/favicon.svg") return route.fulfill({ contentType: "image/svg+xml", body: svg("#f00") });
    if (url === "https://cdn.test/logo.svg") return route.fulfill({ contentType: "image/svg+xml", body: svg("#0f0") });
    if (route.request().resourceType() === "document") return route.fulfill({ contentType: "text/html", body: "<p>preview</p>" });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.getByRole("button", { name: /Cerrar sesión/ }).click();
  await signIn(page, ana);
  const favicon = page.getByRole("button", { name: "Abrir el proyecto Manual" }).locator(".projectBrowserFavicon img");
  await expect(favicon).toHaveAttribute("src", "https://sitio-con-icono.test/app/favicon.svg");

  const tab = page.getByRole("button", { name: "Abrir el proyecto Manual" });
  await tab.focus();
  await tab.press("Enter");
  await page.evaluate(() => { window.location.hash = "#settings-page"; });
  const field = page.getByRole("textbox", { name: /Icono del proyecto/ });
  await field.fill("http://inseguro.test/x.png");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("La dirección del icono debe empezar con https://")).toBeVisible();
  await field.fill("https://cdn.test/logo.svg");
  await expect(page.locator(".projectIconPreview img")).toHaveAttribute("src", "https://cdn.test/logo.svg");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("La vista previa y el icono se actualizaron.")).toBeVisible();

  await page.getByRole("button", { name: /Cambiar proyecto|Cambiar/ }).first().click();
  await expect(favicon).toHaveAttribute("src", "https://cdn.test/logo.svg");
});
