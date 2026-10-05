import { describe, expect, test } from "vitest";
import type { Task } from "../../src/types";
import { EMPTY_TASK_DETAILS, ORDER_GAP, between, encodeChecklist, isOpenUnassigned, nextOrder, normalizeTask, phaseDomId, readChecklist, respaced, sameTaskContent } from "../../src/features/workboard/taskModel";
import { newId } from "../../src/lib/ids";

const task: Task = { id: "t1", order: 1, phase: "General", title: "Diseñar portada", status: "Pendiente", assignee: "", assigneeUid: "", milestoneId: "", revision: 1, ...EMPTY_TASK_DETAILS };

describe("task model", () => {
  test("compares what would be stored, not the raw draft", () => {
    expect(sameTaskContent(task, { ...task, title: "  Diseñar portada " })).toBe(true);
    expect(sameTaskContent({ ...task, order: 0 }, { ...task, order: 1 })).toBe(true);
    expect(sameTaskContent(task, { ...task, phase: "" })).toBe(true);
    expect(sameTaskContent(task, { ...task, status: "Hecha" })).toBe(false);
  });

  test("normalizes order, phase and title", () => {
    const clean = normalizeTask({ ...task, order: 2.6, phase: "  ", title: ` ${"x".repeat(400)}` });
    expect(clean.order).toBe(3);
    expect(clean.phase).toBe("General");
    expect(clean.title).toHaveLength(300);
  });

  test("unassigned means open work nobody took", () => {
    expect(isOpenUnassigned(task)).toBe(true);
    expect(isOpenUnassigned({ ...task, status: "Hecha" })).toBe(false);
    expect(isOpenUnassigned({ ...task, assigneeUid: "u1", assignee: "Ana" })).toBe(false);
    expect(isOpenUnassigned({ ...task, assignee: "Ana" })).toBe(false);
  });

  test("phase heading ids never collide on accents", () => {
    expect(phaseDomId(0)).not.toBe(phaseDomId(1));
  });

  test("ids are random, prefixed and short enough for events", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId("t")));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^t[0-9a-z]{16}$/);
  });
});

describe("task details", () => {
  test("old documents read with the same defaults as the rules", async () => {
    const { readTask } = await import("../../src/features/workboard/firestoreWorkboard");
    const legacy = readTask("t1", { id: "t1", order: 3, phase: "Diseño", title: "Antigua", status: "Hecha", assignee: "", assigneeUid: "", milestoneId: "", revision: 4 });
    expect(legacy).toMatchObject({ description: "", priority: "media", dueDate: "", timeZone: "", dueAt: "", checklist: [], branch: "", createdAt: "", createdByUid: "" });
    expect(readTask("t1", { priority: "urgente", checklist: "no" })).toMatchObject({ priority: "media", checklist: [] });
  });

  test("checklists keep well-formed items within the limits", () => {
    const items = [{ id: "c1", text: "Hacer", done: true }, { id: "", text: "sin id", done: false }, { id: "c3", text: 4, done: false }, ...Array.from({ length: 30 }, (_, index) => ({ id: `x${index}`, text: "x".repeat(250), done: false }))];
    const clean = readChecklist(items);
    expect(clean).toHaveLength(20);
    expect(clean[0]).toEqual({ id: "c1", text: "Hacer", done: true });
    expect(clean[1].text).toHaveLength(200);
  });

  test("normalizing drops a half-set due date and empty checklist items", () => {
    const clean = normalizeTask({ ...task, dueDate: "mañana", timeZone: "UTC", dueAt: "2026-01-01T00:00:00.000Z", checklist: [{ id: "c1", text: "  ", done: false }, { id: "c2", text: " Paso ", done: true }], branch: " feature/x " });
    expect(clean).toMatchObject({ dueDate: "", timeZone: "", dueAt: "", branch: "feature/x" });
    expect(clean.checklist).toEqual([{ id: "c2", text: "Paso", done: true }]);
  });

  test("detail fields count as content changes", () => {
    expect(sameTaskContent(task, { ...task, priority: "alta" })).toBe(false);
    expect(sameTaskContent(task, { ...task, checklist: [{ id: "c1", text: "Paso", done: false }] })).toBe(false);
    expect(sameTaskContent(task, { ...task, description: "  " })).toBe(true);
  });
});

describe("task order", () => {
  test("new tasks go one gap after the last", () => {
    expect(nextOrder([])).toBe(ORDER_GAP);
    expect(nextOrder([{ order: 3 }])).toBe(2 * ORDER_GAP);
    expect(nextOrder([{ order: ORDER_GAP }, { order: 2 * ORDER_GAP }])).toBe(3 * ORDER_GAP);
  });

  test("between takes the midpoint and asks for renumbering when there is no room", () => {
    expect(between(ORDER_GAP, 2 * ORDER_GAP)).toBe(ORDER_GAP + ORDER_GAP / 2);
    expect(between(null, null)).toBe(ORDER_GAP);
    expect(between(5, null)).toBe(5 + ORDER_GAP);
    expect(between(null, 2 * ORDER_GAP)).toBe(ORDER_GAP);
    expect(between(null, 10)).toBe(5);
    expect(between(null, 1)).toBeNull();
    expect(between(3, 4)).toBeNull();
    expect(between(1, 3)).toBe(2);
  });

  test("respacing keeps the order with even gaps", () => {
    expect(respaced([{ id: "a" }, { id: "b" }])).toEqual([{ id: "a", order: ORDER_GAP }, { id: "b", order: 2 * ORDER_GAP }]);
  });
});

describe("checklist storage", () => {
  test("stored as JSON, empty as an empty string, and read back the same", () => {
    const items = [{ id: "c1", text: "Paso «uno»", done: true }, { id: "c2", text: "Dos", done: false }];
    expect(encodeChecklist([])).toBe("");
    expect(readChecklist(encodeChecklist(items))).toEqual(items);
    expect(readChecklist("")).toEqual([]);
    expect(readChecklist("{roto")).toEqual([]);
    // Twenty plain items at the text limit fit the 8000-character rule; heavy escaping does not.
    const full = Array.from({ length: 20 }, (_, index) => ({ id: `c${"x".repeat(22)}${index % 10}`, text: "\"".repeat(200), done: true }));
    expect(() => encodeChecklist(full)).toThrow(/demasiado larga/);
    const plain = full.map((item) => ({ ...item, text: "x".repeat(200) }));
    expect(encodeChecklist(plain).length).toBeLessThanOrEqual(8000);
  });
});
