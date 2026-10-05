/** "ahora", "hace 5 min", "hace 3 h" or a short date, for activity lines. */
export function relativeTime(value: string, now = Date.now()) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 60 * 24) return `hace ${Math.round(minutes / 60)} h`;
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(time);
}
