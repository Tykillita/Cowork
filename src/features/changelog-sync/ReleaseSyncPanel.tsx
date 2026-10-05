import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sk, SkGroup } from "../../components/Skeleton";
import { buildHash } from "../../lib/hashRoute";
import { DEFAULT_TASK_PHASE, TASK_LIMITS, type Project, type Task, type TaskStatus, type WorkboardMode } from "../../types";
import { EMPTY_TASK_DETAILS, nextOrder } from "../workboard/taskModel";
import { isLegacyChangelogIntroTitle, normalizeTaskTitle, type ChangelogSection } from "./changelogParser";
import { reviewReleaseProposal, syncReleaseSource, watchReleaseSyncProposals, type ReleaseSyncProposal } from "./releaseSyncStore";
import "./changelogSync.css";

const SECTION_LABELS: Record<ChangelogSection, string> = {
  added: "Nuevo",
  changed: "Cambios",
  fixed: "Arreglos",
  general: "Novedad",
};
const TASK_STATUSES: TaskStatus[] = ["Pendiente", "En curso", "Hecha"];

function compareProposalVersions(left: ReleaseSyncProposal, right: ReleaseSyncProposal) {
  const parts = (value: string) => {
    const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/unreleased|upcoming|next|proxima/.test(normalized)) return [Number.POSITIVE_INFINITY, 0, 0];
    const match = value.match(/\bv?(\d{1,3})(?:\.(\d{1,3}))?(?:\.(\d{1,3}))?/i);
    return match ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)] : [-1, 0, 0];
  };
  const a = parts(left.version);
  const b = parts(right.version);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return b[index] - a[index];
  }
  return 0;
}

export function ReleaseSyncPanel({
  project, userId, tasks, mode, onCreate, onUpdate,
}: {
  project: Project;
  userId: string;
  tasks: Task[];
  mode: WorkboardMode;
  onCreate: (task: Task) => Promise<void>;
  onUpdate: (base: Task, next: Task) => Promise<void>;
}) {
  const [proposals, setProposals] = useState<ReleaseSyncProposal[]>([]);
  const [ready, setReady] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const autoSynced = useRef("");

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    setReady(false);
    setProposals([]);
    setQueueError("");
    void watchReleaseSyncProposals(project.id, (items) => {
      if (active) {
        setProposals(items);
        setReady(true);
        setQueueError("");
      }
    }, (error) => {
      if (active) {
        setQueueError(error.message || "No se pudieron cargar las propuestas.");
        setReady(true);
      }
    }).then((unsubscribe) => {
      if (active) stop = unsubscribe;
      else unsubscribe();
    }).catch((error: Error) => {
      if (active) {
        setQueueError(error.message || "No se pudieron cargar las propuestas.");
        setReady(true);
      }
    });
    return () => { active = false; stop?.(); };
  }, [project.id]);

  const sync = useCallback(async () => {
    const sourceUrl = project.changelogUrl ?? "";
    if (!sourceUrl || syncBusy || mode !== "remote") return;
    setSyncBusy(true);
    setSyncError("");
    setSyncMessage("");
    try {
      const result = await syncReleaseSource(project.id, sourceUrl, userId);
      const changed = result.added + result.updated;
      setSyncMessage(changed
        ? "Encontré " + result.found + " novedades: " + changed + (changed === 1 ? " nueva o actualizada quedó" : " nuevas o actualizadas quedaron") + " para revisar" + (result.unchanged ? "; " + result.unchanged + " no cambiaron" : "") + ". Acepta cada propuesta para crear o actualizar una tarea."
        : "Leí " + result.found + " novedades; ninguna cambió desde la sincronización anterior. Acepta cada propuesta para crear o actualizar una tarea.");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "No se pudo leer la página de novedades.");
    } finally {
      setSyncBusy(false);
    }
  }, [mode, project.changelogUrl, project.id, syncBusy, userId]);

  useEffect(() => {
    if (!project.changelogUrl || mode !== "remote" || autoSynced.current === project.id) return;
    autoSynced.current = project.id;
    void sync();
  }, [mode, project.changelogUrl, project.id, sync]);

  const pending = useMemo(() => proposals.filter((proposal) =>
    proposal.reviewStatus === "pending" && !isLegacyChangelogIntroTitle(proposal.title),
  ).sort(compareProposalVersions), [proposals]);
  const canWrite = mode === "remote";
  return <section className="panel releaseSyncPanel" aria-labelledby="release-sync-title">
    <div className="panelHead">
      <div><p className="eyebrow">NOVEDADES DEL PROYECTO</p><h2 id="release-sync-title">Propuestas de tareas</h2></div>
      {project.changelogUrl && <button type="button" className="releaseSyncButton" onClick={() => void sync()} disabled={!canWrite || syncBusy}>{syncBusy ? "Consultando…" : "Sincronizar"}</button>}
    </div>
    <p className="panelIntro">Cowork encuentra novedades al abrir el tablero y las compara con tus tareas. Revisa cada propuesta antes de aplicarla.</p>
    {!project.changelogUrl && <div className="releaseSyncSetup"><p>Vincula la página pública de novedades del proyecto para convertir sus cambios en propuestas.</p><a className="inlineAction" href={buildHash("settings-page", { section: "changelog" })}>Configurar página de novedades ↗</a></div>}
    {project.changelogUrl && <div className="releaseSyncSource"><span>Fuente</span><a href={project.changelogUrl} target="_blank" rel="noreferrer">{project.changelogUrl}</a></div>}
    {project.changelogUrl && mode !== "remote" && <p className="releaseSyncHint">Conecta con Firebase para sincronizar o revisar novedades.</p>}
    {queueError && <p className="projectSettingsError" role="alert">{queueError}</p>}
    {project.changelogUrl && syncError && <p className="projectSettingsError" role="alert">{syncError}</p>}
    {project.changelogUrl && syncMessage && <p className="projectSettingsSuccess" role="status">{syncMessage}</p>}
    {!ready ? <SkGroup className="releaseSyncLoading" label="Cargando propuestas"><article className="releaseProposal"><Sk w="42%" /><Sk w="82%" /><Sk shape="block" h={34} r={10} /></article></SkGroup>
      : pending.length ? <div className="releaseProposalList" aria-label="Novedades pendientes de revisión">
        {pending.map((proposal) => <ProposalCard
          key={proposal.id}
          proposal={proposal}
          tasks={tasks}
          userId={userId}
          project={project}
          canWrite={canWrite}
          onCreate={onCreate}
          onUpdate={onUpdate}
        />)}
      </div>
      : project.changelogUrl ? <p className="releaseSyncEmpty">No hay novedades por revisar.</p> : null}
  </section>;
}

function ProposalCard({
  proposal, tasks, userId, project, canWrite, onCreate, onUpdate,
}: {
  proposal: ReleaseSyncProposal;
  tasks: Task[];
  userId: string;
  project: Project;
  canWrite: boolean;
  onCreate: (task: Task) => Promise<void>;
  onUpdate: (base: Task, next: Task) => Promise<void>;
}) {
  const matches = tasks.filter((task) => normalizeTaskTitle(task.title) === normalizeTaskTitle(proposal.title));
  const defaultChoice = proposal.taskId && tasks.some((task) => task.id === proposal.taskId)
    ? proposal.taskId
    : matches.length === 1 ? matches[0].id : matches.length > 1 ? "" : "new";
  const [taskChoice, setTaskChoice] = useState(defaultChoice);
  const [status, setStatus] = useState<TaskStatus | "">(proposal.suggestedStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isUnreleased = proposal.version.trim().toLowerCase() === "unreleased";

  useEffect(() => {
    if (taskChoice !== "new" && taskChoice && !tasks.some((task) => task.id === taskChoice)) setTaskChoice(defaultChoice);
  }, [defaultChoice, taskChoice, tasks]);

  useEffect(() => setStatus(proposal.suggestedStatus), [proposal.suggestedStatus]);

  async function accept() {
    if (!status || !taskChoice || busy) return;
    setBusy(true);
    setError("");
    try {
      if (taskChoice === "new") {
        const id = "news-" + proposal.id.slice(0, 45);
        const sourceNote = proposal.sourceUrl ? "\n\nFuente: " + proposal.sourceUrl : "";
        await onCreate({
          id,
          order: nextOrder(tasks),
          phase: DEFAULT_TASK_PHASE,
          title: proposal.title.slice(0, TASK_LIMITS.title),
          status,
          assignee: "",
          assigneeUid: "",
          milestoneId: "",
          revision: 0,
          ...EMPTY_TASK_DETAILS,
          description: (proposal.body + sourceNote).slice(0, TASK_LIMITS.description),
        });
        await reviewReleaseProposal(project.id, proposal.id, "accepted", id, userId);
      } else {
        const task = tasks.find((item) => item.id === taskChoice);
        if (!task) throw new Error("La tarea elegida ya no está disponible. Vuelve a seleccionarla.");
        if (task.status !== status) await onUpdate(task, { ...task, status });
        await reviewReleaseProposal(project.id, proposal.id, "accepted", task.id, userId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo aplicar la propuesta.");
    } finally {
      setBusy(false);
    }
  }

  async function ignore() {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await reviewReleaseProposal(project.id, proposal.id, "ignored", "", userId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo descartar la propuesta."); }
    finally { setBusy(false); }
  }

  return <article className="releaseProposal">
    <header className="releaseProposalHead">
      {(proposal.releaseKind || isUnreleased) && <span className="releaseProposalKind" data-release-kind={isUnreleased ? "unreleased" : proposal.releaseKind}>{isUnreleased ? "Unreleased" : proposal.releaseKind === "major" ? "Major" : proposal.releaseKind === "feature" ? "Feature" : "Fix"}</span>}
      <span className="releaseProposalSection">{SECTION_LABELS[proposal.section]}</span>
      {proposal.version && !isUnreleased && <span className="releaseProposalVersion">{proposal.version}</span>}
      <a className="releaseProposalSource" href={proposal.sourceUrl} target="_blank" rel="noreferrer">Ver fuente ↗</a>
    </header>
    <h3>{proposal.title}</h3>
    {proposal.body && <p className="releaseProposalBody">{proposal.body}</p>}
    <div className="releaseProposalReview">
      <label className="controlField"><span>Vincular a una tarea</span>
        <select value={taskChoice} onChange={(event) => setTaskChoice(event.target.value)} disabled={!canWrite || busy}>
          <option value="">Elige una tarea…</option>
          <option value="new">Crear una tarea nueva</option>
          {[...tasks].sort((a, b) => a.order - b.order).map((task) => <option key={task.id} value={task.id}>{task.title} · {task.status}</option>)}
        </select>
      </label>
      <label className="controlField"><span>Estado propuesto</span>
        <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus | "")} disabled={!canWrite || busy}>
          <option value="">Elige un estado…</option>
          {TASK_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
    </div>
    {proposal.suggestedStatus === "" && <p className="releaseSyncHint">No pude inferir el estado con claridad; elige uno antes de aceptar.</p>}
    {matches.length > 1 && !proposal.taskId && <p className="releaseSyncHint">Hay varias tareas con este título. Elige cuál corresponde o crea una nueva.</p>}
    {error && <p className="projectSettingsError" role="alert">{error}</p>}
    <div className="releaseProposalActions">
      <button type="button" onClick={() => void accept()} disabled={!canWrite || busy || !taskChoice || !status}>{busy ? "Guardando…" : taskChoice === "new" ? "Crear tarea" : "Aplicar a tarea"}</button>
      <button type="button" className="plain" onClick={() => void ignore()} disabled={!canWrite || busy}>Descartar</button>
    </div>
  </article>;
}
