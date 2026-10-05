import { expect, test, type Page } from "@playwright/test";
import { createAccount, openProject, resetEmulators, seedProject, seedTasks, signIn, signOut } from "./helpers";
import { fakeGitHub, REPO } from "./githubMock";

async function openBranches(page: Page, name: string, hash = "#branches-page") {
  await openProject(page, name);
  await page.evaluate((target) => { window.location.hash = target; }, hash);
  await expect(page.locator(".branchList:not([aria-busy]) .branchRow").first()).toBeVisible();
}

const row = (page: Page, name: string) => page.locator(`.branchRow[data-branch="${name}"]`);

test.beforeEach(async () => { await resetEmulators(); });

test("the owner creates a branch in GitHub and registers it, then deletes it with confirmation", async ({ page }) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "repo", name: "Repo", repositoryUrl: `https://github.com/${REPO}` });
  const github = await fakeGitHub(page, [ana]);
  await signIn(page, ana);
  await openBranches(page, "Repo");

  await expect(page.locator(".repoStrip")).toContainText("3 ramas · repositorio privado");
  // The default branch and protected branches cannot be deleted from Cowork.
  await expect(page.getByRole("button", { name: "Borrar la rama main en GitHub" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Borrar la rama release en GitHub" })).toHaveCount(0);
  await expect(row(page, "release").locator(".repoProtected")).toHaveText("protegida");
  await expect(row(page, "main").locator(".repoDefault")).toHaveText("principal");
  await expect(page.locator(".branchRow").first()).toHaveAttribute("data-branch", "main");

  const form = page.locator("form.bf");
  await form.getByRole("textbox", { name: "Nombre de la rama" }).fill("con espacio");
  await form.getByRole("textbox", { name: "Objetivo del cambio" }).fill("Probar la integración");
  await expect(form.getByRole("checkbox", { name: /Crear también en GitHub/ })).toBeChecked();
  await expect(form.getByRole("combobox", { name: "Desde la rama" })).toHaveValue("main");
  await form.getByRole("button", { name: "Crear y registrar rama" }).click();
  await expect(form.getByRole("alert")).toContainText("no puede tener espacios");
  expect(github.created).toHaveLength(0);

  await form.getByRole("textbox", { name: "Nombre de la rama" }).fill("feature/login-github");
  await form.getByRole("button", { name: "Crear y registrar rama" }).click();
  await expect(row(page, "feature/login-github").locator(".branchPresence")).toHaveText("Cowork + GitHub");
  expect(github.created).toEqual([{ ref: "refs/heads/feature/login-github", sha: "a".repeat(40) }]);
  await expect(page.getByRole("link", { name: "feature/login-github" })).toBeVisible();

  await page.getByRole("button", { name: "Borrar la rama feature/login-github en GitHub" }).click();
  const confirm = page.getByRole("group", { name: "Confirmar borrado de feature/login-github" });
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  expect(github.deleted).toHaveLength(0);
  await page.getByRole("button", { name: "Borrar la rama feature/login-github en GitHub" }).click();
  await confirm.getByRole("button", { name: "Borrar rama" }).click();
  // The register keeps the entry, now marked as deleted on GitHub instead of a stale "en GitHub".
  await expect(row(page, "feature/login-github").locator(".branchPresence")).toHaveText("Borrada en GitHub");
  await expect(page.getByRole("link", { name: "feature/login-github" })).toHaveCount(0);
  expect(github.deleted).toEqual(["feature/login-github"]);
});

test("members follow the owner's policy; GitHub push permission is still required", async ({ page }) => {
  const ana = await createAccount("Ana");
  const beto = await createAccount("Beto");
  await seedProject(ana, { id: "repo", name: "Repo", repositoryUrl: `https://github.com/${REPO}`, members: [beto] });
  const github = await fakeGitHub(page, [ana, beto]);

  await signIn(page, beto);
  await openBranches(page, "Repo");
  await expect(page.getByText("Solo el propietario puede crear o borrar ramas")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Crear también en GitHub/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Borrar la rama/ })).toHaveCount(0);
  await signOut(page);

  await signIn(page, ana);
  await openProject(page, "Repo");
  await page.evaluate(() => { window.location.hash = "#settings-page"; });
  await expect(page.getByText("@ana-gh")).toBeVisible();
  await page.getByRole("radio", { name: /Todos los miembros/ }).check();
  await expect(page.getByText("Ahora los miembros con permiso en GitHub")).toBeVisible();
  await signOut(page);

  await signIn(page, beto);
  await openBranches(page, "Repo");
  await expect(page.getByRole("checkbox", { name: /Crear también en GitHub/ })).toBeChecked();
  await expect(page.getByRole("button", { name: "Borrar la rama feature/vieja en GitHub" })).toBeVisible();

  // Without write access on GitHub the controls disappear again.
  github.push = false;
  await page.getByRole("button", { name: "Actualizar" }).click();
  await expect(page.getByText("Tu cuenta de GitHub no tiene permiso de escritura")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Crear también en GitHub/ })).toHaveCount(0);
});

test("a repository GitHub cannot answer is reported instead of hiding the controls", async ({ page }) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "repo", name: "Repo", repositoryUrl: `https://github.com/${REPO}` });
  const github = await fakeGitHub(page, [ana]);
  github.repoStatus = 500;
  await signIn(page, ana);
  await openBranches(page, "Repo");
  await expect(page.getByText("No se pudo consultar el repositorio en GitHub.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Crear también en GitHub/ })).toHaveCount(0);

  github.repoStatus = 200;
  await page.getByRole("button", { name: "Actualizar" }).click();
  await expect(page.getByRole("checkbox", { name: /Crear también en GitHub/ })).toBeChecked();
});

test("one list: GitHub-only branches are registered in a click; details show PR, comparison, commits and tasks", async ({ page }) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "repo", name: "Repo", repositoryUrl: `https://github.com/${REPO}` });
  await seedTasks("repo", [{ id: "t1", title: "Rediseñar portada", details: { branch: "feature/vieja", description: "", priority: "media", dueDate: "", timeZone: "", dueAt: "", checklist: "", createdAt: "", createdByUid: "" } }], ana);
  const github = await fakeGitHub(page, [ana]);
  github.pulls = [{ number: 12, title: "Portada nueva", head: "feature/vieja" }];
  github.compare["feature/vieja"] = { ahead: 3, behind: 1 };
  github.branchCommits["feature/vieja"] = [{ sha: "f".repeat(40), message: "Ajustar la portada", author: "beto-gh", date: new Date().toISOString() }];
  // Two branches per page: the list follows the Link header.
  github.branchPageSize = 2;
  await signIn(page, ana);
  await openBranches(page, "Repo", "#branches-page?branch=feature/vieja");

  await expect(page.locator(".branchRow")).toHaveCount(3);
  const vieja = row(page, "feature/vieja");
  await expect(vieja.locator(".branchPresence")).toHaveText("Sin registrar");
  await expect(vieja.locator(".branchPull")).toHaveText("PR #12");
  await expect(vieja.locator(".branchTasksCount")).toHaveText("1 tarea");
  // The link opened its details.
  await expect(vieja.locator(".branchDetail")).toContainText("3 cambios por delante · 1 por detrás de main");
  await expect(vieja.locator(".branchDetail")).toContainText("Ajustar la portada");
  await expect(vieja.getByRole("link", { name: "Rediseñar portada" })).toHaveAttribute("href", "#work?task=t1");

  await vieja.getByRole("button", { name: "Registrar" }).click();
  const form = page.locator("form.bf");
  await expect(form.getByRole("textbox", { name: "Nombre de la rama" })).toHaveValue("feature/vieja");
  await expect(form.getByRole("checkbox", { name: /Crear también en GitHub/ })).toHaveCount(0);
  await form.getByRole("textbox", { name: "Objetivo del cambio" }).fill("Terminar la portada");
  await form.getByRole("button", { name: "Registrar rama" }).click();
  await expect(vieja.locator(".branchPresence")).toHaveText("Cowork + GitHub");
  expect(github.created).toHaveLength(0);

  await page.getByRole("button", { name: "En Cowork (1)" }).click();
  await expect(page.locator(".branchRow")).toHaveCount(1);
  await page.getByRole("button", { name: "Con PR (1)" }).click();
  await expect(page.locator(".branchRow")).toHaveText([/feature\/vieja/]);
});

test("removing a branch from the register leaves an event, and can also delete it on GitHub", async ({ page }) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "repo", name: "Repo", repositoryUrl: `https://github.com/${REPO}` });
  const github = await fakeGitHub(page, [ana]);
  await signIn(page, ana);
  await openBranches(page, "Repo");
  const form = page.locator("form.bf");
  await form.getByRole("textbox", { name: "Nombre de la rama" }).fill("feature/temporal");
  await form.getByRole("textbox", { name: "Objetivo del cambio" }).fill("Probar");
  await form.getByRole("button", { name: "Crear y registrar rama" }).click();
  await expect(row(page, "feature/temporal").locator(".branchPresence")).toHaveText("Cowork + GitHub");

  await page.getByRole("button", { name: "Quitar feature/temporal del registro" }).click();
  const confirm = page.getByRole("group", { name: "Confirmar quitar feature/temporal del registro" });
  await confirm.getByRole("checkbox", { name: /Borrar también en GitHub/ }).check();
  await confirm.getByRole("button", { name: "Quitar" }).click();
  await expect(row(page, "feature/temporal")).toHaveCount(0);
  expect(github.deleted).toEqual(["feature/temporal"]);

  await page.locator(".activityButton").click();
  await page.getByRole("tab", { name: "Actividad" }).click();
  await expect(page.locator(".activityEntry", { hasText: "quitó la rama feature/temporal del registro" })).toBeVisible();
});

test("a rate limit is explained and no more requests are sent until it resets", async ({ page }) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "repo", name: "Repo", repositoryUrl: `https://github.com/${REPO}` });
  const github = await fakeGitHub(page, [ana]);
  github.rateLimited = true;
  await signIn(page, ana);
  await openProject(page, "Repo");
  await page.evaluate(() => { window.location.hash = "#branches-page"; });
  await expect(page.getByText(/GitHub alcanzó su límite de consultas/).first()).toBeVisible();
  const sent = github.requests.filter((entry) => entry.includes(`/repos/${REPO}`)).length;
  await page.getByRole("button", { name: "Actualizar" }).click();
  await page.waitForTimeout(500);
  expect(github.requests.filter((entry) => entry.includes(`/repos/${REPO}`)).length).toBe(sent);
});

test("branches page layout", async ({ page }) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "repo", name: "Repo", repositoryUrl: `https://github.com/${REPO}` });
  const github = await fakeGitHub(page, [ana]);
  github.commits = [{ sha: "e".repeat(40), message: "Primer cambio", author: "ana-gh", date: new Date().toISOString() }];
  for (const [width, height] of [[1280, 1000], [390, 900]] as const) {
    await page.setViewportSize({ width, height });
    if (width === 1280) { await signIn(page, ana); await openBranches(page, "Repo"); }
    await expect(page.locator(".recentChanges")).toContainText("Primer cambio");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/branches-${width}.png`, fullPage: true });
  }
});
