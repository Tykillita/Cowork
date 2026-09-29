import { useCallback, useEffect, useState } from "react";
import type { AccessHistoryEntry } from "../../types";
import type { HistoryPage } from "../projects/projectAccess";
import { repeat, Sk } from "../../components/Skeleton";

const PAGE_SIZE = 10;

const ACTION_LABELS: Record<AccessHistoryEntry["action"], { label: string; tone: string }> = {
  requested: { label: "Solicitó acceso", tone: "info" },
  approved: { label: "Aprobada", tone: "success" },
  rejected: { label: "Rechazada", tone: "error" },
  "retry-allowed": { label: "Nuevo intento permitido", tone: "warning" },
  "retry-withdrawn": { label: "Autorización retirada", tone: "muted" },
};

function dateLabel(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "Fecha pendiente" : new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(time);
}

/** History entries while a page loads: status chip, person and a right-aligned date. */
function HistorySkeletonRows({ rows }: { rows: number }) {
  return <>{repeat(rows, (index) => <li key={`sk-${index}`} className="skGroup" aria-hidden="true">
    <Sk shape="pill" w={[72, 58, 84][index % 3]} h={19} />
    <span className="accessHistoryWho"><Sk inline w={[90, 120, 76][index % 3]} /></span>
    <small className="accessHistoryWhen"><Sk inline w={110} /></small>
  </li>)}</>;
}

/** Every attempt and decision with date and author, loaded page by page (owner only). */
export function AccessHistoryList({ projectId, refreshKey, loadPage }: {
  projectId: string;
  /** Changes whenever the current requests change, so new entries appear. */
  refreshKey: string;
  loadPage: (projectId: string, pageSize: number, cursor: unknown) => Promise<HistoryPage>;
}) {
  const [entries, setEntries] = useState<AccessHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  // Only "load more" shows its own rows; a refresh keeps the current entries on screen.
  const [loading, setLoading] = useState(false);
  const [loadedFor, setLoadedFor] = useState("");
  const [error, setError] = useState("");
  const loaded = loadedFor === projectId;

  const loadFirst = useCallback(async () => {
    setError("");
    try {
      const page = await loadPage(projectId, PAGE_SIZE, null);
      setEntries(page.entries);
      setCursor(page.cursor);
      setDone(page.done);
    } catch {
      setError("No se pudo cargar el historial de solicitudes.");
    } finally {
      setLoadedFor(projectId);
    }
  }, [loadPage, projectId]);

  useEffect(() => { void loadFirst(); }, [loadFirst, refreshKey]);

  async function loadMore() {
    setLoading(true);
    try {
      const page = await loadPage(projectId, PAGE_SIZE, cursor);
      setEntries((current) => [...current, ...page.entries.filter((entry) => !current.some((existing) => existing.id === entry.id))]);
      setCursor(page.cursor);
      setDone(page.done);
    } catch {
      setError("No se pudo cargar más historial.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="accessHistoryList" aria-labelledby="access-history-title">
      <div className="projectMembersSubhead"><h3 id="access-history-title">Historial de solicitudes</h3><span>{loaded ? `${entries.length}${done ? "" : "+"}` : <Sk inline w="2ch" />}</span></div>
      {error && <p className="projectSettingsError" role="alert">{error}</p>}
      {!loaded ? <ol className="accessHistoryEntries" role="status" aria-busy="true" aria-label="Cargando historial"><HistorySkeletonRows rows={3} /></ol> : entries.length ? <ol className="accessHistoryEntries" aria-busy={loading}>
        {entries.map((entry) => {
          const meta = ACTION_LABELS[entry.action];
          const byRequester = entry.actorUid === entry.requesterUid;
          return (
            <li key={entry.id}>
              <span className="accessStatusChip" data-tone={meta.tone}>{meta.label}</span>
              <span className="accessHistoryWho"><strong>{entry.requesterName || "Persona"}</strong>{entry.attempt > 1 && <small> · intento {entry.attempt}</small>}</span>
              <small className="accessHistoryWhen">{dateLabel(entry.at)}{byRequester ? "" : ` · por ${entry.actorName || "el propietario"}`}</small>
            </li>
          );
        })}
        {loading && <HistorySkeletonRows rows={2} />}
      </ol> : <p className="empty">Todavía no hay solicitudes registradas.</p>}
      {!done && !loading && entries.length > 0 && <button className="plain" type="button" onClick={() => void loadMore()}>Cargar más</button>}
    </section>
  );
}
