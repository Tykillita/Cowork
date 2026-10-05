import { describe, expect, test } from "vitest";
import { buildHash, parseHash } from "../../src/lib/hashRoute";

describe("hash routes", () => {
  test("splits the page from its parameters", () => {
    const { page, params } = parseHash("#work?task=t1&assignee=mine");
    expect(page).toBe("work");
    expect(params.get("task")).toBe("t1");
    expect(params.get("assignee")).toBe("mine");
  });

  test("a parameter never makes a known page unknown", () => {
    expect(parseHash("#work?foo=1").page).toBe("work");
    expect(parseHash("#home").page).toBe("home");
    expect(parseHash("").page).toBeNull();
    expect(parseHash("#nowhere?x=1").page).toBeNull();
  });

  test("encoded and readable slashes mean the same", () => {
    expect(parseHash("#branches-page?branch=feature%2Flogin").params.get("branch")).toBe("feature/login");
    expect(parseHash("#branches-page?branch=feature/login").params.get("branch")).toBe("feature/login");
  });

  test("builds readable hashes and skips empty values", () => {
    expect(buildHash("work")).toBe("#work");
    expect(buildHash("work", { task: "t1", assignee: "", due: null })).toBe("#work?task=t1");
    expect(buildHash("branches-page", { branch: "feature/añadir #1" })).toBe("#branches-page?branch=feature/a%C3%B1adir%20%231");
  });

  test("round trip", () => {
    const hash = buildHash("settings-page", { section: "github", note: "a&b=c" });
    const { page, params } = parseHash(hash);
    expect(page).toBe("settings-page");
    expect(params.get("section")).toBe("github");
    expect(params.get("note")).toBe("a&b=c");
  });
});
