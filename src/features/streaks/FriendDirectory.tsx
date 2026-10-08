import { useEffect, useRef, useState } from "react";
import type { FriendPage } from "./streakModel";
import { streakCommand, streakError } from "./streakClient";
import { getCoworkFirestore } from "../../lib/firebase";
import { repeat, Sk, SkGroup, SkImg } from "../../components/Skeleton";

export function FriendDirectory({ uids, full }: { uids: readonly string[]; full: boolean }) {
  const [page, setPage] = useState<FriendPage | null>(null);
  const [cursors, setCursors] = useState<string[]>([""]);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [removing, setRemoving] = useState("");
  const requests = useRef(new Map<string, string>());
  const cursor = cursors.at(-1)!;
  useEffect(() => {
    let alive = true, stop: (() => void) | undefined, revision = 0;
    const refresh = async () => {
      const ticket = ++revision;
      try {
        const value = await streakCommand<FriendPage>("friendPage", { cursor });
        if (alive && ticket === revision) { setPage(value); setError(""); }
      } catch (reason) { if (alive && ticket === revision) setError(streakError(reason)); }
    };
    void Promise.all([getCoworkFirestore(), import("firebase/firestore")]).then(([db, api]) => {
      if (!db || !alive) return;
      const stops = uids.map((uid) => api.onSnapshot(api.query(api.collection(db, "streakFriendships"), api.where("memberUids", "array-contains", uid),
        api.where("status", "==", "active"), api.orderBy("createdAt", "desc"), api.limit(21)), () => { void refresh(); },
      (reason) => { if (alive) setError(streakError(reason)); }));
      stop = () => stops.forEach((unsubscribe) => unsubscribe());
    }).catch((reason) => { if (alive) setError(streakError(reason)); });
    const update = () => { void refresh(); };
    void refresh();
    window.addEventListener("cowork:social-change", update);
    return () => { alive = false; stop?.(); window.removeEventListener("cowork:social-change", update); };
  }, [uids, cursor]);
  async function act(friendshipId: string, remove = false) {
    if (busy) return;
    setBusy(friendshipId); setError(""); setMessage("");
    try {
      if (remove) {
        await streakCommand("removeFriend", { friendshipId });
        setMessage("Amistad eliminada. El historial de la racha se conserva.");
      } else {
        if (!requests.current.has(friendshipId)) requests.current.set(friendshipId, crypto.randomUUID());
        const result = await streakCommand<{ direction: string }>("requestStreak", { friendshipId, requestId: requests.current.get(friendshipId) });
        requests.current.delete(friendshipId);
        setMessage(result.direction === "incoming" ? "Esta persona ya te invitó a una racha. Puedes aceptarla en las solicitudes." : "Invitación a una racha enviada. La otra persona debe aceptar.");
      }
      setRemoving("");
      window.dispatchEvent(new Event("cowork:social-change"));
    } catch (reason) { setError(streakError(reason)); }
    finally { setBusy(""); }
  }
  return <section className="friendDirectory" aria-label="Todos tus amigos">
    <div className="streakSectionHead"><h3>Tus amigos</h3></div>
    <p className="streakHint">Puedes añadir más de cinco amigos. Elige con quién compartir una de tus cinco rachas.</p>
    {!page && !error && <SkGroup className="streakFriendList" as="ul" label="Cargando amigos">
      {repeat(3, (index) => <li className="streakFriend" key={index}>
        <div className="streakFriendIdentity"><Sk shape="block" w={36} h={36} r={11} /><div><h4><Sk w="14ch" /></h4><small><Sk w="20ch" /></small></div></div>
        <div className="streakFriendActions"><Sk shape="block" w={130} h={36} r={11} /><Sk shape="block" w={90} h={36} r={11} /></div>
      </li>)}
    </SkGroup>}
    {page?.items.length === 0 && <p className="streakHint">Añade a alguien usando su código de amigo.</p>}
    {!!page?.items.length && <ul className="streakFriendList">
      {page.items.map((friend) => <li className="streakFriend" key={friend.friendshipId}>
        <div className="streakFriendIdentity">
          {friend.photoURL ? <SkImg src={friend.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="streakFriendInitial" aria-hidden="true">{friend.name.slice(0, 1).toUpperCase()}</span>}
          <div><h4>{friend.name}</h4><small>{friend.streakActive ? "Racha compartida activa" : friend.best > 0 ? `Mejor racha compartida: ${friend.best}` : "Sin racha compartida"}</small></div>
        </div>
        <div className="streakFriendActions">
          {!friend.streakActive && <button type="button" disabled={!!busy || full} onClick={() => void act(friend.friendshipId)}>Invitar a una racha</button>}
          <button type="button" className="streakQuiet isDanger" disabled={!!busy} onClick={() => setRemoving(friend.friendshipId)}>Eliminar amigo</button>
        </div>
        {removing === friend.friendshipId && <div className="protectionConfirm isDanger"><p>Se eliminará la amistad con {friend.name}{friend.streakActive ? " y se cerrará su racha compartida" : ""}. Se conservará el historial.</p>
          <button type="button" disabled={!!busy} onClick={() => void act(friend.friendshipId, true)}>Eliminar amistad</button>
          <button type="button" className="streakQuiet" disabled={!!busy} onClick={() => setRemoving("")}>Cancelar</button>
        </div>}
      </li>)}
    </ul>}
    {(cursors.length > 1 || page?.next) && <nav className="streakPager" aria-label="Páginas de amigos">
      {cursors.length > 1 && <button type="button" disabled={!!busy} onClick={() => setCursors((value) => value.slice(0, -1))}>Anterior</button>}
      {page?.next && <button type="button" disabled={!!busy} onClick={() => setCursors((value) => [...value, page.next!])}>Siguiente</button>}
    </nav>}
    {message && <p role="status" className="streakSuccess">{message}</p>}
    {error && <p role="alert" className="streakError">{error}</p>}
  </section>;
}
