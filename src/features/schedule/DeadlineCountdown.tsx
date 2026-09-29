import { useEffect, useState } from "react";
import type { ProjectSchedule } from "../../types";
import { countdown, formatDeadline, formatInstant, formatRange, timeZoneLabel } from "./scheduleTime";

const pad = (value: number) => String(value).padStart(2, "0");

export function DeadlineCountdown({ schedule }: { schedule: ProjectSchedule }) {
  const [now, setNow] = useState(() => Date.now());
  const state = countdown(schedule, now);

  useEffect(() => {
    if (state.phase === "expired") return;
    // Align ticks with the wall clock so the seconds never skip visually.
    let timer = 0;
    const tick = () => {
      setNow(Date.now());
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    return () => window.clearTimeout(timer);
  }, [schedule.endsAt, state.phase]);

  const units = [
    { value: String(state.days), label: "días" },
    { value: pad(state.hours), label: "horas" },
    { value: pad(state.minutes), label: "minutos" },
    { value: pad(state.seconds), label: "segundos" },
  ];
  const urgent = state.phase === "expired" || (state.phase === "running" && state.remainingMs < 86_400_000);
  const status = state.phase === "upcoming"
    ? `El proyecto comienza el ${formatInstant(schedule.startsAt, schedule.timeZone)}.`
    : state.phase === "expired"
      ? "El plazo de entrega ya venció."
      : `La entrega vence ${formatDeadline(schedule)}.`;

  return (
    <section className={`clock deadlineCard${urgent ? " urgent" : ""}`} aria-labelledby="deadline-title">
      <div className="clockHead">
        <div>
          <p className="eyebrow">PLAZO DE ENTREGA</p>
          <h2 id="deadline-title" className="deadlineRange">{formatRange(schedule)}</h2>
        </div>
        <span className="clockLabel" title={timeZoneLabel(schedule.timeZone)}>{schedule.timeZone.replace(/_/g, " ")}</span>
      </div>
      <p className="when deadlineStatus" role="status">{status}</p>
      <div className="digits" role="timer" aria-label={`${state.days} días, ${state.hours} horas, ${state.minutes} minutos y ${state.seconds} segundos restantes`}>
        {units.map((unit) => <div key={unit.label}><b aria-hidden="true">{unit.value}</b><span aria-hidden="true">{unit.label}</span></div>)}
      </div>
      <span className="deadlineProgress" aria-hidden="true"><i style={{ width: `${Math.round(state.progress * 1000) / 10}%` }} /></span>
    </section>
  );
}
