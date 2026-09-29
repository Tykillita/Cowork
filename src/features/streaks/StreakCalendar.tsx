import { useState } from "react";
import { DAY_MS, type CalendarDay, type DayKind } from "./streakModel";
import { usePersonal } from "../personal/PersonalContext";
import { Sk } from "../../components/Skeleton";
const labels: Record<DayKind, string> = { active: "Actividad registrada", protected: "Día protegido", missed: "Sin actividad", pending: "Pendiente", future: "Fecha futura", unknown: "Sin historial disponible" };

export function StreakCalendar() {
  const { streak, streakError, today } = usePersonal();
  const loading = !streak && !streakError;
  const [month, setMonth] = useState(() => { const d = new Date(today * DAY_MS); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); });
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const date = new Date(month), year = date.getUTCFullYear(), index = date.getUTCMonth();
  const start = Math.floor(month / DAY_MS), length = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const entries = new Map(streak?.calendar.map((entry) => [entry.day, entry]) ?? []);
  const inMonth = streak?.calendar.filter((entry) => entry.day >= start && entry.day < start + length) ?? [];
  const activeCount = inMonth.filter((entry) => entry.kind === "active").length;
  const protectedCount = inMonth.filter((entry) => entry.kind === "protected").length;
  function record(day: number): CalendarDay {
    return entries.get(day) ?? { day, kind: day > today ? "future" : day === today ? "pending" : day < (streak?.state.managedFrom ?? today) ? "unknown" : "missed", points: 0, firstAt: null };
  }
  const move = (offset: number) => { setMonth(Date.UTC(year, index + offset, 1)); setSelected(null); };
  return <section className="streakCalendar" aria-label="Calendario de actividad">
    <div className="streakSectionHead">
      <h3>{new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: "UTC" }).format(date)}</h3>
      <div className="streakMonthNav"><button type="button" aria-label="Mes anterior" disabled={year <= 1970 && index === 0} onClick={() => move(-1)}>‹</button>
        <button type="button" aria-label="Mes siguiente" disabled={start + length > today} onClick={() => move(1)}>›</button></div>
    </div>
    <p className="streakMonthTotals"><span><b>{loading ? <Sk inline w="1ch" /> : activeCount}</b> {activeCount === 1 ? "día activo" : "días activos"}</span><span><b>{loading ? <Sk inline w="1ch" /> : protectedCount}</b> {protectedCount === 1 ? "día protegido" : "días protegidos"}</span></p>
    <div className="streakCalendarGrid" role="group" aria-label="Días del mes" aria-busy={loading}>
      {["D", "L", "M", "X", "J", "V", "S"].map((label) => <span className="streakWeekday" key={label} aria-hidden="true">{label}</span>)}
      {Array.from({ length: date.getUTCDay() }, (_, i) => <span key={`blank-${i}`} />)}
      {loading ? Array.from({ length }, (_, i) => <Sk key={i} shape="block" h={43} r={8} />) : Array.from({ length }, (_, i) => {
        const value = record(start + i), title = `${i + 1}: ${labels[value.kind]}`;
        return <button type="button" key={value.day} className={`streakDay is-${value.kind}${value.day === today ? " isToday" : ""}`}
          aria-label={title} aria-current={value.day === today ? "date" : undefined} aria-pressed={selected?.day === value.day}
          disabled={value.kind === "future"} onClick={() => setSelected(value)}>
          <span>{i + 1}</span><small aria-hidden="true">{value.kind === "active" ? "✓" : value.kind === "protected" ? "◇" : value.kind === "unknown" ? "·" : ""}</small>
        </button>;
      })}
    </div>
    <p className="streakLegend"><span>✓ Activo</span><span>◇ Protegido</span><span>· Sin historial</span></p>
    {selected && <div className="streakDayDetail" role="status"><strong>{new Intl.DateTimeFormat("es", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(selected.day * DAY_MS))}</strong>
      <span>{labels[selected.kind]}{selected.kind === "active" ? ` · ${selected.points}/3 puntos` : ""}</span>
      {selected.firstAt !== null && <small>Primera actividad: {new Intl.DateTimeFormat("es", { timeStyle: "short", timeZone: "UTC" }).format(new Date(selected.firstAt))} UTC</small>}
    </div>}
  </section>;
}
