import { describe, expect, test } from "vitest";
import type { Project, Task } from "../../src/types";
import { EMPTY_TASK_DETAILS, ORDER_GAP, orderAt } from "../../src/features/workboard/taskModel";
import { activeFilterCount, columnsOf, dueInfo, filterTasks, isOverdue, moveCard, NO_FILTERS } from "../../src/features/workboard/taskFilters";
import { deadlineNotices } from "../../src/features/activity/useActivityCenter";

const NOW = Date.parse("2026-10-10T12:00:00.000Z");
const task = (overrides: Partial<Task> = {}): Task => ({ id: "t", order: 1, phase: "General", title: "Tarea", status: "Pendiente", assignee: "", assigneeUid: "", milestoneId: "", revision: 1, ...EMPTY_TASK_DETAILS, ...overrides });
const project: Project = { id: "p", name: "P", description: "", repositoryUrl: "", previewUrl: "", kind: "general", createdAt: "", ownerUid: "o" };

describe("task filters", () => {
  const tasks = [
    task({ id: "a", title: "Diseñar portada", assigneeUid: "u1", assignee: "Ana", priority: "alta", dueDate: "2026-10-09", dueAt: "2026-10-10T05:00:00.000Z" }),
    task({ id: "b", title: "Revisar textos", phase: "Contenido", dueDate: "2026-10-14", dueAt: "2026-10-15T05:00:00.000Z" }),
    task({ id: "c", title: "Publicar", status: "Hecha", branch: "feature/publicar" }),
  ];

  test("search ignores case and accents and also looks at phase and branch", () => {
    expect(filterTasks(tasks, { ...NO_FILTERS, query: "disenar" }, "u1", NOW).map((t) => t.id)).toEqual(["a"]);
    expect(filterTasks(tasks, { ...NO_FILTERS, query: "contenido" }, "u1", NOW).map((t) => t.id)).toEqual(["b"]);
    expect(filterTasks(tasks, { ...NO_FILTERS, query: "feature/pub" }, "u1", NOW).map((t) => t.id)).toEqual(["c"]);
  });

  test("priority, due and assignee filters combine", () => {
    expect(filterTasks(tasks, { ...NO_FILTERS, priority: "alta" }, "u1", NOW).map((t) => t.id)).toEqual(["a"]);
    expect(filterTasks(tasks, { ...NO_FILTERS, due: "overdue" }, "u1", NOW).map((t) => t.id)).toEqual(["a"]);
    expect(filterTasks(tasks, { ...NO_FILTERS, due: "week" }, "u1", NOW).map((t) => t.id)).toEqual(["a", "b"]);
    expect(filterTasks(tasks, { ...NO_FILTERS, due: "none" }, "u1", NOW).map((t) => t.id)).toEqual(["c"]);
    expect(filterTasks(tasks, { ...NO_FILTERS, assignee: "unassigned" }, "u1", NOW).map((t) => t.id)).toEqual(["b"]);
    expect(activeFilterCount({ ...NO_FILTERS, priority: "alta", query: "x" })).toBe(2);
  });

  test("due chips: overdue, within a day, later and done", () => {
    expect(isOverdue(tasks[0], NOW)).toBe(true);
    expect(dueInfo(tasks[0], NOW)).toMatchObject({ tone: "error" });
    expect(dueInfo({ ...tasks[1], dueAt: "2026-10-11T05:00:00.000Z" }, NOW)).toEqual({ label: "Vence en menos de 24 h", tone: "warning" });
    expect(dueInfo(tasks[1], NOW)?.tone).toBe("muted");
    expect(dueInfo({ ...tasks[0], status: "Hecha" }, NOW)?.tone).toBe("muted");
    expect(dueInfo(tasks[2], NOW)).toBeNull();
  });
});

describe("board", () => {
  test("columns keep the plan's order", () => {
    const columns = columnsOf([task({ id: "x", order: 3 }), task({ id: "y", order: 1 }), task({ id: "z", status: "Hecha" })]);
    expect(columns.Pendiente.map((t) => t.id)).toEqual(["y", "x"]);
    expect(columns["En curso"]).toEqual([]);
    expect(columns.Hecha.map((t) => t.id)).toEqual(["z"]);
  });

  test("keyboard moves stay inside the board", () => {
    const sizes = [2, 0, 3];
    expect(moveCard({ column: 0, index: 1 }, "ArrowRight", sizes)).toEqual({ column: 1, index: 0 });
    expect(moveCard({ column: 1, index: 0 }, "ArrowRight", sizes)).toEqual({ column: 2, index: 0 });
    expect(moveCard({ column: 2, index: 0 }, "ArrowRight", sizes)).toEqual({ column: 2, index: 0 });
    expect(moveCard({ column: 0, index: 0 }, "ArrowLeft", sizes)).toEqual({ column: 0, index: 0 });
    expect(moveCard({ column: 2, index: 1 }, "ArrowDown", sizes)).toEqual({ column: 2, index: 2 });
    expect(moveCard({ column: 2, index: 3 }, "ArrowDown", sizes)).toEqual({ column: 2, index: 3 });
    expect(moveCard({ column: 2, index: 2 }, "Home", sizes)).toEqual({ column: 2, index: 0 });
    expect(moveCard({ column: 0, index: 0 }, "End", sizes)).toEqual({ column: 0, index: 2 });
    expect(moveCard({ column: 0, index: 0 }, "x", sizes)).toEqual({ column: 0, index: 0 });
  });

  test("a drop takes the midpoint, or renumbers the column when there is no room", () => {
    const siblings = [{ id: "a", order: ORDER_GAP }, { id: "b", order: 2 * ORDER_GAP }];
    expect(orderAt(siblings, 1, "m")).toEqual({ order: ORDER_GAP + ORDER_GAP / 2, respace: [] });
    expect(orderAt(siblings, 2, "m").order).toBe(3 * ORDER_GAP);
    const crowded = [{ id: "a", order: 5 }, { id: "b", order: 6 }];
    expect(orderAt(crowded, 1, "m")).toEqual({ order: 2 * ORDER_GAP, respace: [{ id: "a", order: ORDER_GAP }, { id: "b", order: 3 * ORDER_GAP }] });
  });
});

describe("task due notices", () => {
  test("only my open tasks with a near or past due date, linked to the task", () => {
    const tasks = [
      task({ id: "mine", title: "Mía", assigneeUid: "u1", dueDate: "2026-10-10", dueAt: "2026-10-11T00:00:00.000Z" }),
      task({ id: "other", assigneeUid: "u2", dueDate: "2026-10-10", dueAt: "2026-10-11T00:00:00.000Z" }),
      task({ id: "done", assigneeUid: "u1", status: "Hecha", dueDate: "2026-10-09", dueAt: "2026-10-10T00:00:00.000Z" }),
      task({ id: "later", assigneeUid: "u1", dueDate: "2026-10-20", dueAt: "2026-10-21T00:00:00.000Z" }),
    ];
    const notices = deadlineNotices(project, [], tasks, NOW, "u1");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ id: "notice:p:task:mine:2026-10-11T00:00:00.000Z:soon", target: "#work?task=mine", title: "Vence en menos de 24 h: tarea «Mía»" });
    expect(deadlineNotices(project, [], tasks, NOW)).toHaveLength(0);
  });
});
