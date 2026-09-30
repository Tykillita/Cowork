import { CHARACTERS, LANDSCAPES } from "../ambient/sceneCatalog";
import { DAILY_POINT_LIMIT, streaks } from "./progressStore";

/** What the person has earned so far, as seen by this device. */
export interface RewardState {
  activeDays: number;
  currentStreak?: number;
  /** UTC days with activity. */
  days: number[];
  earned: number;
  pointsToday: number;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Short confirmations for what changed between two readings: today's
 * activity registered, points earned (and the daily limit reached) and items
 * unlocked by active days. Returns nothing on the first reading.
 */
export function rewardNotices(before: RewardState | null, after: RewardState, today: number): string[] {
  if (!before) return [];
  const notices: string[] = [];
  if (after.days.includes(today) && !before.days.includes(today)) {
    notices.push(`Actividad de hoy registrada · racha de ${plural(after.currentStreak ?? streaks(after.days, today).current, "día", "días")}`);
  }
  const gained = after.earned - before.earned;
  if (gained > 0) {
    const points = gained === 1 ? "+1 punto" : `+${gained} puntos`;
    notices.push(after.pointsToday >= DAILY_POINT_LIMIT
      ? `${points} · llegaste al máximo de ${DAILY_POINT_LIMIT} puntos por hoy; mañana (UTC) puedes ganar más`
      : `${points} · hoy ${after.pointsToday}/${DAILY_POINT_LIMIT}`);
  }
  if (after.activeDays > before.activeDays) {
    for (const item of [...CHARACTERS, ...LANDSCAPES]) {
      if (item.unlockDays !== null && item.unlockDays > before.activeDays && item.unlockDays <= after.activeDays) {
        notices.push(`Desbloqueaste «${item.name}» con ${plural(item.unlockDays, "día activo", "días activos")}`);
      }
    }
  }
  return notices;
}
