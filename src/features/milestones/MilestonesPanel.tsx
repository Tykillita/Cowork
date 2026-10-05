import { useMemo, useState, type FormEvent } from "react";
import type { Milestone, Project, Task } from "../../types";
import type { MilestoneDraft } from "../workboard/firestoreWorkboard";
import { formatDayKey, timeZoneLabel, timeZoneOptions } from "../schedule/scheduleTime";
import { MilestonesSkeleton } from "../../components/PageSkeletons";
import { defaultMilestoneTimeZone, dueState, milestoneDueAt, milestoneProgress, outsideProjectWindow } from "./milestoneModel";

type FormState = { title: string; description: string; dueDate: string; timeZone: string };

function statusOf(milestone: Milestone, tasks: Task[], now: number) {
  if (milestone.archived) return { label: "Archivado", tone: "muted" };
  const progress = milestoneProgress(milestone, tasks);
  if (progress.complete) return { label: "Terminado", tone: "success" };
  const state = dueState(milestone.dueAt, now);
  if (state === "overdue") return { label: "Vencido", tone: "error" };
  if (state === "soon") return { label: "Vence en menos de 24 h", tone: "warning" };
  return { label: "Pendiente", tone: "info" };
}

export function milestoneDueLabel(milestone: Pick<Milestone, "dueDate" | "timeZone">) {
  return `Vence al terminar el ${formatDayKey(milestone.dueDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · ${milestone.timeZone.replace(/_/g, " ")}`;
}

function MilestoneForm({ project, initial, submitLabel, onSubmit, onCancel }: {
  project: Project;
  initial: FormState;
  submitLabel: string;
  onSubmit: (draft: FormState) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const zones = useMemo(() => timeZoneOptions(form.timeZone), [form.timeZone]);
  const warning = form.dueDate && outsideProjectWindow(project, form.dueDate, form.timeZone);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!form.title.trim()) { setError("Escribe el título del hito."); return; }
    if (!form.dueDate) { setError("Elige la fecha de entrega del hito."); return; }
    setSaving(true);
    setError("");
    try { await onSubmit(form); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el hito."); }
    finally { setSaving(false); }
  }

  return (
    <form className="milestoneForm" onSubmit={submit}>
      <label className="controlField"><span>Título</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={120} required placeholder="Entrega del prototipo" /></label>
      <label className="controlField"><span>Descripción <small>Opcional</small></span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={600} rows={2} /></label>
      <div className="milestoneFormRow">
        <label className="controlField"><span>Fecha de entrega</span><input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} required /></label>
        <label className="controlField"><span>Zona horaria</span><select value={form.timeZone} onChange={(event) => setForm({ ...form, timeZone: event.target.value })}>{zones.map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, " ")}</option>)}</select></label>
      </div>
      {form.dueDate && <p className="projectSettingsHint">Vence al terminar ese día en {timeZoneLabel(form.timeZone)}.</p>}
      {warning && <p className="milestoneWarning" role="status">Este hito queda fuera del plazo general del proyecto. Puedes guardarlo igualmente.</p>}
      {error && <p className="projectSettingsError" role="alert">{error}</p>}
      <div className="projectSettingsActions">
        <button type="submit" disabled={saving}>{saving ? "Guardando…" : submitLabel}</button>
        <button className="ghost" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
      </div>
    </form>
  );
}

export function MilestonesPanel({ project, milestones, ready = true, tasks, isOwner, now, onCreate, onUpdate }: {
  project: Project;
  milestones: Milestone[];
  /** False until milestones and tasks have arrived. */
  ready?: boolean;
  tasks: Task[];
  isOwner: boolean;
  now: number;
  onCreate: (draft: MilestoneDraft) => Promise<void>;
  onUpdate: (base: Milestone, draft: MilestoneDraft) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const visible = milestones.filter((milestone) => showArchived || !milestone.archived);
  const archivedCount = milestones.filter((milestone) => milestone.archived).length;

  const toDraft = (form: FormState, archived = false): MilestoneDraft => ({
    title: form.title, description: form.description, dueDate: form.dueDate, timeZone: form.timeZone, dueAt: milestoneDueAt(form.dueDate, form.timeZone), archived,
  });

  async function toggleArchive(milestone: Milestone) {
    setError(""); setMessage("");
    try {
      await onUpdate(milestone, { ...toDraft(milestone, !milestone.archived) });
      setMessage(milestone.archived ? `«${milestone.title}» vuelve a estar activo.` : `«${milestone.title}» se archivó. Sus tareas conservan el vínculo.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo actualizar el hito."); }
  }

  return (
    <section className="panel milestonesPanel" id="milestones" aria-labelledby="milestones-title">
      <div className="panelHead">
        <div><p className="eyebrow">HITOS</p><h2 id="milestones-title">Entregas intermedias</h2></div>
        {isOwner && !creating && <button type="button" onClick={() => { setCreating(true); setMessage(""); }}>Nuevo hito</button>}
      </div>
      <p className="panelIntro">El avance de cada hito se calcula con sus tareas vinculadas. {isOwner ? "Solo tú puedes crear, editar o archivar hitos; cualquier miembro puede vincular tareas." : "El propietario administra los hitos; tú puedes vincular tareas."}</p>
      {creating && <MilestoneForm
        project={project}
        initial={{ title: "", description: "", dueDate: "", timeZone: defaultMilestoneTimeZone(project) }}
        submitLabel="Crear hito"
        onCancel={() => setCreating(false)}
        onSubmit={async (form) => { await onCreate(toDraft(form)); setCreating(false); setMessage(`Hito «${form.title.trim()}» creado.`); }}
      />}
      {error && <p className="projectSettingsError" role="alert">{error}</p>}
      {message && <p className="projectSettingsSuccess" role="status">{message}</p>}
      {!ready ? <MilestonesSkeleton /> : <div className="milestoneList">
        {visible.map((milestone) => {
          const progress = milestoneProgress(milestone, tasks);
          const status = statusOf(milestone, tasks, now);
          if (editing === milestone.id) {
            return <MilestoneForm
              key={milestone.id}
              project={project}
              initial={{ title: milestone.title, description: milestone.description, dueDate: milestone.dueDate, timeZone: milestone.timeZone }}
              submitLabel="Guardar hito"
              onCancel={() => setEditing("")}
              onSubmit={async (form) => { await onUpdate(milestone, toDraft(form, milestone.archived)); setEditing(""); setMessage("Hito actualizado."); }}
            />;
          }
          return (
            <article className={`milestoneItem${milestone.archived ? " isArchived" : ""}`} key={milestone.id}>
              <div className="milestoneItemHead">
                <h3>{milestone.title}</h3>
                <span className="accessStatusChip" data-tone={status.tone}>{status.label}</span>
              </div>
              {milestone.description && <p className="milestoneDescription">{milestone.description}</p>}
              <p className="milestoneMeta">{milestoneDueLabel(milestone)}</p>
              <div className="milestoneProgress">
                <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label={`Avance de ${milestone.title}`}><i style={{ width: `${progress.percent}%` }} /></span>
                <small>{progress.total ? `${progress.done} de ${progress.total} tareas hechas` : "Sin tareas vinculadas"}</small>
              </div>
              {isOwner && <div className="milestoneActions">
                <button className="plain" type="button" onClick={() => { setEditing(milestone.id); setMessage(""); }}>Editar</button>
                <button className="plain" type="button" onClick={() => void toggleArchive(milestone)}>{milestone.archived ? "Reactivar" : "Archivar"}</button>
              </div>}
            </article>
          );
        })}
        {!visible.length && <p className="empty">{milestones.length ? "Todos los hitos están archivados." : "Todavía no hay hitos en este proyecto."}</p>}
      </div>}
      {archivedCount > 0 && <button className="plain milestoneArchivedToggle" type="button" onClick={() => setShowArchived((value) => !value)} aria-pressed={showArchived}>
        {showArchived ? "Ocultar archivados" : `Mostrar archivados (${archivedCount})`}
      </button>}
    </section>
  );
}
