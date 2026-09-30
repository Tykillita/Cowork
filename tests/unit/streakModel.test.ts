import { describe, expect, test } from "vitest";
import { DAY_MS, buyProtection, history, initialProtection, milestoneDays, pairHistory, reconcile, timingMessage, weekStart, type CalendarDay } from "../../src/features/streaks/streakModel";
const active = (day: number): CalendarDay => ({ day, kind: "active", points: 1, firstAt: day * DAY_MS + 12 * 3600000 });
const protectedDay = (day: number): CalendarDay => ({ day, kind: "protected", points: 0, firstAt: null });

describe("streak protection", () => {
  test("covered days preserve the run without adding activity; a gap resets it", () => {
    expect(history([10, 11, 14], [12, 13], 14)).toMatchObject({ current: 3, best: 3 });
    expect(history([10, 11], [12], 14)).toMatchObject({ current: 0, best: 2 });
    expect(history([14], [12, 13], 14)).toMatchObject({ current: 1, best: 1 });
  });
  test("reconciles every closed day once and exhausts only two protectors", () => {
    const state = { ...initialProtection(10), protectors: 2 };
    const result = reconcile(state, [10], [], 15);
    expect(result.additions).toEqual([{ day: 11, source: "single" }, { day: 12, source: "single" }]);
    expect(result.state).toMatchObject({ current: 0, best: 1, protectors: 0 });
    expect(reconcile(result.state, [10], result.protectedDays, 15).additions).toEqual([]);
  });
  test("never consumes a protector when there is no live streak", () => {
    const state = { ...initialProtection(20), protectors: 2 };
    expect(reconcile(state, [18], [], 22).state.protectors).toBe(2);
  });
  test("shield precedes singles, expires after the seventh date, and cannot stack", () => {
    const original = { ...initialProtection(10), protectors: 2 };
    const shield = buyProtection(original, "shield", 10, 15);
    const result = reconcile(shield, [10], [], 19);
    expect(result.protectedDays.slice(0, 6).every((day) => day.source === "shield")).toBe(true);
    expect(result.protectedDays.slice(6)).toEqual([{ day: 17, source: "single" }, { day: 18, source: "single" }]);
    expect(result.state.current).toBe(1);
    expect(() => buyProtection(shield, "shield", 10, 100)).toThrow("sigue activo");
    expect(() => buyProtection(original, "single", 10, 100)).toThrow("dos protectores");
    expect(() => buyProtection(initialProtection(10), "shield", 10, 14)).toThrow("suficientes");
  });
  test("purchase today cannot rescue an older absence", () => {
    const state = reconcile(initialProtection(10), [10], [], 13).state;
    const purchased = buyProtection(state, "single", 13, 3);
    expect(reconcile(purchased, [10], [], 14).state).toMatchObject({ current: 0, protectors: 1 });
  });
  test("resuming after protection increases by one, not the gap length", () => {
    const before = reconcile({ ...initialProtection(10), protectors: 2 }, [10], [], 13);
    const after = reconcile(before.state, [10, 13], before.protectedDays, 13);
    expect(after.state.current).toBe(2);
    expect(after.state.best).toBe(2);
  });
  test("migration preserves known history without inventing protection or points", () => {
    const state = reconcile(initialProtection(25), [1, 2, 3, 23, 24], [], 25);
    expect(state.state).toMatchObject({ current: 2, best: 3, protectors: 0, managedFrom: 25 });
    expect(state.additions).toEqual([]);
    expect(state.state.badges).toContainEqual({ id: "streak-3", day: 3, label: "3 días de racha" });
  });
  test("perfect weeks need seven real active days, never protected substitutes", () => {
    const start = weekStart(200);
    const days = Array.from({ length: 7 }, (_, index) => start + index);
    const result = reconcile(initialProtection(start), days, [], start + 6);
    expect(result.state.badges.some((badge) => badge.id === `week-${start}`)).toBe(true);
    expect(reconcile(initialProtection(start), days.slice(1), [{ day: start, source: "single" }], start + 6).state.badges.some((b) => b.id.startsWith("week-"))).toBe(false);
    expect(reconcile(result.state, days, [], start + 7).state.badges).toHaveLength(result.state.badges.length);
    expect(milestoneDays(420)).toContain(400);
    expect(milestoneDays(420)).toContain(500);
  });
});

describe("shared streaks and feedback", () => {
  test("both active advances; protection preserves; an uncovered absence breaks", () => {
    const a = [active(10), active(11), active(12), active(13)];
    const b = [active(10), protectedDay(11), protectedDay(12), active(13)];
    expect(pairHistory(a, b, 10, 13)).toMatchObject({ current: 2, best: 2 });
    expect(pairHistory(a, b.filter((day) => day.day !== 12), 10, 13)).toMatchObject({ current: 1, best: 1 });
    expect(pairHistory(a, b, 13, 13).current).toBe(1);
    expect(pairHistory([protectedDay(10)], [protectedDay(10)], 10, 10).current).toBe(0);
  });
  test("timing needs three prior comparable active days", () => {
    const days = [active(10), active(11), active(12), { ...active(13), firstAt: 13 * DAY_MS + 10 * 3600000 }];
    expect(timingMessage(days, 13)).toContain("2 h antes");
    expect(timingMessage(days.slice(1), 13)).toBeNull();
    expect(timingMessage([protectedDay(9), ...days.slice(1)], 13)).toBeNull();
  });
});
