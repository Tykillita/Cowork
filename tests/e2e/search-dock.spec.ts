import { expect, test, type Page } from "@playwright/test";
import { createAccount, resetEmulators, seedProject, signIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await resetEmulators();
  const owner = await createAccount("Buscadora");
  for (const [id, name, description] of [["vigilia", "Vigilia", "Admisiones de emergencia"], ["diseno", "Diseño UX", "Investigación y prototipos"], ["api", "API", "Servicio de datos"], ["web", "Sitio web", "Contenido del equipo"], ["movil", "App móvil", "Experiencia móvil"]]) {
    await seedProject(owner, { id, name, description });
  }
  await signIn(page, owner);
});

type Frame = { width: number; x: number; y: number; modal: boolean; kind: string; running: boolean };
type SampleWindow = Window & { searchFrames: Frame[]; stopSearchSampling?: () => void };

async function sampleMotion(page: Page) {
  await page.evaluate(() => {
    const state = window as unknown as SampleWindow;
    state.stopSearchSampling?.();
    const frames: Frame[] = [];
    state.searchFrames = frames;
    const trigger = document.querySelector<HTMLElement>(".projectSearchDockToggle")!;
    const group = document.querySelector(".projectPickerActionGroup")!;
    const capture = (kind: string) => {
      const box = trigger.getBoundingClientRect();
      const running = trigger.getAnimations().some((animation) => "transitionProperty" in animation && animation.transitionProperty === "width" && animation.playState === "running");
      frames.push({ width: box.width, x: box.x, y: box.y, modal: Boolean(document.querySelector<HTMLDialogElement>(".projectSearchDockDialog")?.open), kind, running });
    };
    let frameId = 0;
    let ticks = 0;
    const tick = () => { capture("frame"); if (++ticks < 120) frameId = requestAnimationFrame(tick); };
    const onStart = (event: TransitionEvent) => { if (event.propertyName === "width") capture("width-start"); };
    const onEnd = (event: TransitionEvent) => { if (event.propertyName === "width") capture("width-end"); };
    trigger.addEventListener("transitionrun", onStart);
    trigger.addEventListener("transitionend", onEnd);
    const observer = new MutationObserver(() => capture("mutation"));
    observer.observe(group, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    frameId = requestAnimationFrame(tick);
    state.stopSearchSampling = () => {
      cancelAnimationFrame(frameId);
      trigger.removeEventListener("transitionrun", onStart);
      trigger.removeEventListener("transitionend", onEnd);
      observer.disconnect();
    };
  });
}
test("desktop dock stays below the action row; query and project selection work", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const trigger = page.getByRole("button", { name: "Buscar proyectos", exact: true });
  const team = page.getByRole("button", { name: "Unirme a un proyecto" });
  const initial = (await trigger.boundingBox())!;
  const initialTeam = (await team.boundingBox())!;
  const initialPreview = (await page.locator(".projectPreviewColumn").boundingBox())!;
  await trigger.click();
  await expect(page.getByRole("searchbox")).toBeFocused();
  const expanded = (await trigger.boundingBox())!;
  const expandedTeam = (await team.boundingBox())!;
  expect(expanded.width).toBeGreaterThan(initial.width + 20);
  expect(Math.abs(expanded.x - initial.x)).toBeLessThan(1);
  expect(Math.abs(expanded.y - initial.y)).toBeLessThan(1);
  expect(Math.abs(expandedTeam.x - initialTeam.x)).toBeLessThan(1);
  expect(Math.abs(expandedTeam.y - initialTeam.y)).toBeLessThan(1);
  expect(Math.abs((await page.locator(".projectPreviewColumn").boundingBox())!.y - initialPreview.y)).toBeLessThan(1);
  const panel = page.locator("section.projectSearchDockPanel");
  expect((await panel.boundingBox())!.y).toBeGreaterThan(expanded.y + expanded.height);
  await expect(page.locator(".projectSearchDockDialog")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("search-desktop.png"), fullPage: true });
  await page.getByRole("searchbox").fill("emergencia");
  await expect(page.locator(".projectSearchDockResult")).toHaveCount(1);
  await page.locator(".projectSearchDockResult").click();
  await expect(page.getByRole("heading", { name: "Vigilia", exact: true, level: 1 })).toBeVisible();
});

test("mobile expands first, then opens a bounded modal; closes before contracting @mobile", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.locator(".projectSearchDockToggle");
  const initial = (await trigger.boundingBox())!;
  const team = (await page.locator(".projectJoinButton").boundingBox())!;
  expect(Math.abs(initial.y - team.y)).toBeLessThan(1);
  await sampleMotion(page);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Buscar proyectos" });
  await expect(page.getByRole("searchbox")).toBeFocused();
  await expect(page.locator(".projectPickerActionGroup")).toHaveAttribute("data-search-phase", "open");
  const expanded = (await trigger.boundingBox())!;
  const frames = await page.evaluate(() => (window as unknown as SampleWindow).searchFrames);
  expect(frames.some((frame) => frame.kind === "width-start" && !frame.modal), JSON.stringify(frames)).toBe(true);
  expect(frames.filter((frame) => frame.modal).every((frame) => Math.abs(frame.width - expanded.width) < 1 && !frame.running)).toBe(true);
  expect(Math.abs(expanded.x - initial.x)).toBeLessThan(1);
  expect(Math.abs(expanded.y - initial.y)).toBeLessThan(1);
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(12);
  expect(bounds.y).toBeGreaterThanOrEqual(12);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(832);
  await page.screenshot({ path: info.outputPath("search-mobile.png"), fullPage: true });
  await page.getByRole("searchbox").fill("DISENO");
  await expect(page.locator(".projectSearchDockResult")).toHaveCount(1);
  await expect(page.locator(".projectSearchDockResult")).toContainText("Diseño UX");
  await sampleMotion(page);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect.poll(async () => (await trigger.boundingBox())!.width).toBe(44);
  await expect(dialog).toHaveCount(0);
  const closing = await page.evaluate(() => (window as unknown as SampleWindow).searchFrames);
  expect(closing.some((frame) => frame.kind === "width-start" && !frame.modal), JSON.stringify(closing)).toBe(true);
  expect(closing.filter((frame) => frame.modal).every((frame) => Math.abs(frame.width - expanded.width) < 1)).toBe(true);
  await trigger.click();
  await expect(page.getByRole("searchbox")).toHaveValue("DISENO");
  await page.locator(".projectSearchDockResult").click();
  await expect(page.getByRole("heading", { level: 1, name: "Diseño UX", exact: true })).toBeVisible();
});

test("small viewport, outside dismissal and resize preserve focus @mobile", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const trigger = page.locator(".projectSearchDockToggle");
  await trigger.click();
  await expect(page.getByRole("searchbox")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("search-mobile-small.png"), fullPage: true });
  await page.mouse.click(4, 4);
  await expect(trigger).toBeFocused();
  await expect(page.locator(".projectSearchDockDialog")).toHaveCount(0);
  await trigger.click();
  await page.getByRole("searchbox").fill("API");
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator(".projectSearchDockDialog")).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveValue("API");
  await expect(page.locator("section.projectSearchDockPanel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
});

test("system reduced motion opens and dismisses without waiting for transitions @mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  const trigger = page.locator(".projectSearchDockToggle");
  await trigger.click();
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.getByRole("button", { name: "Cerrar búsqueda" }).click();
  await expect(trigger).toBeFocused();
  await expect(page.locator(".projectSearchDockDialog")).toHaveCount(0);
});
