import { useEffect, useRef } from "react";
import { repeat, Sk, SkGroup } from "./Skeleton";

/** Keeps the dialog's shape and dismissal controls while its view code arrives. */
export function LazyDialogSkeleton({ kind, onClose }: { kind: "streak" | "collection"; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);

  if (kind === "streak") return <dialog ref={dialog} className="streakDialog" aria-labelledby="streak-loading-title" onClose={onClose}>
    <SkGroup label="Cargando rachas y puntos">
      <header className="streakDialogHeader"><div><p className="eyebrow">TU CAMINO EN COWORK</p><h2 id="streak-loading-title">Rachas y puntos</h2></div><button type="button" className="streakClose" onClick={onClose} aria-label="Cerrar rachas">×</button></header>
      <div className="segmented streakTabs"><button type="button" disabled>Personal</button><button type="button" disabled>Amigos</button></div>
      <div className="streakHero isPending"><div className="streakHeroCopy"><div className="streakHeroMain"><Sk shape="block" w={80} h={100} r={14} /><div><b><Sk shape="block" w={46} h={56} r={10} /></b><span><Sk shape="block" w={78} h={10} /></span></div></div><h3><Sk w="38%" /></h3><p><Sk w="72%" /></p></div><Sk shape="block" h={100} className="skFill" r={0} /></div>
      <div className="streakStats">{repeat(3, (index) => <div key={index}><b><Sk w="2ch" /></b><span>{["Mejor racha", "Días activos", "Puntos disponibles"][index]}</span></div>)}</div>
      <div className="streakWeek">{repeat(7, (index) => <div key={index}><span>{["D", "L", "M", "X", "J", "V", "S"][index]}</span><Sk shape="block" w={34} h={34} r={10} /></div>)}</div>
    </SkGroup>
  </dialog>;

  return <dialog ref={dialog} className="projectCreateCard projectCreateDialog collectionDialog" aria-labelledby="collection-loading-title" onClose={onClose}>
    <SkGroup label="Cargando colección">
      <div className="collectionHeader"><div><p className="eyebrow">MI COLECCIÓN</p><h2 id="collection-loading-title">Personajes y paisajes</h2></div><button type="button" className="collectionClose" onClick={onClose} aria-label="Cerrar">×</button></div>
      <div className="collectionStats">{repeat(4, (index) => <div key={index}><b><Sk w="2ch" /></b><span>{["Racha actual", "Mejor racha", "Días activos", "Saldo"][index]}</span></div>)}</div>
      <div className="collectionToday"><Sk w="40%" /><Sk w="25%" /></div>
      <p className="projectCreateHint collectionHint"><Sk w="92%" /><Sk w="70%" /></p>
      <div className="collectionPreview"><Sk shape="block" className="skFill" r={0} /></div>
      <div className="segmented collectionTabs"><button type="button" disabled>Colección</button><button type="button" disabled>Tienda</button></div>
      <div role="tabpanel" aria-label="Colección"><h3 className="collectionHeading">Personajes</h3><div className="collectionGrid">{repeat(4, (index) => <div key={index}><Sk shape="block" h={150} className="skFill" r={12} /></div>)}</div></div>
    </SkGroup>
  </dialog>;
}
