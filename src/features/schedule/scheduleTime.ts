import { TZDate } from "@date-fns/tz";
import type { ProjectSchedule } from "../../types";

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

export function isValidTimeZone(value: string) {
  if (!value || value.length > 64) return false;
  try { new Intl.DateTimeFormat("es", { timeZone: value }); return true; } catch { return false; }
}

export function timeZoneOptions(current: string) {
  let zones: string[] = [];
  try { zones = Intl.supportedValuesOf("timeZone"); } catch { zones = []; }
  if (!zones.includes("UTC")) zones = ["UTC", ...zones];
  return zones.includes(current) ? zones : [current, ...zones];
}

/** Calendar day chosen in the picker, independent of the viewer's zone. */
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateFromKey(key: string) {
  const match = DATE_KEY.exec(key);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

/** Midnight at the start of `key` in `timeZone`, plus `dayOffset` days. */
function zonedMidnight(key: string, timeZone: string, dayOffset = 0) {
  const match = DATE_KEY.exec(key);
  if (!match) throw new Error("Fecha no válida.");
  return new TZDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + dayOffset, 0, 0, 0, 0, timeZone);
}

/**
 * Both chosen days are inclusive: the project starts at 00:00 of the first day
 * and the delivery closes when the last day ends in the project's time zone.
 */
export function buildSchedule(startDate: string, endDate: string, timeZone: string): ProjectSchedule {
  if (!isValidTimeZone(timeZone)) throw new Error("Elige una zona horaria válida.");
  if (!DATE_KEY.test(startDate) || !DATE_KEY.test(endDate)) throw new Error("Selecciona el día inicial y el día final.");
  const [first, last] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  const startsAt = zonedMidnight(first, timeZone);
  const endsAt = zonedMidnight(last, timeZone, 1);
  return {
    startDate: first,
    endDate: last,
    timeZone,
    startsAt: new Date(startsAt.getTime()).toISOString(),
    endsAt: new Date(endsAt.getTime()).toISOString(),
  };
}

export function readSchedule(value: unknown): ProjectSchedule | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const { startDate, endDate, timeZone, startsAt, endsAt } = data;
  if (typeof startDate !== "string" || typeof endDate !== "string" || typeof timeZone !== "string"
    || typeof startsAt !== "string" || typeof endsAt !== "string") return undefined;
  if (!DATE_KEY.test(startDate) || !DATE_KEY.test(endDate) || !isValidTimeZone(timeZone)) return undefined;
  if (Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt)) || endsAt <= startsAt) return undefined;
  return { startDate, endDate, timeZone, startsAt, endsAt };
}

export function formatDayKey(key: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  const date = dateFromKey(key);
  return date ? new Intl.DateTimeFormat("es", options).format(date) : key;
}

export function formatRange(schedule: Pick<ProjectSchedule, "startDate" | "endDate">) {
  if (schedule.startDate === schedule.endDate) return formatDayKey(schedule.startDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return `${formatDayKey(schedule.startDate)} – ${formatDayKey(schedule.endDate)}`;
}

/** "al terminar el jueves 22 de octubre de 2026": the last included day. */
export function formatDeadline(schedule: Pick<ProjectSchedule, "endDate">) {
  return `al terminar el ${formatDayKey(schedule.endDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;
}

export function formatInstant(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("es", { dateStyle: "long", timeStyle: "short", timeZone }).format(new Date(iso));
}

export function timeZoneLabel(timeZone: string) {
  try {
    const part = new Intl.DateTimeFormat("es", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(new Date()).find((entry) => entry.type === "timeZoneName")?.value;
    return part ? `${timeZone.replace(/_/g, " ")} (${part})` : timeZone;
  } catch {
    return timeZone;
  }
}

export type CountdownPhase = "upcoming" | "running" | "expired";

export function countdown(schedule: ProjectSchedule, now: number) {
  const start = Date.parse(schedule.startsAt);
  const end = Date.parse(schedule.endsAt);
  const phase: CountdownPhase = now < start ? "upcoming" : now < end ? "running" : "expired";
  const remaining = Math.max(0, end - now);
  const seconds = Math.floor(remaining / 1000);
  const progress = phase === "upcoming" ? 0 : phase === "expired" ? 1 : (now - start) / (end - start);
  return {
    phase,
    progress,
    days: Math.floor(seconds / 86_400),
    hours: Math.floor((seconds % 86_400) / 3_600),
    minutes: Math.floor((seconds % 3_600) / 60),
    seconds: seconds % 60,
    remainingMs: remaining,
  };
}
