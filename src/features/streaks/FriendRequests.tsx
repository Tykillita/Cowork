import { forwardRef, useEffect, useRef, useState } from "react";
import type { FriendCodeView, FriendRequestView, RequestDirection } from "./friendCodes";
import { watchRequestPage, type RequestCursor, type RequestPage } from "./friendRequestClient";
import { FRIEND_LIMIT } from "./streakModel";
import { streakCommand, streakError } from "./streakClient";
import { repeat, Sk, SkGroup, SkImg } from "../../components/Skeleton";

const labels = { accepted: "Aceptada", rejected: "Rechazada", cancelled: "Cancelada", expired: "Caducada", pending: "Pendiente" };
const shortDate = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });
const statusOf = (entry: FriendRequestView, now: number) => entry.status === "pending" && entry.expiresAt <= now ? "expired" : entry.status;

/** Accept / reject / cancel, shared by the pending block and the history. */
function useRequestActions() {
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState("");
  async function act(kind: string, id: string) {
    if (busy) return;
    setBusy(kind); setError(""); setMessage("");
    try {
      await streakCommand(kind, { token: id });
      setMessage(kind === "acceptInvite" ? "Solicitud aceptada. Ya comparten una racha." : kind === "rejectInvite" ? "Solicitud rechazada." : "Solicitud cancelada.");
    } catch (reason) { setError(streakError(reason)); }
    finally { setBusy(""); }
  }
  return { busy: !!busy, error, message, act };
}

function Avatar({ name, photoURL }: { name: string; photoURL: string }) {
  return photoURL ? <SkImg className="friendAvatar" src={photoURL} alt="" referrerPolicy="no-referrer" />
    : <span className="friendAvatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
}

function RequestRow({ entry, direction, now, busy, act }: { entry: FriendRequestView; direction: RequestDirection; now: number; busy: boolean; act: (kind: string, id: string) => Promise<void> }) {
  const status = statusOf(entry, now);
  return <div className="friendRequestRow">
    <Avatar name={entry.name} photoURL={entry.photoURL} />
    <span><strong>{entry.name}</strong><small>{labels[status]} · {status === "pending" ? "vence" : "vencimiento"} {shortDate.format(entry.expiresAt)}</small></span>
    {entry.status === "pending" && status === "pending" && (direction === "incoming" ? <div className="friendRequestActions">
      <button type="button" className="streakPrimary" disabled={busy} onClick={() => void act("acceptInvite", entry.id)}>Aceptar</button>
      <button type="button" className="streakQuiet" disabled={busy} onClick={() => void act("rejectInvite", entry.id)}>Rechazar</button>
    </div> : <button type="button" className="streakQuiet" disabled={busy} onClick={() => void act("cancelInvite", entry.id)}>Cancelar solicitud</button>)}
  </div>;
}

/** History rows while a page loads: avatar, name and status line. */
function RequestRowsSkeleton() {
  return <SkGroup className="streakPending" label="Cargando solicitudes">
    {repeat(2, (index) => <div key={index} className="friendRequestRow">
      <Sk shape="block" w={36} h={36} r={11} />
      <span><strong><Sk w={index ? "38%" : "46%"} /></strong><small><Sk w={index ? "52%" : "44%"} /></small></span>
    </div>)}
  </SkGroup>;
}

function RequestList({ uid, direction, busy, act, now }: {
  uid: string; direction: RequestDirection; busy: boolean; now: number;
  act: (kind: string, id: string) => Promise<void>;
}) {
  const [cursors, setCursors] = useState<(RequestCursor | null)[]>([null]), [page, setPage] = useState<RequestPage>({ items: [], next: null });
  const [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const cursor = cursors.at(-1)!;
  useEffect(() => {
    let alive = true, stop: (() => void) | undefined;
    setLoading(true); setError("");
    void watchRequestPage(uid, direction, cursor, (value) => { if (alive) { setPage(value); setLoading(false); } },
      (reason) => { if (alive) { setError(streakError(reason)); setLoading(false); } })
      .then((fn) => { if (alive) stop = fn; else fn(); }).catch((reason) => { if (alive) { setError(streakError(reason)); setLoading(false); } });
    return () => { alive = false; stop?.(); };
  }, [uid, direction, cursor]);
  const label = direction === "incoming" ? "Solicitudes recibidas" : "Solicitudes enviadas";
  return <section className="streakPending" aria-label={label} aria-busy={loading}>
    {loading ? <RequestRowsSkeleton />
      : page.items.length === 0 && <p className="streakHint">{cursors.length > 1 ? "No hay más solicitudes." : direction === "incoming" ? "Todavía no has recibido solicitudes." : "Todavía no has enviado solicitudes."}</p>}
    {!loading && page.items.map((entry) => <RequestRow key={entry.id} entry={entry} direction={direction} now={now} busy={busy} act={act} />)}
    {error && <p role="alert" className="streakError">{error}</p>}
    {(cursors.length > 1 || page.next) && <nav className="streakPager" aria-label={direction === "incoming" ? "Páginas recibidas" : "Páginas enviadas"}>
      {cursors.length > 1 && <button type="button" className="streakQuiet" disabled={loading} onClick={() => setCursors((value) => value.slice(0, -1))}>Anterior</button>}
      {page.next && <button type="button" className="streakQuiet" disabled={loading} onClick={() => setCursors((value) => [...value, page.next])}>Siguiente</button>}
    </nav>}
  </section>;
}

function useMinuteClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  return now;
}

/** Requests waiting for you, shown at the top of Amigos because they need an answer. */
export function PendingIncoming({ uid }: { uid: string }) {
  const [items, setItems] = useState<FriendRequestView[]>([]);
  const now = useMinuteClock();
  const { busy, error, message, act } = useRequestActions();
  useEffect(() => {
    let alive = true, stop: (() => void) | undefined;
    void watchRequestPage(uid, "incoming", null, (value) => { if (alive) setItems(value.items); }, () => undefined)
      .then((fn) => { if (alive) stop = fn; else fn(); }).catch(() => undefined);
    return () => { alive = false; stop?.(); };
  }, [uid]);
  const pending = items.filter((entry) => statusOf(entry, now) === "pending");
  if (!pending.length && !message && !error) return null;
  return <section className="friendPendingBlock" aria-label="Solicitudes pendientes">
    {pending.length > 0 && <div className="streakSectionHead"><h3>Te quieren sumar a su racha</h3><span>{pending.length}</span></div>}
    {pending.map((entry) => <RequestRow key={entry.id} entry={entry} direction="incoming" now={now} busy={busy} act={act} />)}
    {message && <p role="status" className="streakSuccess">{message}</p>}
    {error && <p role="alert" className="streakError">{error}</p>}
  </section>;
}

/** Received / sent history, one list at a time. */
export function RequestHistory({ uid }: { uid: string }) {
  const [direction, setDirection] = useState<RequestDirection>("incoming");
  const now = useMinuteClock();
  const { busy, error, message, act } = useRequestActions();
  return <section className="friendHistory" aria-labelledby="friend-history-title">
    <div className="streakSectionHead"><h3 id="friend-history-title">Solicitudes</h3>
      <div className="segmented" role="group" aria-label="Mostrar solicitudes">
        {(["incoming", "outgoing"] as const).map((value) => <button key={value} type="button" aria-pressed={direction === value} className={direction === value ? "isActive" : ""} onClick={() => setDirection(value)}>{value === "incoming" ? "Recibidas" : "Enviadas"}</button>)}
      </div>
    </div>
    <RequestList key={direction} uid={uid} direction={direction} busy={busy} act={act} now={now} />
    {message && <p role="status" className="streakSuccess">{message}</p>}
    {error && <p role="alert" className="streakError">{error}</p>}
  </section>;
}

/** Your code as a ticket (copy / share) and the add-by-code search with its preview. */
export const AddFriendCard = forwardRef<HTMLInputElement, { uid: string; friendCount: number }>(function AddFriendCard({ uid, friendCount }, searchRef) {
  const [mine, setMine] = useState(""), [input, setInput] = useState(""), [preview, setPreview] = useState<FriendCodeView | null>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0), [copied, setCopied] = useState(false);
  const attempt = useRef<{ code: string; id: string } | null>(null), generation = useRef(0);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const full = friendCount >= FRIEND_LIMIT;
  useEffect(() => {
    let alive = true;
    void streakCommand<FriendCodeView>("getFriendCode").then((value) => { if (alive) { setMine(value.code); setError(""); } })
      .catch((reason) => { if (alive) setError(streakError(reason)); });
    return () => { alive = false; generation.current++; };
  }, [uid, retry]);
  useEffect(() => { if (!copied) return; const timer = window.setTimeout(() => setCopied(false), 2000); return () => window.clearTimeout(timer); }, [copied]);
  async function search() {
    if (busy) return;
    const current = ++generation.current;
    setBusy("search"); setPreview(null); setError(""); setMessage("");
    try { const value = await streakCommand<FriendCodeView>("lookupFriendCode", { code: input }); if (current === generation.current) setPreview(value); }
    catch (reason) { if (current === generation.current) setError(streakError(reason)); }
    finally { setBusy(""); }
  }
  async function send() {
    if (!preview || busy) return;
    setBusy("send"); setError(""); setMessage("");
    if (attempt.current?.code !== preview.code) attempt.current = { code: preview.code, id: crypto.randomUUID() };
    try {
      const result = await streakCommand<{ id: string; direction: RequestDirection }>("sendFriendRequest", { code: preview.code, requestId: attempt.current.id });
      attempt.current = null; setPreview(null); setInput("");
      setMessage(result.direction === "incoming" ? "Esta persona ya te envió una solicitud. Puedes aceptarla arriba." : "Solicitud enviada. La otra persona debe aceptar para iniciar la racha.");
    } catch (reason) { setError(streakError(reason)); }
    finally { setBusy(""); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(mine); setCopied(true); setMessage(""); }
    catch { document.getElementById("my-friend-code")?.focus(); setMessage("Selecciona y copia tu código."); }
  }
  async function share() {
    try { await navigator.share({ title: "Mi código de amigo en Cowork", text: `Agrégame en Cowork para compartir una racha: ${mine}` }); }
    catch (reason) { if ((reason as Error).name !== "AbortError") setMessage("No se pudo compartir. Copia el código."); }
  }
  return <section className="friendAddCard" aria-labelledby="friend-add-title">
    <h3 id="friend-add-title">Añadir amigo</h3>
    <div className="friendAddGrid">
      <div className="friendCodeTicket">
        <label htmlFor="my-friend-code">Mi código de amigo</label>
        {/* The input stays in the accessibility tree (label + select-on-focus fallback); the big code is its visual face. */}
        {mine || error
          ? <input id="my-friend-code" className="friendCodeInput" readOnly value={mine} placeholder="Código no disponible" onFocus={(event) => event.currentTarget.select()} />
          : <SkGroup className="friendCodeInput" label="Preparando tu código de amigo"><Sk w="12ch" /></SkGroup>}
        <div className="friendCodeActions">
          <button type="button" disabled={!mine} onClick={() => void copy()}>{copied ? <><span aria-hidden="true">✓ </span>Copiado</> : "Copiar"}</button>
          {canShare && <button type="button" className="streakQuiet" disabled={!mine} onClick={() => void share()}>Compartir</button>}
          {!mine && error && <button type="button" className="streakQuiet" onClick={() => setRetry((value) => value + 1)}>Reintentar</button>}
        </div>
      </div>
      <form className="friendCodeSearch" onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <label htmlFor="friend-code-search">Agregar amigo por código</label>
        <div>
          <input ref={searchRef} id="friend-code-search" value={input} maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            placeholder="CW-7K9M-2X4P" onChange={(event) => { generation.current++; setInput(event.target.value); setPreview(null); setMessage(""); }} />
          <button type="submit" disabled={!!busy || !input.trim()}>{busy === "search" ? "Buscando…" : "Buscar"}</button>
        </div>
        {preview && <div className="friendRequestPreview">
          <Avatar name={preview.name} photoURL={preview.photoURL} />
          <strong>{preview.name}</strong>
          <button type="button" className="streakPrimary" disabled={!!busy || full} onClick={() => void send()}>{busy === "send" ? "Enviando…" : "Enviar solicitud"}</button>
          <p className="streakHint">{full ? "Ya tienes cinco parejas activas." : "Al aceptar compartirán nombre, avatar y progreso de la racha."}</p>
        </div>}
      </form>
    </div>
    {message && <p role="status" className="streakSuccess">{message}</p>}
    {error && <p role="alert" className="streakError">{error}</p>}
  </section>;
});
