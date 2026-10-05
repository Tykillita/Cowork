import { describe, expect, test } from "vitest";
// @ts-expect-error The script is plain JavaScript, run with node.
import { nextVersion, readVersion, releaseNotes, versionProblems } from "../../scripts/version.mjs";
import { LATEST, RELEASES, releaseAnchor } from "../../src/features/changelog/releases";

const root = process.cwd();

describe("version", () => {
  test("VERSION matches package.json, the README badges, the CHANGELOG and /novedades", () => {
    expect(versionProblems(root)).toEqual([]);
    expect(LATEST.version).toBe(readVersion(root));
  });

  test("bumps follow SemVer", () => {
    expect(nextVersion("0.2.0", "patch")).toBe("0.2.1");
    expect(nextVersion("0.2.3", "minor")).toBe("0.3.0");
    expect(nextVersion("0.2.3", "major")).toBe("1.0.0");
    expect(() => nextVersion("0.2.0", "huge")).toThrow();
  });

  test("release notes are the CHANGELOG section of the version", () => {
    const changelog = "# Changelog\n\n## [Unreleased]\n\n## [1.1.0] — 2026-10-02\n\n### Added\n- Algo.\n\n## [1.0.0] — 2026-10-01\n\n- Antes.\n\n[Unreleased]: x\n";
    expect(releaseNotes(changelog, "1.1.0")).toBe("### Added\n- Algo.");
    expect(releaseNotes(changelog, "1.0.0")).toBe("- Antes.");
    expect(() => releaseNotes(changelog, "2.0.0")).toThrow();
  });
});

describe("public changelog", () => {
  test("versions go from newest to oldest, each with a unique anchor and a date", () => {
    const versions = RELEASES.map((release) => release.version);
    const sorted = [...versions].sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
    expect(versions).toEqual(sorted);
    expect(new Set(versions.map(releaseAnchor)).size).toBe(versions.length);
    for (const release of RELEASES) expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("every text is written in Spanish and in English", () => {
    for (const release of RELEASES) {
      for (const text of [release.summary, ...[...release.added, ...release.changed, ...release.fixed].flatMap((item) => [item.title, item.body])]) {
        expect(text.es.trim(), release.version).not.toBe("");
        expect(text.en.trim(), release.version).not.toBe("");
        expect(text.en, release.version).not.toBe(text.es);
      }
    }
  });
});
