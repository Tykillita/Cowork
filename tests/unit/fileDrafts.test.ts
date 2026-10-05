import { describe, expect, test } from "vitest";
import { commitMessage, draftBase64, draftBytes, draftPathProblem, encodeDraftContent, joinDraftPath } from "../../src/features/code/fileDrafts";
import { describeEvent, eventTarget } from "../../src/features/activity/activityEvents";
import type { ActivityEvent } from "../../src/types";

describe("file draft paths", () => {
  test("accepts relative paths with named parts", () => {
    expect(draftPathProblem("src/nuevo.ts")).toBe("");
    expect(draftPathProblem(".github/workflows/ci.yml")).toBe("");
    expect(draftPathProblem("docs/..notas.md")).toBe("");
  });

  test("rejects what GitHub or the rules would refuse", () => {
    for (const path of ["", "/a.ts", "src/", "a//b.ts", "../a.ts", "src/./a.ts", ".git/config", "a\b.ts", "a\nb", "x".repeat(301)]) {
      expect(draftPathProblem(path), path).not.toBe("");
    }
  });

  test("joins a name to the current folder; a leading slash starts at the root", () => {
    expect(joinDraftPath("src/lib", "a.ts")).toBe("src/lib/a.ts");
    expect(joinDraftPath("", " a.ts ")).toBe("a.ts");
    expect(joinDraftPath("src", "/docs/b.md")).toBe("docs/b.md");
  });
});

describe("file draft content", () => {
  test("text stays readable; binary goes to base64; both reach GitHub as base64", () => {
    const text = new TextEncoder().encode("hola ñ\n");
    expect(encodeDraftContent(text.buffer)).toEqual({ encoding: "utf-8", content: "hola ñ\n" });
    const binary = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]);
    const encoded = encodeDraftContent(binary.buffer);
    expect(encoded.encoding).toBe("base64");
    expect([...draftBytes(encoded.encoding, encoded.content)]).toEqual([...binary]);
    expect(atob(draftBase64("utf-8", "hola ñ\n"))).toBe(String.fromCharCode(...text));
    expect(draftBase64("base64", encoded.content)).toBe(encoded.content);
  });

  test("the commit says who proposed the file", () => {
    expect(commitMessage({ message: "Añadir guía", authorName: "Ana" })).toBe("Añadir guía\n\nPropuesto por Ana en Cowork.");
  });
});

describe("file events", () => {
  const event = (changes: ActivityEvent["changes"], kind: ActivityEvent["kind"] = "created"): ActivityEvent => ({
    id: "file-f1", projectId: "p", kind, targetType: "file", targetId: "f1", targetTitle: "src/guia.md", revision: 1, actorUid: "u", actorName: "Ana", createdAt: "", changes,
  });

  test("describe each step of the review", () => {
    expect(describeEvent(event({ ref: "main" }))).toBe("propuso el archivo guia.md");
    expect(describeEvent(event({ review: "rejected", ref: "main" }, "updated"))).toBe("rechazó el archivo guia.md");
    expect(describeEvent(event({ review: "approved", ref: "main" }, "deleted"))).toBe("aprobó y subió guia.md a GitHub");
    expect(describeEvent(event({ review: "discarded", ref: "main" }, "deleted"))).toBe("descartó el archivo guia.md");
  });

  test("lead to the file in its branch", () => {
    expect(eventTarget(event({ ref: "feature/x" }))).toBe("#code?ref=feature/x&path=src/guia.md");
    expect(eventTarget(event({ review: "discarded", ref: "main" }, "deleted"))).toBe("#code");
  });
});
