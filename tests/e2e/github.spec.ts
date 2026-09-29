import { expect, test, type Page } from "@playwright/test";
import { createAccount, openProject, resetEmulators, seedProject, signIn, signOut, type TestAccount } from "./helpers";

// GitHub is never contacted: every api.github.com request is answered here.
const REPO = "equipo/cowork";

type FakeGitHub = { branches: { name: string; sha: string; protected?: boolean }[]; created: { ref: string; sha: string }[]; deleted: string[]; push: boolean };

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, accept, content-type, x-github-api-version",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-expose-headers": "x-oauth-scopes, x-ratelimit-remaining, x-ratelimit-reset",
};

async function fakeGitHub(page: Page, accounts: TestAccount[], push = true): Promise<FakeGitHub> {
  const state: FakeGitHub = {
    branches: [{ name: "main", sha: "a".repeat(40) }, { name: "release", sha: "b".repeat(40), protected: true }, { name: "feature/vieja", sha: "c".repeat(40) }],
    created: [],
    deleted: [],
    push,
  };
  // The token lives in the tab's sessionStorage, as after a real GitHub sign-in.
  await page.addInitScript((uids) => { for (const uid of uids) sessionStorage.setItem(`cowork.github.${uid}`, "gho_prueba"); }, accounts.map((account) => account.uid));
  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname === "/user") return json(200, { login: "ana-gh", avatar_url: "" }, { "x-oauth-scopes": "repo, read:user, user:email" });
    if (url.pathname === `/repos/${REPO}`) return json(200, { full_name: REPO, default_branch: "main", private: true, html_url: `https://github.com/${REPO}`, permissions: { push: state.push } });
    if (url.pathname === `/repos/${REPO}/branches`) return json(200, state.branches.map((branch) => ({ name: branch.name, commit: { sha: branch.sha }, protected: Boolean(branch.protected) })));
    if (url.pathname === `/repos/${REPO}/commits`) return json(200, []);
    if (url.pathname === `/repos/${REPO}/git/refs` && request.method() === "POST") {
      const body = request.postDataJSON() as { ref: string; sha: string };
      state.created.push(body);
      state.branches.push({ name: body.ref.replace(/^refs\/heads\//, ""), sha: "d".repeat(40) });
      return json(201, { ref: body.ref });
    }
    const refPrefix = `/repos/${REPO}/git/refs/heads/`;
    if (url.pathname.startsWith(refPrefix) && request.method() === "DELETE") {
      const name = url.pathname.slice(refPrefix.length).split("/").map(decodeURIComponent).join("/");
      state.deleted.push(name);
      state.branches = state.branches.filter((branch) => branch.name !== name);
      return route.fulfill({ status: 204, headers: CORS });
    }
    return json(404, { message: "Not Found" });
  });
  return state;
}

async function openBranches(page: Page, name: string) {
  await openProject(page, name);
  await page.evaluate(() => { window.location.hash = "#branches-page"; });
  await expect(page.locator(".repoBranchItem").first()).toBeVisible();
}

test.beforeEach(async () => { await resetEmulators(); });

test("the owner creates a branch in GitHub and registers it, then deletes it with confirmation", async ({ page }) => {
  const ana = await createAccount("Ana");
  await seedProject(ana, { id: "repo", name: "Repo", repositoryUrl: `https://github.com/${REPO}` });
  const github = await fakeGitHub(page, [ana]);
  await signIn(page, ana);
  await openBranches(page, "Repo");

  await expect(page.getByText("3 ramas · repositorio privado")).toBeVisible();
  // The default branch and protected branches cannot be deleted from Cowork.
  await expect(page.getByRole("button", { name: "Borrar la rama main en GitHub" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Borrar la rama release en GitHub" })).toHaveCount(0);
  await expect(page.locator(".repoProtected")).toHaveText("protegida");

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
  await expect(page.locator(".branchList .branch", { hasText: "feature/login-github" }).locator(".branchGitHubTag")).toHaveText("en GitHub");
  expect(github.created).toEqual([{ ref: "refs/heads/feature/login-github", sha: "a".repeat(40) }]);
  await expect(page.getByRole("link", { name: "feature/login-github" })).toBeVisible();

  await page.getByRole("button", { name: "Borrar la rama feature/login-github en GitHub" }).click();
  const confirm = page.getByRole("group", { name: "Confirmar borrado de feature/login-github" });
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  expect(github.deleted).toHaveLength(0);
  await page.getByRole("button", { name: "Borrar la rama feature/login-github en GitHub" }).click();
  await confirm.getByRole("button", { name: "Borrar rama" }).click();
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
