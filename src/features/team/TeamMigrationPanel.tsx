import { useState } from "react";
import type { PanelUser } from "../../types";
import type { MigrationPlan } from "./teamDirectory";

/**
 * Repeatable migration for projects created before accounts were linked to
 * tasks: first a dry run that writes nothing, then the owner applies it.
 */
export function TeamMigrationPanel({ projectId, user }: { projectId: string; user: PanelUser }) {
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function simulate() {
    setBusy(true); setError(""); setMessage("");
    try {
      const { planMigration } = await import("./teamDirectory");
      setPlan(await planMigration(projectId));
    } catch { setError("No se pudo revisar los datos del equipo."); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!plan) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { applyMigration } = await import("./teamDirectory");
      const result = await applyMigration(projectId, plan, user, (done, total) => setProgress(`${done} de ${total}`));
      setMessage(result.failed.length
        ? `Se aplicaron los cambios, salvo ${result.failed.length} ${result.failed.length === 1 ? "tarea" : "tareas"} que cambiaron mientras tanto. Vuelve a simular para completarlas.`
        : "Datos del equipo actualizados. Puedes volver a simular cuando quieras: solo aparecerá lo pendiente.");
      setPlan(null);
    } catch { setError("No se pudo completar la migración. Lo ya aplicado se conserva; vuelve a simular para ver lo pendiente."); }
    finally { setBusy(false); setProgress(""); }
  }

  const nothingToDo = plan && !plan.directory.length && !plan.assignments.length;

  return (
    <section className="panel projectMembersPanel" aria-labelledby="migration-title">
      <div className="panelHead"><div><p className="eyebrow">DATOS DEL EQUIPO</p><h2 id="migration-title">Directorio y asignaciones anteriores</h2></div></div>
      <p className="panelIntro">Prepara el directorio (nombre y avatar de cada miembro) y enlaza las tareas antiguas que solo tenían un nombre. Un nombre se enlaza únicamente si coincide con un solo miembro; los demás quedan como “Asignación anterior por revisar”. La simulación no modifica nada.</p>
      <div className="projectSettingsActions">
        <button type="button" onClick={() => void simulate()} disabled={busy}>{busy && !plan ? "Revisando…" : "Simular"}</button>
        {plan && !nothingToDo && <button className="ghost" type="button" onClick={() => void apply()} disabled={busy}>{busy ? `Aplicando… ${progress}` : "Aplicar cambios"}</button>}
      </div>
      {error && <p className="projectSettingsError" role="alert">{error}</p>}
      {message && <p className="projectSettingsSuccess" role="status">{message}</p>}
      {plan && <div className="migrationPlan" role="status">
        {nothingToDo && !plan.review.length && <p>Todo está al día. No hay cambios pendientes.</p>}
        {plan.directory.length > 0 && <>
          <h3>Directorio: {plan.directory.length} {plan.directory.length === 1 ? "cambio" : "cambios"}</h3>
          <ul>{plan.directory.map((entry) => <li key={entry.uid}>{entry.name} · {entry.reason === "left" ? "marcar sin acceso" : entry.reason === "missing" ? "añadir" : "reactivar"}</li>)}</ul>
        </>}
        {plan.assignments.length > 0 && <>
          <h3>Tareas a enlazar: {plan.assignments.length}</h3>
          <ul>{plan.assignments.map(({ task, name }) => <li key={task.id}>«{task.title}» → {name}</li>)}</ul>
        </>}
        {plan.review.length > 0 && <>
          <h3>Por revisar manualmente: {plan.review.length}</h3>
          <ul>{plan.review.map(({ task, reason }) => <li key={task.id}>«{task.title}» · “{task.assignee}” {reason === "ambiguous" ? "coincide con varios miembros" : "no coincide con ningún miembro"}</li>)}</ul>
          <p className="projectSettingsHint">Asígnalas desde el plan de trabajo con el selector de responsable.</p>
        </>}
      </div>}
    </section>
  );
}
