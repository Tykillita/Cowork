import { describe, expect, test } from "vitest";
import { normalizeTaskTitle, parseChangelogMarkdown, releaseKindFromBadge } from "../../src/features/changelog-sync/changelogParser";
import { normalizeChangelogUrl } from "../../src/features/projects/projectUrls";

describe("project release notes parsing", () => {
  test("normalizes task titles for exact, accent-insensitive matching", () => {
    expect(normalizeTaskTitle("  Revisión del Módulo — ¡Nuevo! ")).toBe("revision del modulo nuevo");
    expect(normalizeTaskTitle("revision del modulo nuevo")).toBe(normalizeTaskTitle("Revisión del Módulo — ¡Nuevo!"));
  });

  test("reads the parent version kind independently of its novelty group", () => {
    expect(releaseKindFromBadge("salto salto--feature", "FEATURE")).toBe("feature");
    expect(releaseKindFromBadge("salto salto--arreglo", "Arreglo")).toBe("fix");
    expect(releaseKindFromBadge("salto salto--grande", "Grande")).toBe("major");
    expect(releaseKindFromBadge("", "Major")).toBe("major");
    expect(releaseKindFromBadge("", "Other")).toBe("");
  });

  test("parses Spanish and English CHANGELOG sections and infers their state", () => {
    const markdown = [
      "# Changelog",
      "",
      "## [Unreleased]",
      "### Added",
      "- **Panel de revisión**: Permite revisar cada propuesta antes de crear la tarea.",
      "### Planned",
      "- Export report: Coming soon for teams.",
      "",
      "## [1.2.0] — 2026-10-01",
      "### Fixed",
      "- **Error al abrir**: Se corrigió el fallo de inicio.",
    ].join("\n");
    const items = parseChangelogMarkdown(markdown, "https://example.test/changelog");
    expect(items.map((item) => item.title)).toEqual(["Panel de revisión", "Export report", "Error al abrir"]);
    expect(items.map((item) => item.suggestedStatus)).toEqual(["En curso", "Pendiente", "Hecha"]);
    expect(items.map((item) => item.section)).toEqual(["added", "general", "fixed"]);
    expect(items[0].body).toContain("Permite revisar");
  });

  test("uses the published-release context and bounds extracted items", () => {
    const bullets = Array.from({ length: 120 }, (_, index) => "- **Feature " + index + "**: Released for teams.").join("\n");
    const items = parseChangelogMarkdown(
      "### Changed\n" + bullets,
      "https://example.test/CHANGELOG.md",
      { version: "2.0.0", status: "Hecha" },
    );
    expect(items.length).toBe(100);
    expect(items[0].suggestedStatus).toBe("Hecha");
  });

  test("does not treat a page-level intro as a release note", () => {
    expect(parseChangelogMarkdown(
      "# Cada versión, función por función.\n\nEl detalle técnico está en el CHANGELOG.",
      "https://example.test/novedades",
    )).toEqual([]);
  });

  test("accepts only public HTTPS source URLs", () => {
    expect(normalizeChangelogUrl("https://example.test/news")).toBe("https://example.test/news");
    expect(normalizeChangelogUrl("http://example.test/news")).toBeNull();
    expect(normalizeChangelogUrl("https://localhost/news")).toBeNull();
    expect(normalizeChangelogUrl("")).toBe("");
  });
});
