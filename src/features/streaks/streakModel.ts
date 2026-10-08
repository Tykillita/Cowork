/** Shared, deterministic rules. Dates are UTC days since the Unix epoch. */
export const DAY_MS = 86_400_000;
export const POINT_LIMIT = 3;
export const SHARED_STREAK_LIMIT = 5;
export const PENDING_REQUEST_LIMIT = 5;
/** Kept for clients compiled before friendships and streaks became separate. */
export const FRIEND_LIMIT = SHARED_STREAK_LIMIT;
export const PROTECTION_PRICES = { single: 3, shield: 15 } as const;
export type ProtectionProduct = keyof typeof PROTECTION_PRICES;
export type DayKind = "active" | "protected" | "missed" | "pending" | "future" | "unknown";
export interface CalendarDay { day: number; kind: DayKind; points: number; firstAt: number | null }
export interface Badge { id: string; day: number; label: string }
export interface ProtectionState {
  version: 1; managedFrom: number; lastSettledDay: number; protectors: number;
  shieldStart: number; shieldEnd: number; current: number; best: number; evaluatedDay: number; badges: Badge[];
}
export interface ProtectedDay { day: number; source: ProtectionProduct }
export interface StreakSnapshot {
  state: ProtectionState; calendar: CalendarDay[]; activeDays: number; today: number;
}
export interface FriendView {
  id: string; name: string; photoURL: string; current: number; best: number;
  uid: string; friendshipId: string; streakActive: boolean;
  mine: "active" | "protected" | "pending"; theirs: "active" | "protected" | "pending";
  muted: boolean; nudged: boolean;
  /** Today's nudge in this pair, if any: who sent it, the phrase, whether it was seen and the reply. */
  nudge?: { fromMe: boolean; message: string; seen: boolean; reply: string | null };
}
export interface FriendPage { items: FriendView[]; next: string | null }
export interface NudgeView { id: string; name: string; pairId: string; day: number; read: boolean; message: string }
export interface Celebration { current: number; resumed: boolean; badges: string[] }
export const dayOf = (millis: number) => Math.floor(millis / DAY_MS);
export const weekStart = (day: number) => day - ((day + 4) % 7 + 7) % 7;

export function milestoneDays(best: number): number[] {
  const result = [3, 7, 14, 30, 50, 100, 200, 365];
  for (let value = 400; value <= Math.max(400, best + 100); value += 100) result.push(value);
  return result;
}

export function initialProtection(today: number): ProtectionState {
  return { version: 1, managedFrom: today, lastSettledDay: today - 1, protectors: 0,
    shieldStart: -1, shieldEnd: -1, current: 0, best: 0, evaluatedDay: today, badges: [] };
}

export function history(activeDays: number[], protectedDays: number[], today: number) {
  const active = new Set(activeDays.filter((day) => day <= today));
  const covered = [...new Set([...active, ...protectedDays.filter((day) => day <= today)])].sort((a, b) => a - b);
  let run = 0, best = 0, last = -Infinity;
  const reached: { day: number; run: number }[] = [];
  for (const day of covered) {
    if (day !== last + 1) run = 0;
    if (active.has(day)) { run += 1; reached.push({ day, run }); }
    best = Math.max(best, run);
    last = day;
  }
  return { current: last >= today - 1 ? run : 0, best, reached };
}

/** Closed days are reconciled once, in order. Protected days never add progress. */
export function reconcile(state: ProtectionState, activeDays: number[], previous: ProtectedDay[], today: number) {
  const active = new Set(activeDays);
  const protectedDays = [...previous];
  const additions: ProtectedDay[] = [];
  const next = { ...state, badges: [...state.badges] };
  const start = Math.max(state.managedFrom, state.lastSettledDay + 1);
  let run = history(activeDays.filter((day) => day < start), previous.map((entry) => entry.day).filter((day) => day < start), start).current;
  for (let day = start; day < today; day += 1) {
    if (active.has(day)) { run += 1; continue; }
    if (previous.some((entry) => entry.day === day)) continue;
    if (run === 0) continue;
    const shield = day >= state.shieldStart && day <= state.shieldEnd;
    if (!shield && next.protectors === 0) { run = 0; continue; }
    const entry: ProtectedDay = { day, source: shield ? "shield" : "single" };
    additions.push(entry); protectedDays.push(entry);
    if (!shield) next.protectors -= 1;
  }
  const result = history(activeDays, protectedDays.map((entry) => entry.day), today);
  next.current = result.current;
  next.best = Math.max(state.best, result.best);
  next.lastSettledDay = Math.max(state.lastSettledDay, today - 1);
  next.evaluatedDay = today;
  const existing = new Set(next.badges.map((badge) => badge.id));
  for (const goal of milestoneDays(next.best)) {
    const hit = result.reached.find((entry) => entry.run >= goal);
    if (hit && !existing.has(`streak-${goal}`)) next.badges.push({ id: `streak-${goal}`, day: hit.day, label: `${goal} días de racha` });
  }
  for (const sunday of new Set(activeDays.map(weekStart))) {
    if (sunday + 6 <= today && Array.from({ length: 7 }, (_, i) => sunday + i).every((day) => active.has(day)) && !existing.has(`week-${sunday}`)) {
      next.badges.push({ id: `week-${sunday}`, day: sunday + 6, label: "Semana perfecta" });
    }
  }
  return { state: next, additions, protectedDays };
}

export function buyProtection(state: ProtectionState, product: ProtectionProduct, today: number, balance: number) {
  const price = PROTECTION_PRICES[product];
  if (balance < price) throw new Error("No tienes puntos suficientes.");
  if (state.lastSettledDay < today - 1) throw new Error("Primero hay que actualizar los días pendientes.");
  if (product === "single") {
    if (state.protectors >= 2) throw new Error("Ya tienes dos protectores individuales.");
    return { ...state, protectors: state.protectors + 1 };
  }
  if (state.shieldEnd >= today) throw new Error("Tu escudo de siete días sigue activo.");
  return { ...state, shieldStart: today, shieldEnd: today + 6 };
}

/** A pair only advances on days when both people were active. */
export function pairHistory(a: CalendarDay[], b: CalendarDay[], since: number, today: number) {
  const left = new Map(a.filter((entry) => entry.day >= since).map((entry) => [entry.day, entry.kind]));
  const right = new Map(b.filter((entry) => entry.day >= since).map((entry) => [entry.day, entry.kind]));
  const active: number[] = [], protectedDays: number[] = [];
  for (const [day, kind] of left) {
    const other = right.get(day);
    if (kind === "active" && other === "active") active.push(day);
    else if ((kind === "active" || kind === "protected") && (other === "active" || other === "protected")) protectedDays.push(day);
  }
  return history(active, protectedDays, today);
}

export function timingMessage(calendar: CalendarDay[], today: number): string | null {
  const current = calendar.find((entry) => entry.day === today && entry.kind === "active");
  if (!current?.firstAt) return null;
  const recent = calendar.filter((entry) => entry.day < today && entry.kind === "active" && entry.firstAt !== null)
    .sort((a, b) => b.day - a.day).slice(0, 7);
  if (recent.length < 3) return null;
  const average = recent.reduce((sum, entry) => sum + entry.firstAt! % DAY_MS, 0) / recent.length;
  const minutes = Math.round((average - current.firstAt % DAY_MS) / 60_000);
  if (minutes < 15) return "Hoy ya cuidaste tu racha. El resto del día es tuyo.";
  return minutes >= 60 ? `Hoy registraste actividad ${Math.floor(minutes / 60)} h antes de tu promedio.`
    : `Hoy registraste actividad ${minutes} min antes de tu promedio.`;
}
