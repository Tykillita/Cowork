import { expect, test, type Page } from "@playwright/test";
import { createAccount, openProject, resetEmulators, seedProject, signIn, signOut, type TestAccount } from "./helpers";
import { fakeGitHub, REPO, type FakeGitHub } from "./githubMock";

const APP = `import { useState } from "react";

export function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
`;

let ana: TestAccount;

test.beforeEach(async () => {
  await resetEmulators();
  ana = await createAccount("Ana");
  await seedProject(ana, { id: "repo", name: "Repo", repositoryUrl: `https://github.com/${REPO}` });
});

function seedFiles(github: FakeGitHub) {
  github.files.main = [
    { path: "README.md", content: "# Cowork\n\nEspacio de equipo.\n" },
    { path: "src/App.tsx", content: APP },
    { path: "src/lib/util.ts", content: "export const sum = (a: number, b: number) => a + b;\n" },
    { path: "public/logo.svg", content: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>' },
    { path: "bin/data.bin", content: new Uint8Array([0x00, 0x01, 0x02, 0x03]) },
    { path: "big.txt", content: "x".repeat(1024 * 1024 + 10) },
  ];
  github.files["feature/vieja"] = [
    { path: "README.md", content: "# Cowork\n" },
    { path: "src/App.tsx", content: APP.replace("useState(0)", "useState(1)") },
    { path: "src/nuevo.ts", content: "export const nuevo = true;\n" },
  ];
  github.compare["feature/vieja"] = { ahead: 2, behind: 0, files: [{ filename: "src/App.tsx", status: "modified" }, { filename: "src/nuevo.ts", status: "added" }, { filename: "big.txt", status: "removed" }] };
}

async function openCode(page: Page, hash = "#code") {
  await signIn(page, ana);
  await openProject(page, "Repo");
  await page.evaluate((target) => { window.location.hash = target; }, hash);
  await expect(page.getByRole("tree")).toBeVisible();
}

const item = (page: Page, name: string) => page.getByRole("treeitem", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(,|$)`) });

test("quota exhaustion preserves the tree, branch and downloaded code", async ({ page }) => {
  const github = await fakeGitHub(page, [ana], { token: false });
  seedFiles(github);
  await openCode(page);
  await item(page, "README.md").click();
  await expect(page.locator(".codeViewer .cbText").first()).toContainText("# Cowork");
  await item(page, "src").click();
  await item(page, "App.tsx").click();
  await expect(page.locator(".codeViewer .cbText").first()).toContainText("useState");

  github.rateLimited = true;
  await page.getByRole("button", { name: "Actualizar repositorio" }).click();
  const notice = page.locator(".codeRepositoryNotice");
  await expect(notice).toContainText("GitHub alcanzó su límite de consultas");
  await expect(notice).toContainText("última consulta");
  await expect(notice.getByRole("button", { name: "Conectar GitHub" })).toBeVisible();
  await expect(page.getByRole("tree")).toBeVisible();
  await expect(page.locator(".repoRefName")).toHaveText("main");
  await expect(page.locator(".repoBranches b")).toHaveText("3");
  await expect(page.locator(".codeViewer .cbFilename")).toHaveText("App.tsx");
  const sent = github.requests.length;
  await item(page, "README.md").click();
  await expect(page.locator(".codeViewer .cbText").first()).toContainText("# Cowork");
  await item(page, "App.tsx").click();
  await expect(page.locator(".codeViewer .cbText").first()).toContainText("useState");
  await page.getByRole("button", { name: "Actualizar repositorio" }).click();
  await expect(page.getByRole("button", { name: "Actualizar repositorio" })).toBeEnabled();
  expect(github.requests).toHaveLength(sent);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(notice.getByRole("button", { name: "Conectar GitHub" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width !== 320) await page.screenshot({ path: `test-results/code-rate-limit-${width}.png`, fullPage: true });
  }
});

test("tree, keyboard and a highlighted file with copy, download and full screen", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const github = await fakeGitHub(page, [ana]);
  seedFiles(github);
  await openCode(page);

  // Folders first, then files, in natural order.
  await expect(page.locator(".folderTree > [role=treeitem]")).toHaveText([/bin/, /public/, /src/, /big\.txt/, /README\.md/]);

  await item(page, "bin").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(item(page, "src")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(item(page, "src")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect(item(page, "lib")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(item(page, "src")).toBeFocused();
  // Type-ahead jumps to the next name that starts with what was typed.
  await page.keyboard.type("Ap");
  await expect(item(page, "App.tsx")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#code\?ref=&path=src\/App\.tsx$|#code\?path=src\/App\.tsx$/);

  const block = page.locator(".codeViewer .codeBlock");
  await expect(block.locator(".cbFilename")).toHaveText("App.tsx");
  await expect(block.locator(".cbLine")).toHaveCount(6);
  await expect(block.locator(".cbFooter")).toContainText("TSX");
  // Shiki colours the tokens once its chunk loads.
  await expect(block.locator(".cbText span[style*='color']").first()).toBeVisible();

  await block.getByRole("button", { name: "Copiar el código" }).click();
  await expect(block.getByRole("status")).toHaveText("Copiado");
  // The system clipboard may turn line breaks into CRLF.
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(APP);

  const download = page.waitForEvent("download");
  await block.getByRole("button", { name: "Descargar App.tsx" }).click();
  expect((await download).suggestedFilename()).toBe("App.tsx");

  await block.getByRole("button", { name: "Ver a pantalla completa" }).click();
  const dialog = page.getByRole("dialog", { name: "App.tsx a pantalla completa" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // A line number links to that line; with Shift, to a range.
  await block.locator('.cbNum[data-n="2"]').click();
  await expect(page).toHaveURL(/L=2$/);
  await block.locator('.cbNum[data-n="4"]').click({ modifiers: ["Shift"] });
  await expect(page).toHaveURL(/L=2-4$/);
  await expect(block.locator(".cbLine.isMarked")).toHaveCount(3);
});

test("a deep link opens a branch file at a line, with change marks against main", async ({ page }) => {
  const github = await fakeGitHub(page, [ana]);
  seedFiles(github);
  await openCode(page, "#code?ref=feature/vieja&path=src/App.tsx&L=4");
  await expect(page.getByRole("button", { name: /^Rama: feature\/vieja\./ })).toBeVisible();
  await expect(item(page, "src")).toHaveAttribute("aria-expanded", "true");
  await expect(item(page, "App.tsx")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("treeitem", { name: "App.tsx, modificado" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "nuevo.ts, añadido" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: /^src, 2 cambios/ })).toBeVisible();
  await expect(page.locator(".codeDeleted")).toContainText("Eliminados en esta rama (1)");
  await expect(page.locator('.cbLine[data-line="4"]')).toHaveClass(/isMarked/);
  await expect(page.locator('.cbLine[data-line="4"]')).toContainText("useState(1)");
  await expect(page.locator(".codeChangesChip")).toHaveText("3 cambios respecto a main");
});

test("images, binaries and large files", async ({ page }) => {
  const github = await fakeGitHub(page, [ana]);
  seedFiles(github);
  await openCode(page, "#code?path=public/logo.svg");
  const preview = page.getByRole("region", { name: "Archivo logo.svg" });
  await expect(page.getByRole("img", { name: "Vista previa de logo.svg" })).toBeVisible();
  await expect(preview.locator(".cbFooter")).toContainText("Imagen SVG");
  await expect(preview.locator(".cbFooter")).toContainText("10 × 10 px");
  await expect(preview.locator(".cbFooter")).toContainText("Ampliada ×12");
  await expect(preview.getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", `https://github.com/${REPO}/blob/main/public/logo.svg`);
  await preview.getByRole("button", { name: "Fondo claro" }).click();
  await expect(preview.locator(".cbStage")).toHaveClass(/is-light/);
  // An SVG can also be read as code.
  await preview.getByRole("button", { name: "Código" }).click();
  const source = page.getByRole("region", { name: "Código de logo.svg" });
  await expect(source.locator(".cbLine")).toHaveCount(1);
  await source.getByRole("button", { name: "Vista previa" }).click();
  await expect(page.getByRole("img", { name: "Vista previa de logo.svg" })).toBeVisible();
  await page.evaluate(() => { window.location.hash = "#code?path=bin/data.bin"; });
  await expect(page.locator(".codeViewer")).toContainText("Archivo binario");
  await expect(page.locator(".codeViewer").getByRole("link", { name: "Descargar", exact: true })).toHaveAttribute("href", `https://github.com/${REPO}/raw/main/bin/data.bin`);
  await expect(page.locator(".codeViewer").getByRole("link", { name: /Ver en GitHub/ })).toHaveAttribute("href", `https://github.com/${REPO}/blob/main/bin/data.bin`);
  await page.evaluate(() => { window.location.hash = "#code?path=big.txt"; });
  await expect(page.locator(".codeViewer")).toContainText("demasiado grande");
  // Large files are never downloaded.
  expect(github.requests.filter((request) => request.includes("/git/blobs/")).length).toBe(2);
});

test("a large repository loads folder by folder", async ({ page }) => {
  const github = await fakeGitHub(page, [ana]);
  seedFiles(github);
  github.truncatedTree = true;
  await openCode(page);
  await expect(page.locator(".folderTree > [role=treeitem]")).toHaveText([/bin/, /public/, /src/, /big\.txt/, /README\.md/]);
  await item(page, "src").click();
  await expect(item(page, "App.tsx")).toBeVisible();
  await item(page, "lib").click();
  await expect(item(page, "util.ts")).toBeVisible();
});

test("without a repository, and with a private one before connecting GitHub", async ({ page }) => {
  await seedProject(ana, { id: "sin", name: "Sin repo" });
  const github = await fakeGitHub(page, [ana], { token: false });
  github.repoStatus = 404;
  await signIn(page, ana);
  await openProject(page, "Sin repo");
  await page.evaluate(() => { window.location.hash = "#code"; });
  await expect(page.getByRole("heading", { name: "Este proyecto no tiene repositorio" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Vincular repositorio" })).toHaveAttribute("href", "#settings-page?section=github");

  await page.evaluate(() => { window.location.hash = "#home"; });
  await page.getByRole("button", { name: /Cambiar proyecto|Cambiar/ }).first().click();
  await openProject(page, "Repo");
  await page.evaluate(() => { window.location.hash = "#code"; });
  await expect(page.getByRole("heading", { name: "No se pudo leer el repositorio" })).toBeVisible();
  await expect(page.locator(".codeEmpty")).toContainText("Si es privado, conecta tu cuenta de GitHub");
  await expect(page.getByRole("button", { name: "Conectar GitHub" })).toBeVisible();
});

test("highlighting code is only downloaded on the code page", async ({ page }) => {
  const github = await fakeGitHub(page, [ana]);
  seedFiles(github);
  const scripts: string[] = [];
  const engineScript = /engine-javascript|shiki_engine_javascript/;
  page.on("request", (request) => { if (request.resourceType() === "script") scripts.push(request.url()); });
  await signIn(page, ana);
  await openProject(page, "Repo");
  await expect(page.locator(".homeCode")).toBeVisible();
  expect(scripts.filter((url) => engineScript.test(url) || /\/core-|shiki_core/.test(url))).toEqual([]);
  await page.locator(".homeCode").getByRole("link", { name: /Abrir código/ }).click();
  await item(page, "README.md").click();
  await expect(page.locator(".cbText span[style*='color']").first()).toBeVisible();
  expect(scripts.some((url) => engineScript.test(url))).toBe(true);
});

test("the repository bar: branches and tags, go to file with T, clone menu and refresh", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const github = await fakeGitHub(page, [ana]);
  seedFiles(github);
  github.tags = [{ name: "v1.0", sha: "a".repeat(40) }];
  await openCode(page);

  await expect(page.getByRole("link", { name: "3 ramas. Ver ramas" })).toHaveAttribute("href", "#branches-page");
  await expect(page.getByRole("button", { name: "1 etiqueta. Ver etiquetas" })).toBeVisible();

  // The picker filters as you type and chooses with the keyboard.
  await page.getByRole("button", { name: /^Rama: main\./ }).click();
  const picker = page.getByRole("dialog", { name: "Cambiar rama o etiqueta" });
  await expect(picker.getByRole("option")).toHaveText([/main\s*principal/, "release", "feature/vieja"]);
  await page.keyboard.type("vie");
  await expect(picker.getByRole("option")).toHaveText(["feature/vieja"]);
  await page.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
  await expect(page).toHaveURL(/ref=feature\/vieja/);
  await expect(page.getByRole("button", { name: /^Rama: feature\/vieja\./ })).toBeFocused();
  await expect(item(page, "src")).toBeVisible();

  // The tag count opens the picker on its tab.
  await page.getByRole("button", { name: "1 etiqueta. Ver etiquetas" }).click();
  await expect(picker.getByRole("tab", { name: "Etiquetas" })).toHaveAttribute("aria-selected", "true");
  await picker.getByRole("option", { name: "v1.0" }).click();
  await expect(page).toHaveURL(/ref=v1\.0/);
  await expect(page.getByRole("button", { name: /^Etiqueta: v1\.0\./ })).toBeVisible();
  await expect(item(page, "big.txt")).toBeVisible();

  // "t" jumps to the file finder, as on GitHub.
  await page.locator("body").press("t");
  const finder = page.getByRole("combobox", { name: "Ir a archivo" });
  await expect(finder).toBeFocused();
  await page.keyboard.type("apptsx");
  await expect(page.getByRole("listbox", { name: "Archivos encontrados" }).getByRole("option").first()).toHaveText("src/App.tsx");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/path=src\/App\.tsx/);
  await expect(page.locator(".codeViewer .cbFilename")).toHaveText("App.tsx");

  // "Código": clone commands to copy, the tag's ZIP and the file on GitHub.
  await page.getByRole("button", { name: "Código", exact: true }).click();
  const code = page.getByRole("dialog", { name: "Clonar o descargar" });
  await expect(code.getByRole("textbox")).toHaveValue(`https://github.com/${REPO}.git`);
  await code.getByRole("button", { name: "Copiar" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://github.com/${REPO}.git`);
  await code.getByRole("tab", { name: "SSH" }).click();
  await expect(code.getByRole("textbox")).toHaveValue(`git@github.com:${REPO}.git`);
  await expect(code.getByRole("link", { name: /Descargar ZIP/ })).toHaveAttribute("href", `https://github.com/${REPO}/archive/refs/tags/v1.0.zip`);
  await expect(code.getByRole("link", { name: /Abrir en GitHub/ })).toHaveAttribute("href", `https://github.com/${REPO}/blob/v1.0/src/App.tsx`);
  await page.keyboard.press("Escape");
  await expect(code).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Código", exact: true })).toBeFocused();

  const branchReads = () => github.requests.filter((request) => request.startsWith(`GET /repos/${REPO}/branches`)).length;
  const before = branchReads();
  await page.getByRole("button", { name: "Actualizar repositorio" }).click();
  await expect.poll(branchReads).toBeGreaterThan(before);
  await expect(page.locator(".codeViewer .cbFilename")).toHaveText("App.tsx");
});

test("proposed files wait for review: a member proposes, the owner rejects or commits them to GitHub", async ({ page }) => {
  const beto = await createAccount("Beto");
  await seedProject(ana, { id: "repo", name: "Repo", repositoryUrl: `https://github.com/${REPO}`, members: [beto] });
  const github = await fakeGitHub(page, [ana, beto]);
  seedFiles(github);
  const review = page.getByRole("region", { name: "Revisión del archivo propuesto" });

  await signIn(page, beto);
  await openProject(page, "Repo");
  await page.evaluate(() => { window.location.hash = "#code?path=src/App.tsx"; });
  await expect(page.locator(".codeViewer .cbFilename")).toHaveText("App.tsx");
  await page.getByRole("button", { name: "Añadir archivo" }).click();
  await page.getByRole("menuitem", { name: /Crear archivo nuevo/ }).click();
  const editor = page.getByRole("form", { name: "Proponer archivo nuevo" });
  await expect(editor.getByRole("textbox", { name: "Ruta en el repositorio" })).toHaveValue("src/");
  await editor.getByRole("textbox", { name: "Ruta en el repositorio" }).fill("src/guia.md");
  await editor.getByRole("textbox", { name: "Contenido" }).fill("# Guía\n\nPasos.\n");
  await editor.getByRole("button", { name: "Proponer archivo" }).click();
  await expect(page).toHaveURL(/path=src\/guia\.md/);
  await expect(page.getByRole("treeitem", { name: "guia.md, pendiente de revisión" })).toBeVisible();
  await expect(review).toContainText("Beto lo propuso");
  await expect(review).toContainText("Lo revisa el propietario del proyecto.");
  await expect(review.getByRole("button", { name: "Aprobar y subir a GitHub" })).toHaveCount(0);
  await expect(page.locator(".codeViewer .cbLine")).toHaveCount(3);

  // A second one, uploaded, to be rejected.
  await page.getByRole("button", { name: "Añadir archivo" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: /Subir archivos/ }).click();
  await (await chooser).setFiles({ name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("borrador\n") });
  await expect(page.locator(".codeNotice")).toContainText("1 archivo propuesto");
  await expect(page.getByRole("button", { name: /^2 archivos pendientes de revisión/ })).toBeVisible();
  await signOut(page);

  await signIn(page, ana);
  await openProject(page, "Repo");
  await page.evaluate(() => { window.location.hash = "#code"; });
  await page.getByRole("button", { name: /^2 archivos pendientes de revisión/ }).click();
  await page.getByRole("dialog", { name: "Archivos propuestos" }).getByRole("button", { name: /notas\.txt/ }).click();
  await review.getByRole("button", { name: "Rechazar" }).click();
  await review.getByRole("textbox", { name: "Motivo (opcional)" }).fill("Ya está en la wiki");
  await review.getByRole("button", { name: "Rechazar archivo" }).click();
  await expect(review).toContainText("Ana lo rechazó: Ya está en la wiki");
  await expect(page.getByRole("treeitem", { name: "notas.txt, rechazado en la revisión" })).toBeVisible();

  await page.evaluate(() => { window.location.hash = "#code?path=src/guia.md"; });
  await review.getByRole("button", { name: "Aprobar y subir a GitHub" }).click();
  await expect(page.locator(".codeNotice")).toContainText("src/guia.md ya está en GitHub, en main.");
  expect(github.uploaded).toEqual([{ path: "src/guia.md", branch: "main", message: "Añadir guia.md\n\nPropuesto por Beto en Cowork.", content: "# Guía\n\nPasos.\n", sha: undefined }]);
  await expect(page.getByRole("treeitem", { name: "guia.md", exact: true })).toBeVisible();
  await expect(review).toHaveCount(0);
  await expect(page.locator(".codeViewer .cbLine")).toHaveCount(3);
  await signOut(page);

  // The author sees the rejection and drops the file.
  await signIn(page, beto);
  await openProject(page, "Repo");
  await page.evaluate(() => { window.location.hash = "#code?path=src/notas.txt"; });
  await expect(review).toContainText("Ya está en la wiki");
  await review.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByRole("treeitem", { name: /notas\.txt/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /pendientes de revisión/ })).toHaveCount(0);
});

for (const [width, height] of [[1280, 900], [390, 844]] as const) {
  test(`code page layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const github = await fakeGitHub(page, [ana]);
    seedFiles(github);
    await openCode(page);
    await expect.poll(() => page.locator(".ftChevron").first().evaluate((node) => getComputedStyle(node).transitionDuration)).toBe("0s");
    // Menus are anchored on desktop and a centred modal on phones.
    await page.getByRole("button", { name: /^Rama: main\./ }).click();
    const picker = page.getByRole("dialog", { name: "Cambiar rama o etiqueta" });
    expect(await picker.evaluate((node) => getComputedStyle(node).position)).toBe(width === 390 ? "fixed" : "absolute");
    const box = await picker.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/code-picker-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await item(page, "src").click();
    await item(page, "App.tsx").click();
    await expect(page.locator(".codeViewer .cbLine").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390) {
      // One thing at a time: the file replaces the tree, with a way back.
      await expect(page.getByRole("tree")).toBeHidden();
      await page.getByRole("button", { name: "← Archivos" }).click();
      await expect(page.getByRole("tree")).toBeVisible();
      await item(page, "App.tsx").click();
    }
    await page.screenshot({ path: `test-results/code-${width}.png`, fullPage: true });
  });
}

for (const width of [320, 390, 600, 640, 800, 1280]) {
  test(`repository toolbar fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const github = await fakeGitHub(page, [ana]);
    seedFiles(github);
    const long = "feature/una-rama-con-un-nombre-muy-largo-para-comprobar-el-ancho";
    github.branches.push({ name: long, sha: "d".repeat(40) });
    github.files[long] = github.files.main;
    await openCode(page, `#code?ref=${long}`);
    const toolbar = page.locator(".repoToolbar");
    const trigger = toolbar.getByRole("button", { name: "Ir a archivo", exact: true });
    const finder = toolbar.getByRole("combobox", { name: "Ir a archivo" });
    await expect(toolbar.locator(".repoRefButton")).toHaveAttribute("title", long);
    await expect(toolbar.getByRole("link", { name: "4 ramas. Ver ramas" })).toHaveAttribute("title", "4 ramas. Ver ramas");
    if (width <= 800) {
      await expect(trigger).toBeVisible();
      await expect(finder).toBeHidden();
      await expect(toolbar.locator(".repoBranches b")).toBeHidden();
      await expect(toolbar.locator(".repoAddButton .repoButtonLabel")).toBeHidden();
      const refs = await toolbar.locator(".repoToolbarRefs").boundingBox();
      const actions = await toolbar.locator(".repoToolbarActions").boundingBox();
      if (width < 600) expect(actions!.y).toBeGreaterThan(refs!.y);
      else expect(actions!.y).toBe(refs!.y);
    } else {
      await expect(trigger).toBeHidden();
      await expect(finder).toBeVisible();
      await expect(toolbar.locator(".repoBranches b")).toBeVisible();
    }
    for (const control of await toolbar.locator("button:visible, a:visible, input:visible").all()) {
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/code-toolbar-${width}.png` });
  });
}

test("files explorer searches, shares the tree, switches refs and restores focus @mobile", async ({ page }) => {
  await page.setViewportSize({ width: 634, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const github = await fakeGitHub(page, [ana]);
  seedFiles(github);
  await openCode(page);
  const trigger = page.locator(".repoToolbar").getByRole("button", { name: "Ir a archivo", exact: true });
  const files = page.getByRole("dialog", { name: "Archivos", exact: true });
  const finder = files.getByRole("combobox", { name: "Ir a archivo" });
  const treeReads = () => github.requests.filter((request) => request.includes("/git/trees/")).length;
  const reads = treeReads();
  await trigger.click();
  await expect(finder).toBeFocused();
  expect(await files.evaluate((node) => node.matches(":modal"))).toBe(true);
  expect(await files.evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
  expect(treeReads()).toBe(reads);
  await files.getByRole("button", { name: "Cerrar archivos" }).focus();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".repoFilesDialog")))).toBe(true);

  await files.getByRole("treeitem", { name: "src", exact: true }).click();
  await expect(files.getByRole("treeitem", { name: "App.tsx", exact: true })).toBeVisible();
  await files.getByRole("button", { name: "Cerrar archivos" }).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("treeitem", { name: "App.tsx", exact: true })).toBeVisible();

  await page.locator("body").press("t");
  await expect(finder).toBeFocused();
  await files.getByRole("button", { name: /^Rama: main\./ }).click();
  const picker = files.getByRole("dialog", { name: "Cambiar rama o etiqueta" });
  expect(await picker.evaluate((node) => getComputedStyle(node).position)).toBe("absolute");
  await picker.getByRole("option", { name: "feature/vieja" }).click();
  await expect(files).toBeVisible();
  await expect(page).toHaveURL(/ref=feature\/vieja/);
  await expect(finder).toBeFocused();
  await finder.fill("apptsx");
  await expect(files.getByRole("listbox", { name: "Archivos encontrados" }).getByRole("option").first()).toHaveText("src/App.tsx");
  await expect(files.getByRole("tree")).toHaveCount(0);
  await finder.press("Enter");
  await expect(files).toHaveCount(0);
  await expect(page.locator(".codeViewer .cbFilename")).toHaveText("App.tsx");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(files.getByRole("treeitem", { name: /^App\.tsx/ })).toHaveAttribute("aria-selected", "true");
  await files.getByRole("button", { name: "Añadir archivo" }).click();
  await expect(files.getByRole("menu", { name: "Añadir archivo" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(files).toBeVisible();
  await expect(files.getByRole("button", { name: "Añadir archivo" })).toBeFocused();
  await files.getByRole("button", { name: "Enfocar búsqueda de archivos" }).click();
  await finder.fill("no-existe-archivo");
  await expect(files).toContainText("Ningún archivo coincide");
  await finder.press("Escape");
  await expect(finder).toHaveValue("");
  await expect(files.getByRole("tree")).toBeVisible();
  await page.screenshot({ path: "test-results/code-files-dialog-634.png" });
  await finder.press("Escape");
  await expect(files).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(2, 2);
  await expect(files).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("files explorer proposes and uploads files from its plus menu @mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const github = await fakeGitHub(page, [ana]);
  seedFiles(github);
  await openCode(page);
  const trigger = page.locator(".repoToolbar").getByRole("button", { name: "Ir a archivo", exact: true });
  const files = page.getByRole("dialog", { name: "Archivos", exact: true });
  await trigger.click();
  await files.getByRole("button", { name: "Añadir archivo" }).click();
  await files.getByRole("menuitem", { name: /Crear archivo nuevo/ }).click();
  await expect(files).toHaveCount(0);
  const editor = page.getByRole("form", { name: "Proponer archivo nuevo" });
  await editor.getByRole("textbox", { name: "Ruta en el repositorio" }).fill("guia-modal.md");
  await editor.getByRole("textbox", { name: "Contenido" }).fill("# Guía del modal\n");
  await editor.getByRole("button", { name: "Proponer archivo" }).click();
  await expect(page.locator(".codeNotice")).toContainText("Propusiste guia-modal.md");
  await trigger.click();
  await expect(files.getByRole("treeitem", { name: /guia-modal\.md, pendiente de revisión/ })).toBeVisible();
  await files.getByRole("button", { name: "Añadir archivo" }).click();
  const chooser = page.waitForEvent("filechooser");
  await files.getByRole("menuitem", { name: /Subir archivos/ }).click();
  await (await chooser).setFiles({ name: "desde-modal.txt", mimeType: "text/plain", buffer: Buffer.from("subido desde el modal\n") });
  await expect(files).toHaveCount(0);
  await expect(page.locator(".codeNotice")).toContainText("1 archivo propuesto");
  await expect(page.getByRole("button", { name: /^2 archivos pendientes de revisión/ })).toBeVisible();
  expect(github.uploaded).toHaveLength(0);
});

test("files explorer keeps lazy folders and closes when returning to desktop @mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const github = await fakeGitHub(page, [ana]);
  seedFiles(github);
  github.truncatedTree = true;
  await openCode(page);
  const trigger = page.locator(".repoToolbar").getByRole("button", { name: "Ir a archivo", exact: true });
  const files = page.getByRole("dialog", { name: "Archivos", exact: true });
  await trigger.click();
  await files.getByRole("treeitem", { name: "src", exact: true }).click();
  await expect(files.getByRole("treeitem", { name: "App.tsx", exact: true })).toBeVisible();
  const reads = github.requests.filter((request) => request.includes("/git/trees/")).length;
  await files.getByRole("treeitem", { name: "App.tsx", exact: true }).click();
  await expect(files).toHaveCount(0);
  await expect(page.locator(".codeViewer .cbFilename")).toHaveText("App.tsx");
  await trigger.click();
  await expect(files.getByRole("treeitem", { name: "App.tsx", exact: true })).toBeVisible();
  expect(github.requests.filter((request) => request.includes("/git/trees/")).length).toBe(reads);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(files).toHaveCount(0);
  await expect(page.locator(".repoToolbar").getByRole("combobox", { name: "Ir a archivo" })).toBeFocused();
});

test("files explorer skeleton keeps its shape until data arrives @mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const github = await fakeGitHub(page, [ana]);
  seedFiles(github);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/repos/equipo/cowork/branches?*", async (route) => { await gate; await route.fallback(); });
  try {
    await signIn(page, ana);
    await openProject(page, "Repo");
    await page.evaluate(() => { window.location.hash = "#code"; });
    await page.locator(".repoToolbar").getByRole("button", { name: "Ir a archivo", exact: true }).click();
    const files = page.getByRole("dialog", { name: "Archivos", exact: true });
    await expect(files.getByRole("status", { name: "Cargando archivos" })).toBeVisible();
    const before = await files.locator(".repoFilesControls").boundingBox();
    await page.screenshot({ path: "test-results/code-files-dialog-skeleton-390.png" });
    release();
    await expect(files.getByRole("tree")).toBeVisible();
    await expect(files.getByRole("combobox", { name: "Ir a archivo" })).toBeFocused();
    const after = await files.locator(".repoFilesControls").boundingBox();
    expect(after).toEqual(before);
    await page.screenshot({ path: "test-results/code-files-dialog-390.png" });
  } finally { release(); }
});

for (const failed of [false, true]) {
  test(`files explorer shows ${failed ? "repository errors" : "an empty repository"} @mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const github = await fakeGitHub(page, [ana]);
    github.repoStatus = failed ? 500 : 200;
    await signIn(page, ana);
    await openProject(page, "Repo");
    await page.evaluate(() => { window.location.hash = "#code"; });
    await page.locator(".repoToolbar").getByRole("button", { name: "Ir a archivo", exact: true }).click();
    const files = page.getByRole("dialog", { name: "Archivos", exact: true });
    if (failed) await expect(files.getByRole("alert")).toContainText("Server Error");
    else await expect(files).toContainText("El repositorio todavía no tiene archivos.");
    await expect(files.getByRole("status", { name: "Cargando archivos" })).toHaveCount(0);
    await files.getByRole("button", { name: "Cerrar archivos" }).click();
    await expect(files).toHaveCount(0);
  });
}
