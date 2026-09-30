import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DAILY_POINT_LIMIT, EMPTY_WALLET, awardPoint, nextUtcDayStart, pointKey, pointsOn, readWallet, spendPoints, streaks, utcDay } from "../../src/features/progress/progressStore";
import { rewardNotices } from "../../src/features/progress/rewardNotices";
import { sameBranch } from "../../src/pages/BranchesPage";
import { arrangeProjects, moveInOrder, personalOrder } from "../../src/features/projects/projectListing";
import { assigneeView, dueState, milestoneDueAt, milestoneProgress, nextMilestone, outsideProjectWindow } from "../../src/features/milestones/milestoneModel";
import { deadlineNotices } from "../../src/features/activity/useActivityCenter";
import { countsAsWork, describeEvent, readEvent, taskChanges } from "../../src/features/activity/activityEvents";
import { CHARACTERS, LANDSCAPES, RARITIES, SCENE_PROPS, isAvailable, isUnlocked, nextUnlock, priceOf } from "../../src/features/ambient/sceneCatalog";
import { CHARACTER_HEIGHT, PROP_SIZES } from "../../src/features/ambient/scene/scale";
import { comparable } from "../../src/lib/text";
import { faviconCandidates } from "../../src/features/projects/SiteFavicon";
import type { Milestone, Project, Task } from "../../src/types";

const DAY = 86_400_000;
const project = (id: string, name: string, createdAt: string, description = ""): Project => ({ id, name, description, repositoryUrl: "", previewUrl: "", kind: "general", createdAt, ownerUid: "o" });
const task = (overrides: Partial<Task> = {}): Task => ({ id: "t", order: 1, phase: "General", title: "Tarea", status: "Pendiente", assignee: "", assigneeUid: "", milestoneId: "", revision: 1, ...overrides });
const milestone = (overrides: Partial<Milestone> = {}): Milestone => ({ id: "m", title: "Hito", description: "", dueDate: "2026-10-10", timeZone: "UTC", dueAt: "2026-10-11T00:00:00.000Z", archived: false, createdAt: "", revision: 1, ...overrides });

describe("active days and streaks", () => {
  test("UTC day boundaries do not depend on the local zone", () => {
    expect(utcDay(Date.UTC(2026, 8, 26, 23, 59, 59))).toBe(utcDay(Date.UTC(2026, 8, 26, 0, 0, 0)));
    expect(utcDay(Date.UTC(2026, 8, 27, 0, 0, 0))).toBe(utcDay(Date.UTC(2026, 8, 26)) + 1);
    expect(nextUtcDayStart(Date.UTC(2026, 8, 26, 15)).toISOString()).toBe("2026-09-27T00:00:00.000Z");
  });

  test("current streak survives until the next day ends; a pause resets it but keeps the best", () => {
    expect(streaks([10, 11, 12], 12)).toEqual({ current: 3, best: 3 });
    expect(streaks([10, 11, 12], 13)).toEqual({ current: 3, best: 3 });
    expect(streaks([10, 11, 12], 14)).toEqual({ current: 0, best: 3 });
    expect(streaks([1, 2, 3, 4, 10, 11], 11)).toEqual({ current: 2, best: 4 });
    expect(streaks([5, 5, 6], 6)).toEqual({ current: 2, best: 2 });
    expect(streaks([], 6)).toEqual({ current: 0, best: 0 });
  });

  test("streak rules: first activity, same-day repeats, consecutive days, a skipped day and the return", () => {
    expect(streaks([20], 20)).toEqual({ current: 1, best: 1 });
    // More actions the same day are one day.
    expect(streaks([20, 20, 20], 20)).toEqual({ current: 1, best: 1 });
    expect(streaks([20, 21], 21)).toEqual({ current: 2, best: 2 });
    // Yesterday counts until today ends; a whole day without activity resets it, with no new activity needed.
    expect(streaks([20, 21], 22).current).toBe(2);
    expect(streaks([20, 21], 23).current).toBe(0);
    // Coming back starts at 1 and the best streak never goes down.
    expect(streaks([20, 21, 24], 24)).toEqual({ current: 1, best: 2 });
    expect(streaks([20, 21, 24, 25, 26], 26)).toEqual({ current: 3, best: 3 });
  });

  test("the UTC day changes at UTC midnight, shown as local time", () => {
    const lastSecond = Date.UTC(2026, 8, 26, 23, 59, 59);
    expect(utcDay(lastSecond + 1000)).toBe(utcDay(lastSecond) + 1);
    expect(nextUtcDayStart(lastSecond).getTime()).toBe(Date.UTC(2026, 8, 27));
    expect(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Panama" }).format(nextUtcDayStart(lastSecond))).toBe("19");
  });
});

describe("project search, favourites and order", () => {
  const projects = [
    project("a", "Vigilia", "2026-09-03", "Admisiones de emergencia"),
    project("b", "Diseño UX", "2026-09-02"),
    project("c", "api", "2026-09-01", "Servicio de datos"),
  ];
  const prefs = { favorites: [] as string[], order: [] as string[], sort: "recent" as const, filter: "all" as const };

  test("search ignores case and accents across name and description", () => {
    expect(comparable("  DISEÑO   Ux ")).toBe("diseno ux");
    expect(arrangeProjects(projects, prefs, "diseno").map((entry) => entry.id)).toEqual(["b"]);
    expect(arrangeProjects(projects, prefs, "EMERGÉNCIA").map((entry) => entry.id)).toEqual(["a"]);
    expect(arrangeProjects(projects, prefs, "nada")).toEqual([]);
  });

  test("favourites go first in every order, and can be filtered", () => {
    expect(arrangeProjects(projects, { ...prefs, favorites: ["c"] }, "").map((entry) => entry.id)).toEqual(["c", "a", "b"]);
    expect(arrangeProjects(projects, { ...prefs, sort: "name", favorites: ["a"] }, "").map((entry) => entry.id)).toEqual(["a", "c", "b"]);
    expect(arrangeProjects(projects, { ...prefs, filter: "favorites", favorites: ["b"] }, "").map((entry) => entry.id)).toEqual(["b"]);
  });

  test("personal order keeps unknown projects at the end and moves one step at a time", () => {
    expect(arrangeProjects(projects, { ...prefs, sort: "custom", order: ["b", "c"] }, "").map((entry) => entry.id)).toEqual(["b", "c", "a"]);
    const order = personalOrder(projects, ["c", "gone"]);
    expect(order).toEqual(["c", "a", "b"]);
    expect(moveInOrder(order, "a", -1)).toEqual(["a", "c", "b"]);
    expect(moveInOrder(order, "c", -1)).toBe(order);
  });
});

describe("milestones", () => {
  test("progress uses linked tasks; empty stays pending; reopening undoes completion", () => {
    const m = milestone();
    expect(milestoneProgress(m, [])).toEqual({ total: 0, done: 0, percent: 0, complete: false });
    const done = [task({ id: "1", milestoneId: "m", status: "Hecha" }), task({ id: "2", milestoneId: "m", status: "Hecha" })];
    expect(milestoneProgress(m, done).complete).toBe(true);
    const reopened = [done[0], { ...done[1], status: "En curso" as const }];
    expect(milestoneProgress(m, reopened)).toMatchObject({ done: 1, total: 2, percent: 50, complete: false });
  });

  test("due instants follow each milestone's time zone", () => {
    expect(milestoneDueAt("2026-10-10", "America/Panama")).toBe("2026-10-11T05:00:00.000Z");
    expect(milestoneDueAt("2026-10-10", "Asia/Tokyo")).toBe("2026-10-10T15:00:00.000Z");
    expect(milestoneDueAt("2026-10-24", "Europe/Madrid")).toBe("2026-10-24T22:00:00.000Z");
  });

  test("next milestone skips archived and complete ones", () => {
    const list = [
      milestone({ id: "old", dueAt: "2026-01-01T00:00:00.000Z", archived: true }),
      milestone({ id: "done", dueAt: "2026-02-01T00:00:00.000Z" }),
      milestone({ id: "next", dueAt: "2026-03-01T00:00:00.000Z" }),
    ];
    expect(nextMilestone(list, [task({ milestoneId: "done", status: "Hecha" })])?.id).toBe("next");
  });

  test("warns when outside the project window", () => {
    const withSchedule = { ...project("p", "P", ""), schedule: { startDate: "2026-10-01", endDate: "2026-10-31", timeZone: "UTC", startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-11-01T00:00:00.000Z" } };
    expect(outsideProjectWindow(withSchedule, "2026-10-31", "UTC")).toBe(false);
    expect(outsideProjectWindow(withSchedule, "2026-11-01", "UTC")).toBe(true);
    expect(outsideProjectWindow(project("p", "P", ""), "2030-01-01", "UTC")).toBe(false);
  });

  test("deadline notices are unique per target, date and type; complete or archived ones are skipped", () => {
    const now = Date.parse("2026-10-10T12:00:00.000Z");
    expect(dueState("2026-10-11T00:00:00.000Z", now)).toBe("soon");
    expect(dueState("2026-10-10T00:00:00.000Z", now)).toBe("overdue");
    const p = project("p", "P", "");
    const soon = deadlineNotices(p, [milestone()], [], now);
    expect(soon).toHaveLength(1);
    expect(soon[0].id).toBe("notice:p:milestone:m:2026-10-11T00:00:00.000Z:soon");
    const moved = deadlineNotices(p, [milestone({ dueAt: "2026-10-11T06:00:00.000Z" })], [], now);
    expect(moved[0].id).not.toBe(soon[0].id);
    expect(deadlineNotices(p, [milestone({ archived: true })], [], now)).toHaveLength(0);
    expect(deadlineNotices(p, [milestone()], [task({ milestoneId: "m", status: "Hecha" })], now)).toHaveLength(0);
    expect(deadlineNotices(p, [milestone()], [], now - 5 * DAY)).toHaveLength(0);
  });
});

describe("assignees", () => {
  const directory = [
    { uid: "u1", name: "Ana", photoURL: "", active: true },
    { uid: "u2", name: "Beto", photoURL: "", active: false },
  ];
  test("member, former member, legacy label and unassigned", () => {
    expect(assigneeView(task({ assigneeUid: "u1", assignee: "Ana" }), directory)).toMatchObject({ kind: "member", label: "Ana" });
    expect(assigneeView(task({ assigneeUid: "u2", assignee: "Beto" }), directory)).toMatchObject({ kind: "left", label: "Beto" });
    expect(assigneeView(task({ assignee: "Ana" }), directory)).toMatchObject({ kind: "review", label: "Ana" });
    expect(assigneeView(task(), directory)).toMatchObject({ kind: "none" });
  });
});

describe("activity events", () => {
  test("changes and descriptions match the real edit", () => {
    const before = task();
    const after = task({ status: "En curso", assigneeUid: "u1", assignee: "Ana" });
    const changes = taskChanges(before, after);
    expect(changes).toEqual({ status: { from: "Pendiente", to: "En curso" }, assignee: { fromUid: "", toUid: "u1", fromName: "", toName: "Ana" } });
    expect(taskChanges(before, before)).toEqual({});
    const event = { id: "e", projectId: "p", kind: "updated" as const, targetType: "task" as const, targetId: "t", targetTitle: "Diseño", revision: 2, actorUid: "u1", actorName: "Ana", createdAt: "", changes };
    expect(describeEvent(event)).toBe("cambió el estado a En curso, la tomó · «Diseño»");
    expect(countsAsWork(event)).toBe(true);
    expect(countsAsWork({ ...event, changes: { assignee: changes.assignee } })).toBe(false);
    expect(countsAsWork({ ...event, kind: "created", targetType: "branch", changes: {} })).toBe(true);
  });

  test("a created project counts as activity and reads well in the feed", () => {
    const created = readEvent("project-alfa-a1b2c3", { projectId: "alfa-a1b2c3", kind: "created", targetType: "project", targetId: "alfa-a1b2c3", targetTitle: "Alfa", revision: 1, actorUid: "u1", actorName: "Ana", changes: {} });
    expect(created.targetType).toBe("project");
    expect(describeEvent(created)).toBe("creó el proyecto «Alfa»");
    expect(countsAsWork(created)).toBe(true);
  });
});

describe("collection catalog", () => {
  test("thresholds match the agreed unlock table and the rules", () => {
    const table = Object.fromEntries([...CHARACTERS, ...LANDSCAPES].filter((item) => item.unlockDays !== null).map((item) => [item.id, item.unlockDays]));
    expect(table).toEqual({ farolero: 0, "gato-explorador": 3, "robot-jardinero": 14, "valle-nocturno": 0, "valle-amanecer": 1, "bosque-luciernagas": 7, "jardin-lunar": 30 });
    expect(nextUnlock(0)?.id).toBe("valle-amanecer");
    expect(nextUnlock(7)?.id).toBe("robot-jardinero");
    expect(nextUnlock(30)).toBeNull();
    expect(isUnlocked(LANDSCAPES[3], 29)).toBe(false);
  });

  test("shop items have a rarity price, never unlock by days and match the rules", () => {
    const shop = [...CHARACTERS, ...LANDSCAPES].filter((item) => item.rarity);
    expect(RARITIES.comun.price).toBe(10);
    expect(RARITIES.rara.price).toBe(25);
    expect(RARITIES.epica.price).toBe(40);
    const rules = readFileSync("firestore.rules", "utf8");
    const block = rules.match(/function shopPrices\(\) \{[\s\S]*?\};/)?.[0] ?? "";
    const rulesPrices = Object.fromEntries([...block.matchAll(/'([a-z-]+)': (\d+)/g)].map(([, id, price]) => [id, Number(price)]));
    expect(rulesPrices).toEqual(Object.fromEntries(shop.map((item) => [item.id, priceOf(item)])));
    for (const item of shop) {
      expect(item.unlockDays).toBeNull();
      expect(isUnlocked(item, 10_000)).toBe(false);
      expect(isAvailable(item, 10_000, new Set())).toBe(false);
      expect(isAvailable(item, 0, new Set([item.id]))).toBe(true);
      expect(rules).toContain(`'${item.id}'`);
    }
    // Milestone items stay available through either path.
    expect(isAvailable(LANDSCAPES[1], 1, new Set())).toBe(true);
  });

  test("every sprite frame uses only its palette and a consistent width", () => {
    for (const character of CHARACTERS) {
      const frames = [...character.idle, ...character.walk];
      const width = frames[0].rows[0].length;
      for (const frame of frames) {
        for (const row of frame.rows) {
          expect(row.length).toBe(width);
          for (const key of row) if (key !== ".") expect(character.palette[key], `${character.id} uses ${key}`).toBeTruthy();
        }
      }
    }
    for (const landscape of LANDSCAPES) {
      for (const [index, { prop }] of (landscape.props ?? []).entries()) {
        const width = prop.frames[0].rows[0].length;
        const height = prop.frames[0].rows.length;
        for (const frame of prop.frames) {
          expect(frame.rows.length, `${landscape.id} prop ${index}`).toBe(height);
          for (const row of frame.rows) {
            expect(row.length, `${landscape.id} prop ${index}`).toBe(width);
            for (const key of row) if (key !== ".") expect(prop.palette[key], `${landscape.id} prop ${index} uses ${key}`).toBeTruthy();
          }
        }
      }
    }
  });

  test("everything is drawn to one scale: people, animals, stalls, vehicles and buildings", () => {
    const height = (frames: { rows: string[] }[]) => Math.max(...frames.map((frame) => frame.rows.length));
    for (const character of CHARACTERS) {
      const rows = height([...character.idle, ...character.walk]);
      expect(rows, `${character.id} is ${rows} rows`).toBeGreaterThanOrEqual(CHARACTER_HEIGHT.min);
      expect(rows, `${character.id} is ${rows} rows`).toBeLessThanOrEqual(CHARACTER_HEIGHT.max);
    }
    for (const [name, prop] of Object.entries(SCENE_PROPS)) {
      const rows = height(prop.frames);
      const range = PROP_SIZES[prop.size];
      expect(rows, `${name} (${prop.size}) is ${rows} rows`).toBeGreaterThanOrEqual(range.min);
      expect(rows, `${name} (${prop.size}) is ${rows} rows`).toBeLessThanOrEqual(range.max);
    }
  });
});

describe("points and purchases", () => {
  test("branches earn once per name in a project; tasks once per event", () => {
    const first = pointKey("p", "branch-b1", { targetType: "branch", targetTitle: "Feature/Login" });
    expect(first).toBe("p__branch~feature~login");
    expect(pointKey("p", "branch-b2", { targetType: "branch", targetTitle: "  feature/login " })).toBe(first);
    expect(pointKey("q", "branch-b2", { targetType: "branch", targetTitle: "feature/login" })).not.toBe(first);
    expect(pointKey("p", "task-t1-2", { targetType: "task", targetTitle: "Diseño" })).toBe("p__task-t1-2");
    expect(sameBranch("Feature/Login", " feature/login")).toBe(true);
    expect(sameBranch("feature/login", "feature/logout")).toBe(false);
  });

  test("today's points come from today's counter only", () => {
    expect(pointsOn([{ day: 21, points: 2 }, { day: 20, points: 3 }], 21)).toBe(2);
    expect(pointsOn([{ day: 20, points: 3 }], 21)).toBe(0);
  });

  test("confirmations: today's activity, points, the daily maximum and unlocks", () => {
    const empty = { activeDays: 0, days: [], earned: 0, pointsToday: 0 };
    expect(rewardNotices(null, empty, 30)).toEqual([]);
    expect(rewardNotices(empty, empty, 30)).toEqual([]);
    const first = rewardNotices(empty, { activeDays: 1, days: [30], earned: 1, pointsToday: 1 }, 30);
    expect(first).toEqual([
      "Actividad de hoy registrada · racha de 1 día",
      `+1 punto · hoy 1/${DAILY_POINT_LIMIT}`,
      "Desbloqueaste «Valle al amanecer» con 1 día activo",
    ]);
    const full = rewardNotices({ activeDays: 1, days: [30], earned: 2, pointsToday: 2 }, { activeDays: 1, days: [30], earned: 3, pointsToday: 3 }, 30);
    expect(full).toEqual([`+1 punto · llegaste al máximo de ${DAILY_POINT_LIMIT} puntos por hoy; mañana (UTC) puedes ganar más`]);
    const third = rewardNotices({ activeDays: 2, days: [28, 29], earned: 5, pointsToday: 0 }, { activeDays: 3, days: [28, 29, 30], earned: 5, pointsToday: 0 }, 30);
    expect(third).toEqual(["Actividad de hoy registrada · racha de 3 días", "Desbloqueaste «Gato explorador» con 3 días activos"]);
  });

  test("one point per award, up to the daily limit", () => {
    let wallet = EMPTY_WALLET;
    for (let points = 0; points < DAILY_POINT_LIMIT; points += 1) {
      wallet = awardPoint(wallet, points, pointKey("p", `e${points}`)) ?? wallet;
    }
    expect(wallet).toEqual({ balance: 3, earned: 3, spent: 0, lastAward: "p__e2", lastPurchase: "" });
    expect(awardPoint(wallet, DAILY_POINT_LIMIT, "p__e3")).toBeNull();
  });

  test("a purchase needs enough balance and keeps earned points intact", () => {
    const wallet = { ...EMPTY_WALLET, balance: 12, earned: 12 };
    expect(spendPoints(wallet, "farolero-invernal", 10)).toEqual({ balance: 2, earned: 12, spent: 10, lastAward: "", lastPurchase: "farolero-invernal" });
    expect(() => spendPoints(wallet, "pinar-aurora", 25)).toThrow(expect.objectContaining({ code: "cowork/insufficient-points" }));
  });

  test("stored wallets are read defensively; the balance is derived", () => {
    expect(readWallet(undefined)).toEqual(EMPTY_WALLET);
    expect(readWallet({ balance: 999, earned: 5, spent: 2, lastAward: "k" })).toEqual({ balance: 3, earned: 5, spent: 2, lastAward: "k", lastPurchase: "" });
    expect(readWallet({ earned: -4, spent: "x" }).balance).toBe(0);
  });
});

describe("preview site icons", () => {
  test("paths next to the page first, then the site root; only https", () => {
    const candidates = faviconCandidates("https://equipo.github.io/proyecto?x=1#y");
    expect(candidates[0]).toBe("https://equipo.github.io/proyecto/favicon.svg");
    expect(candidates).toContain("https://equipo.github.io/favicon.ico");
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(faviconCandidates("https://vigilia.web.app/")[0]).toBe("https://vigilia.web.app/favicon.svg");
    expect(faviconCandidates("https://vigilia.web.app/index.html")[0]).toBe("https://vigilia.web.app/favicon.svg");
    expect(faviconCandidates("http://inseguro.test/")).toEqual([]);
  });
});
