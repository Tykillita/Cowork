import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { createAccount, openProject, PROJECT_ID, resetEmulators, seedProject, seedTasks, signIn } from "./helpers";
import { fakeGitHub, REPO } from "./githubMock";

/*
 * Screenshots of the presentation video (docs/VIDEO.md), from a realistic sample
 * project in the emulators. Skipped in the normal suite; run it with:
 *   npm run video:capture
 * The images land in docs/video/source/shots/ (git-ignored).
 */
test.skip(!process.env.CAPTURE_TOUR, "Solo para generar el video: npm run video:capture");
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });

const OUT = "docs/video/source/shots";
const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();
const day = (offsetDays: number) => iso(offsetDays).slice(0, 10);

const APP = `import { useState } from "react";
import { Board } from "./features/board/Board";
import { useTasks } from "./features/tasks/useTasks";

export function App() {
  const { tasks, move } = useTasks("vigilia");
  const [view, setView] = useState<"board" | "list">("board");

  return (
    <main className="app">
      <header>
        <h1>Vigilia</h1>
        <button onClick={() => setView(view === "board" ? "list" : "board")}>
          {view === "board" ? "Ver lista" : "Ver tablero"}
        </button>
      </header>
      <Board tasks={tasks} view={view} onMove={move} />
    </main>
  );
}
`;

async function seedWorld() {
  await resetEmulators();
  const ana = await createAccount("Ana");
  const beto = await createAccount("Beto");
  const carla = await createAccount("Carla");
  await seedProject(ana, {
    id: "vigilia", name: "Vigilia", description: "Panel de guardias del hospital", repositoryUrl: `https://github.com/${REPO}`, members: [beto, carla], githubPolicy: { branchWrite: "members" },
    createdAt: iso(-20),
    schedule: { startDate: day(-20), endDate: day(12), timeZone: "America/Panama", startsAt: iso(-20), endsAt: iso(13) },
  });
  const env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const milestone = (id: string, title: string, due: number) => setDoc(doc(db, "projects", "vigilia", "milestones", id), {
      id, title, description: "", dueDate: day(due), timeZone: "America/Panama", dueAt: iso(due + 1), archived: false, createdAt: iso(-18), createdByUid: ana.uid, revision: 1, updatedByUid: ana.uid,
    });
    await milestone("m1", "Beta privada", 4);
    await milestone("m2", "Lanzamiento", 12);
    const branch = (id: string, name: string, reason: string, by = beto) => setDoc(doc(db, "projects", "vigilia", "branches", id), { id, name, reason, by: by.name, createdByUid: by.uid, createdAt: iso(-3), githubCreated: true });
    await branch("b1", "feature/tablero", "Tablero de guardias con arrastre");
    await branch("b2", "fix/turnos-noche", "Turnos que cruzan la medianoche", carla);
    const events: [string, string, string, number, Record<string, unknown>, typeof ana][] = [
      ["task-t2-2", "t2", "Diseñar la vista de guardias", 2, { status: { from: "Pendiente", to: "En curso" } }, beto],
      ["task-t6-2", "t6", "Avisos por correo", 2, { status: { from: "En curso", to: "Hecha" } }, carla],
      ["task-t4-1", "t4", "Exportar turnos a PDF", 1, {}, ana],
      ["task-t3-2", "t3", "Turnos que cruzan la medianoche", 2, { assignee: { fromUid: "", toUid: carla.uid, fromName: "", toName: carla.name } }, ana],
    ];
    for (const [index, [id, targetId, title, revision, changes, actor]] of events.entries()) {
      await setDoc(doc(db, "projects", "vigilia", "events", id), {
        id, projectId: "vigilia", kind: revision === 1 ? "created" : "updated", targetType: "task", targetId, targetTitle: title, revision, actorUid: actor.uid, actorName: actor.name,
        createdAt: Timestamp.fromMillis(Date.now() - (index + 1) * 23 * 60_000), changes,
      });
    }
    await setDoc(doc(db, "projects", "vigilia", "fileDrafts", "fguia"), {
      id: "fguia", ref: "main", path: "docs/guia-de-guardias.md", encoding: "utf-8", size: 412, message: "Añadir la guía de guardias", status: "pending",
      authorUid: beto.uid, authorName: beto.name, createdAt: iso(-0.08), reviewNote: "", reviewedByUid: "", reviewerName: "",
    });
    await setDoc(doc(db, "projects", "vigilia", "fileDraftContents", "fguia"), { id: "fguia", content: "# Guía de guardias\n\nCada guardia dura doce horas y empieza a las 7:00 o a las 19:00.\n\n## Cambios de turno\n\n1. Pide el cambio en el tablero con la etiqueta «turno».\n2. Quien lo acepta se asigna la tarea.\n3. Coordinación lo aprueba antes del viernes.\n\n## Urgencias\n\nLlama al 4410 si nadie responde en quince minutos.\n" });
  });
  await env.cleanup();
  const checklist = (done: number, total: number) => JSON.stringify(Array.from({ length: total }, (_, index) => ({ id: `c${index}`, text: ["Boceto", "Revisión con Coordinación", "Versión móvil", "Pruebas", "Accesibilidad"][index] ?? `Paso ${index + 1}`, done: index < done })));
  const details = (priority: string, due: number | null, steps: [number, number] | null, branchName = "") => ({
    description: "", priority, dueDate: due === null ? "" : day(due), timeZone: due === null ? "" : "America/Panama", dueAt: due === null ? "" : iso(due + 1),
    checklist: steps ? checklist(...steps) : "", branch: branchName, createdAt: iso(-10), createdByUid: ana.uid,
  });
  await seedTasks("vigilia", [
    { id: "t1", title: "Calendario de guardias por servicio", status: "Pendiente", assignee: ana, milestoneId: "m1", details: details("alta", 3, [1, 4]) },
    { id: "t4", title: "Exportar turnos a PDF", status: "Pendiente", milestoneId: "m2", details: details("media", 9, null) },
    { id: "t5", title: "Permisos por servicio", status: "Pendiente", assignee: beto, milestoneId: "m2", details: details("baja", null, [0, 3]) },
    { id: "t2", title: "Diseñar la vista de guardias", status: "En curso", assignee: beto, milestoneId: "m1", details: { ...details("alta", 2, [3, 5], "feature/tablero"), description: "Vista semanal con arrastre para cambiar turnos entre personas del mismo servicio." } },
    { id: "t3", title: "Turnos que cruzan la medianoche", status: "En curso", assignee: carla, milestoneId: "m1", details: details("media", 4, [1, 3], "fix/turnos-noche") },
    { id: "t6", title: "Avisos por correo", status: "Hecha", assignee: carla, milestoneId: "m1", details: details("media", null, [3, 3]) },
    { id: "t7", title: "Inicio de sesión con Google", status: "Hecha", assignee: ana, milestoneId: "m1", details: details("alta", null, null) },
  ], ana);
  return { ana, beto, carla };
}

function seedGitHub(github: Awaited<ReturnType<typeof fakeGitHub>>) {
  github.branches = [
    { name: "main", sha: "a".repeat(40) },
    { name: "feature/tablero", sha: "c".repeat(40) },
    { name: "fix/turnos-noche", sha: "d".repeat(40) },
    { name: "release/beta", sha: "b".repeat(40), protected: true },
  ];
  github.tags = [{ name: "v0.1.0", sha: "a".repeat(40) }];
  const files = [
    { path: "README.md", content: "# Vigilia\n\nPanel de guardias del hospital.\n" },
    { path: "package.json", content: '{\n  "name": "vigilia",\n  "private": true\n}\n' },
    { path: "vite.config.ts", content: 'import { defineConfig } from "vite";\nexport default defineConfig({});\n' },
    { path: "src/App.tsx", content: APP },
    { path: "src/main.tsx", content: 'import { createRoot } from "react-dom/client";\nimport { App } from "./App";\n\ncreateRoot(document.getElementById("root")!).render(<App />);\n' },
    { path: "src/features/board/Board.tsx", content: "export function Board() { return null; }\n" },
    { path: "src/features/tasks/useTasks.ts", content: "export function useTasks() { return { tasks: [], move() {} }; }\n" },
    { path: "src/styles/app.css", content: ".app { display: grid; }\n" },
    { path: "public/favicon.svg", content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#08090b"/></svg>' },
    { path: "docs/turnos.md", content: "# Turnos\n" },
  ];
  github.files.main = files;
  github.files["feature/tablero"] = [...files, { path: "src/features/board/Column.tsx", content: "export function Column() { return null; }\n" }];
  github.files["fix/turnos-noche"] = files;
  github.compare["feature/tablero"] = { ahead: 4, behind: 1, files: [{ filename: "src/features/board/Board.tsx", status: "modified" }, { filename: "src/features/board/Column.tsx", status: "added" }] };
  github.compare["fix/turnos-noche"] = { ahead: 2, behind: 0, files: [{ filename: "src/features/tasks/useTasks.ts", status: "modified" }] };
  github.compare["release/beta"] = { ahead: 0, behind: 3, files: [] };
  const commit = (sha: string, message: string, author: string, hours: number) => ({ sha: sha.repeat(40).slice(0, 40), message, author, date: iso(-hours / 24) });
  github.commits = [commit("1", "Avisos por correo al cambiar un turno", "carla-dev", 2), commit("2", "Inicio de sesión con Google", "ana-dev", 20), commit("3", "Estructura inicial", "ana-dev", 70)];
  github.branchCommits["feature/tablero"] = [commit("4", "Arrastrar turnos entre columnas", "beto-dev", 1), commit("5", "Columnas del tablero", "beto-dev", 5)];
  github.pulls = [{ number: 12, title: "Tablero de guardias", head: "feature/tablero" }];
}

async function shot(page: Page, name: string) {
  // The streak celebration of the day would cover every shot.
  const celebration = page.getByRole("button", { name: "Cerrar celebración" });
  if (await celebration.isVisible().catch(() => false)) await celebration.click();
  // No focus ring left over from closing a menu.
  if (!name.includes("find") && !name.includes("clone")) await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(700);
  await expect(page.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 15_000 }).catch(() => undefined);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test("capture the tour", async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { ana } = await seedWorld();
  const github = await fakeGitHub(page, [ana]);
  seedGitHub(github);
  await page.addInitScript(() => { localStorage.setItem("cowork.task-view", "board"); localStorage.setItem("cowork.site-theme", "dark"); localStorage.setItem("cowork.site-lang", "es"); });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Crear un proyecto" })).toBeVisible();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/portal.png` });

  await signIn(page, ana);
  await shot(page, "picker");
  await openProject(page, "Vigilia");
  await page.getByRole("button", { name: "Cerrar celebración" }).click({ timeout: 6000 }).catch(() => undefined);
  await shot(page, "home");

  await page.evaluate(() => { window.location.hash = "#work"; });
  await expect(page.locator(".kanbanColumn").first()).toBeVisible();
  await shot(page, "board");
  await page.evaluate(() => { window.location.hash = "#work?task=t2"; });
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "task");
  await page.keyboard.press("Escape");

  await page.evaluate(() => { window.location.hash = "#branches-page"; });
  await expect(page.locator(".branchRow").first()).toBeVisible();
  await shot(page, "branches");

  await page.evaluate(() => { window.location.hash = "#code?path=src/App.tsx&L=7-8"; });
  await expect(page.locator(".codeViewer .cbFilename")).toHaveText("App.tsx");
  await shot(page, "code");
  await page.getByRole("combobox", { name: "Ir a archivo" }).click();
  await page.keyboard.type("board");
  await shot(page, "code-find");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Código", exact: true }).click();
  await shot(page, "code-clone");
  await page.keyboard.press("Escape");

  await page.evaluate(() => { window.location.hash = "#code?path=docs/guia-de-guardias.md"; });
  await expect(page.getByRole("region", { name: "Revisión del archivo propuesto" })).toBeVisible();
  await shot(page, "review");

  await page.goto("/novedades");
  await expect(page.locator(".siteVersion").first()).toBeVisible();
  await shot(page, "novedades");
});
