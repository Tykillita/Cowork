import { useEffect, useId, useMemo, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { es } from "react-day-picker/locale";
import "react-day-picker/style.css";
import type { ProjectSchedule } from "../../types";
import { browserTimeZone, buildSchedule, dateFromKey, dateKey, formatRange, timeZoneLabel, timeZoneOptions } from "./scheduleTime";

export type ScheduleDraft = {
  enabled: boolean;
  startDate: string;
  endDate: string;
  timeZone: string;
};

export function emptyScheduleDraft(): ScheduleDraft {
  return { enabled: false, startDate: "", endDate: "", timeZone: browserTimeZone() };
}

export function scheduleDraftFrom(schedule: ProjectSchedule | undefined): ScheduleDraft {
  return schedule
    ? { enabled: true, startDate: schedule.startDate, endDate: schedule.endDate, timeZone: schedule.timeZone }
    : emptyScheduleDraft();
}

/** Returns `null` for "Sin fecha de entrega"; throws when the range is incomplete. */
export function scheduleFromDraft(draft: ScheduleDraft): ProjectSchedule | null {
  if (!draft.enabled) return null;
  if (!draft.startDate) throw new Error("Selecciona en el calendario el día inicial y el día final del plazo.");
  return buildSchedule(draft.startDate, draft.endDate || draft.startDate, draft.timeZone);
}

function useWideCalendar() {
  const query = "(min-width: 720px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return wide;
}

export function ScheduleField({ value, onChange, disabled = false }: {
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const wide = useWideCalendar();
  const [editingZone, setEditingZone] = useState(false);
  const zones = useMemo(() => timeZoneOptions(value.timeZone), [value.timeZone]);
  const selected: DateRange | undefined = value.startDate
    ? { from: dateFromKey(value.startDate), to: dateFromKey(value.endDate || value.startDate) }
    : undefined;
  const [month, setMonth] = useState<Date>(() => selected?.from ?? new Date());

  function selectRange(range: DateRange | undefined) {
    onChange({
      ...value,
      startDate: range?.from ? dateKey(range.from) : "",
      endDate: range?.to ? dateKey(range.to) : range?.from ? dateKey(range.from) : "",
    });
  }

  const summary = value.startDate ? formatRange({ startDate: value.startDate, endDate: value.endDate || value.startDate }) : "";

  return (
    <fieldset className="scheduleField" disabled={disabled}>
      <legend className="formSectionLegend">Plazo de entrega</legend>
      <div className="scheduleModes" role="radiogroup" aria-label="Plazo de entrega">
        <label className={`scheduleMode${!value.enabled ? " isActive" : ""}`}>
          <input type="radio" name={`${id}-mode`} checked={!value.enabled} onChange={() => onChange({ ...value, enabled: false })} />
          <span><strong>Sin fecha de entrega</strong><small>El resumen muestra una escena tranquila.</small></span>
        </label>
        <label className={`scheduleMode${value.enabled ? " isActive" : ""}`}>
          <input type="radio" name={`${id}-mode`} checked={value.enabled} onChange={() => onChange({ ...value, enabled: true })} />
          <span><strong>Con plazo</strong><small>Cuenta regresiva hasta el final del último día.</small></span>
        </label>
      </div>

      {value.enabled && <div className="scheduleCalendarBlock">
        <DayPicker
          mode="range"
          locale={es}
          numberOfMonths={wide ? 2 : 1}
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={selectRange}
          showOutsideDays={false}
          className="scheduleCalendar"
          aria-label="Selecciona el día inicial y el día final"
        />
        <div className="scheduleSummary" aria-live="polite">
          <span>{summary ? <>Del <strong>{summary}</strong>, ambos días incluidos.</> : "Toca el día inicial y después el día final. Para un solo día, tócalo una vez."}</span>
          <span className="scheduleZone">
            {editingZone ? (
              <label className="controlField scheduleZoneSelect">
                <span>Zona horaria del proyecto</span>
                <select value={value.timeZone} onChange={(event) => { onChange({ ...value, timeZone: event.target.value }); setEditingZone(false); }} onBlur={() => setEditingZone(false)} autoFocus>
                  {zones.map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, " ")}</option>)}
                </select>
              </label>
            ) : <>
              <small>Zona horaria: {timeZoneLabel(value.timeZone)}</small>
              <button className="plain scheduleZoneChange" type="button" onClick={() => setEditingZone(true)}>Cambiar</button>
            </>}
          </span>
        </div>
      </div>}
    </fieldset>
  );
}
