import { expect, test, type Page } from "@playwright/test";
import { createAccount, openProject, resetEmulators, seedActivityEvents, seedProject, seedTasks, signIn, type TestAccount } from "./helpers";
import { fakeGitHub, REPO } from "./githubMock";

test.beforeEach(async () => { await resetEmulators(); });

async function seedSummary() {
  const ana = await createAccount("Ana");
  const beto = await createAccount("Beto");
  await seedProject(ana, { id: "uno", name: "Uno", repositoryUrl: `https://github.com/${REPO}`, members: [beto] });
  await seedTasks("uno", [
    { id: "t1", title: "Diseñar la portada", status: "En curso", assignee: ana },
    { id: "t2", title: "Revisar textos", assignee: ana },
    { id: "t3", title: "Publicar versión", status: "Hecha", assignee: ana },
    { id: "t4", title: "Tarea de Beto", assignee: beto },
    { id: "t5", title: "Sin responsable" },
  ], ana);
  await seedActivityEvents("uno", 2, beto);
  return { ana, beto };
}

async function openSummary(page: Page, account: TestAccount) {
  await signIn(page, account);
  await openProject(page, "Uno");
  await expect(page.locator(".homeGrid:not([aria-busy='true'])")).toBeVisible();
}

test("the summary shows my work, progress, milestone, activity and repository in reading order", async ({ page }) => {
  const { ana } = await seedSummary();
  const github = await fakeGitHub(page, [ana]);
  github.commits = [{ sha: "e".repeat(40), message: "Añadir portada\n\nDetalle", author: "beto-gh", date: new Date().toISOString() }];
  github.pulls = [{ number: 7, title: "Portada", head: "feature/portada" }];
  await openSummary(page, ana);

  const cards = page.locator(".homeGrid > .homeCard");
  await expect(cards).toHaveCount(6);
  expect(await cards.evaluateAll((nodes) => nodes.map((node) => [...node.classList].find((name) => name !== "panel" && name !== "homeCard")))).toEqual(["homeYou", "homeProgress", "homeMilestone", "homeActivity", "homeRepo", "homeCode"]);

  const mine = page.locator(".homeYou");
  await expect(mine.locator(".homeRow")).toHaveText([/Diseñar la portada.*En curso/, /Revisar textos.*Pendiente/]);
  await expect(mine).toContainText("1 sin asignar");
  await expect(page.locator(".homeProgress .homeBigNumber")).toContainText("20%");
  await expect(page.locator(".homeProgress")).toContainText("1 de 5 hechas");
  await expect(page.locator(".homeActivity .homeEvent")).toHaveCount(2);
  await expect(page.locator(".homeActivity")).toContainText("Actividad uno 0");
  const repo = page.locator(".homeRepo");
  await expect(repo).toContainText("Añadir portada");
  await expect(repo).toContainText("3 ramas en GitHub");
  await expect(repo).toContainText("1 PR abierto");
  await expect(repo).toContainText("Privado");
  // The static settings card is gone; the owner's checklist only lists what is missing.
  await expect(page.locator(".homeSetup")).toContainText("Definir el plazo de entrega");

  // A task from the summary opens in the plan's drawer.
  await mine.getByRole("link", { name: /Revisar textos/ }).click();
  await expect(page).toHaveURL(/#work\?task=t2$/);
  await expect(page.getByRole("dialog", { name: "Tarea Revisar textos" })).toBeVisible();
});

test("summary links filter the plan and open the right settings section", async ({ page }) => {
  const { ana } = await seedSummary();
  await fakeGitHub(page, [ana]);
  await openSummary(page, ana);
  await page.locator(".homeYou").getByRole("link", { name: "1 sin asignar" }).click();
  await expect(page.locator(".taskItem")).toHaveText([/Sin responsable/]);

  await page.evaluate(() => { window.location.hash = "#home"; });
  await page.locator(".homeSetup").getByRole("link", { name: /Definir el plazo de entrega/ }).click();
  await expect(page).toHaveURL(/#settings-page\?section=schedule$/);
  await expect(page.locator("#settings-schedule")).toBeInViewport();
});

test("the owner links a repository from settings and the summary follows", async ({ page }) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "uno", name: "Uno" });
  await fakeGitHub(page, [ana]);
  await signIn(page, ana);
  await openProject(page, "Uno");
  const repoCard = page.locator(".homeRepo");
  await expect(repoCard).toContainText("Sin repositorio");
  await repoCard.getByRole("link", { name: /Vincular repositorio/ }).click();
  await expect(page.locator("#settings-github")).toBeInViewport();

  const field = page.getByRole("textbox", { name: "Repositorio de GitHub" });
  await field.fill("https://gitlab.com/equipo/cowork");
  await page.getByRole("button", { name: "Guardar repositorio" }).click();
  await expect(page.locator("#settings-github [role=alert]")).toContainText("enlace de repositorio de GitHub válido");
  await field.fill(`https://github.com/${REPO}.git`);
  await page.getByRole("button", { name: "Guardar repositorio" }).click();
  await expect(page.locator("#settings-github [role=status]")).toContainText(`vinculado a ${REPO}`);

  await page.evaluate(() => { window.location.hash = "#home"; });
  await expect(page.locator(".homeRepo")).toContainText(`GITHUB · ${REPO.toUpperCase()}`);
  await expect(page.locator(".homeRepo")).toContainText("3 ramas en GitHub");
});

test("members see the repository settings read-only", async ({ page }) => {
  const ana = await createAccount("Ana");
  const beto = await createAccount("Beto");
  await seedProject(ana, { id: "uno", name: "Uno", members: [beto] });
  await signIn(page, beto);
  await openProject(page, "Uno");
  await expect(page.locator(".homeRepo")).toContainText("todavía no tiene un repositorio");
  await expect(page.locator(".homeSetup")).toHaveCount(0);
  await page.evaluate(() => { window.location.hash = "#settings-page"; });
  await expect(page.getByRole("textbox", { name: "Repositorio de GitHub" })).toHaveCount(0);
  await expect(page.locator(".settingsSections a")).toHaveText(["GitHub", "Plazo", "Vista previa"]);
});

for (const [width, height, columns] of [[1280, 900, 3], [900, 1000, 2], [390, 844, 1]] as const) {
  test(`summary layout at ${width}px`, async ({ page }) => {
    const { ana } = await seedSummary();
    await fakeGitHub(page, [ana]);
    await page.setViewportSize({ width, height });
    await openSummary(page, ana);
    await expect(page.locator(".homeRepo")).toContainText("ramas en GitHub");
    const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
    const you = await box(".homeYou");
    const progress = await box(".homeProgress");
    const activity = await box(".homeActivity");
    const repo = await box(".homeRepo");
    if (columns === 3) {
      expect(Math.abs(you.y - progress.y)).toBeLessThan(2);
      expect(activity.x).toBeLessThan(repo.x);
      expect(Math.abs(activity.y - repo.y)).toBeLessThan(2);
    } else if (columns === 2) {
      expect(progress.y).toBeGreaterThan(you.y + you.height - 2);
      expect(repo.y).toBeGreaterThan(activity.y + activity.height - 2);
    } else {
      expect(Math.abs(you.x - progress.x)).toBeLessThan(2);
      expect(progress.y).toBeGreaterThan(you.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/home-${width}.png`, fullPage: true });
  });
}
