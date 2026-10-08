import { expect, test } from "@playwright/test";

test("release cards fit both languages, themes and target widths", async ({ page }) => {
  const widths = [375, 768, 1280];
  const variants = [
    { lang: "es", theme: "light", summary: "Une dos cuentas y amplía tu lista de amigos", accountTitle: "Unir dos cuentas Cowork", friendsTitle: "Más amigos, sin tope de cinco", streaksTitle: "Elige qué rachas conservar", state: "En desarrollo" },
    { lang: "es", theme: "dark", summary: "Une dos cuentas y amplía tu lista de amigos", accountTitle: "Unir dos cuentas Cowork", friendsTitle: "Más amigos, sin tope de cinco", streaksTitle: "Elige qué rachas conservar", state: "En desarrollo" },
    { lang: "en", theme: "light", summary: "Join two accounts and grow your friends list", accountTitle: "Merge two Cowork accounts", friendsTitle: "More than five friends", streaksTitle: "Choose which streaks to keep", state: "In development" },
    { lang: "en", theme: "dark", summary: "Join two accounts and grow your friends list", accountTitle: "Merge two Cowork accounts", friendsTitle: "More than five friends", streaksTitle: "Choose which streaks to keep", state: "In development" },
  ] as const;

  for (const width of widths) {
    await page.setViewportSize({ width, height: 960 });
    for (const variant of variants) {
      await page.goto("/novedades");
      await page.evaluate(({ lang, theme }) => {
        localStorage.setItem("cowork.site-lang", lang);
        localStorage.setItem("cowork.site-theme", theme);
      }, variant);
      await page.reload();

      const latestRelease = page.locator("#v0-5-0");
      await expect(page.locator("html")).toHaveAttribute("lang", variant.lang);
      await expect(page.locator(".site")).toHaveAttribute("data-theme", variant.theme);
      await expect(latestRelease).toContainText(variant.state);
      await expect(latestRelease).toContainText(variant.summary);
      await expect(latestRelease).toContainText(variant.accountTitle);
      await expect(latestRelease).toContainText(variant.friendsTitle);
      await expect(latestRelease).toContainText(variant.streaksTitle);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});

test("project release proposals keep the version kind separate from each card group", async ({ page }) => {
  await page.goto("/");
  const parsed = await page.evaluate(async () => {
    const { parseStructuredChangelogHtml } = await import("/src/features/changelog-sync/changelogParser.ts");
    const html = `
      <article class="version">
        <div class="version-meta"><div class="version-num">Unreleased</div></div>
        <div class="grupo"><h3>Cambios</h3><div class="novedad"><b>In development</b><span>Still in progress.</span></div></div>
      </article>
      <article class="version">
        <div class="version-meta"><div class="version-num">1.5.0</div><span class="salto salto--feature">Feature</span></div>
        <div class="grupo"><h3>Nuevo</h3><div class="novedad"><b>New feature</b><span>Added to the project.</span></div></div>
      </article>
      <article class="version">
        <div class="version-meta"><div class="version-num">1.5.1</div><span class="salto salto--arreglo">Arreglo</span></div>
        <div class="grupo"><h3>Cambios</h3><div class="novedad"><b>Adjusted flow</b><span>Improved for teams.</span></div></div>
      </article>
      <article class="version">
        <div class="version-meta"><div class="version-num">2.0.0</div><span class="salto salto--grande">Grande</span></div>
        <div class="grupo"><h3>Arreglos</h3><div class="novedad"><b>Major correction</b><span>Updated release.</span></div></div>
      </article>`;
    return parseStructuredChangelogHtml(html, "https://example.test/novedades")
      .map(({ title, version, releaseKind, section }) => ({ title, version, releaseKind, section }));
  });

  expect(parsed).toEqual([
    { title: "In development", version: "Unreleased", releaseKind: "", section: "changed" },
    { title: "New feature", version: "1.5.0", releaseKind: "feature", section: "added" },
    { title: "Adjusted flow", version: "1.5.1", releaseKind: "fix", section: "changed" },
    { title: "Major correction", version: "2.0.0", releaseKind: "major", section: "fixed" },
  ]);
});
