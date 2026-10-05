import { describe, expect, test } from "vitest";
import { fileIconId, folderIconId, type IconTheme } from "../../src/features/code/fileIcons";

const theme: IconTheme = {
  file: "file",
  folder: "folder",
  folderOpen: "folder-open",
  extensions: { ts: "typescript", tsx: "react_ts", "test.tsx": "test-jsx", "d.ts": "typescript-def", json: "json", md: "markdown" },
  names: { "package.json": "nodejs", dockerfile: "docker", "readme.md": "readme" },
  folders: { src: "folder-src", components: "folder-components", github: "folder-github", test: "folder-test" },
};

describe("file icons", () => {
  test("exact names win, then the longest extension, then the default", () => {
    expect(fileIconId("package.json", theme)).toBe("nodejs");
    expect(fileIconId("README.md", theme)).toBe("readme");
    expect(fileIconId("Dockerfile", theme)).toBe("docker");
    expect(fileIconId("Button.test.tsx", theme)).toBe("test-jsx");
    expect(fileIconId("Button.tsx", theme)).toBe("react_ts");
    expect(fileIconId("types.d.ts", theme)).toBe("typescript-def");
    expect(fileIconId("notes.md", theme)).toBe("markdown");
    expect(fileIconId("LICENSE", theme)).toBe("file");
    expect(fileIconId("archivo.desconocido", theme)).toBe("file");
  });

  test("folders by name, with decorations and open variants", () => {
    expect(folderIconId("src", false, theme)).toBe("folder-src");
    expect(folderIconId("src", true, theme)).toBe("folder-src-open");
    expect(folderIconId(".github", false, theme)).toBe("folder-github");
    expect(folderIconId("__test__", true, theme)).toBe("folder-test-open");
    expect(folderIconId("Components", false, theme)).toBe("folder-components");
    expect(folderIconId("varios", false, theme)).toBe("folder");
    expect(folderIconId("varios", true, theme)).toBe("folder-open");
  });
});
