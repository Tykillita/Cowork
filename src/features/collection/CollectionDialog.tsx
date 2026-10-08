import { useEffect, useRef, useState } from "react";
import { SceneCanvas } from "../ambient/AmbientScene";
import { CHARACTERS, LANDSCAPES, RARITIES, findItem, isAvailable, nextUnlock, priceOf, type Landscape, type PixelCharacter } from "../ambient/sceneCatalog";
import { usePersonal } from "../personal/PersonalContext";
import { DAILY_POINT_LIMIT, nextUtcDayStart } from "../progress/progressStore";
import type { PointMovement, SceneSelection } from "../../types";

import { ProtectionShop } from "../streaks/ProtectionShop";
import { repeat, Sk } from "../../components/Skeleton";
import "../streaks/streaks.css";
type Item = PixelCharacter | Landscape;

const lockIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
type Tab = "collection" | "shop";

function requirement(item: Item, activeDays: number, owned: ReadonlySet<string>) {
  if (item.rarity) {
    const { label, price } = RARITIES[item.rarity];
    return owned.has(item.id) ? `${label} · comprado en la tienda` : `${label} · ${price} puntos`;
  }
  const days = item.unlockDays ?? 0;
  if (days === 0) return "Disponible desde el inicio";
  if (activeDays >= days) return `Desbloqueado · ${days} ${days === 1 ? "día activo" : "días activos"}`;
  const missing = days - activeDays;
  return `Se desbloquea con ${days} ${days === 1 ? "día activo" : "días activos"} · faltan ${missing}`;
}

const movementTime = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function purchaseError(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  if (code === "cowork/insufficient-points") return "No tienes puntos suficientes para este objeto.";
  return "No se pudo completar la compra. Revisa tu conexión e inténtalo de nuevo; no se descontó ningún punto.";
}

export function CollectionDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { userId, sourceUids, progress, progressReady, wallet, walletReady, owned, scene, today, saveScene, purchase } = usePersonal();
  const [movements, setMovements] = useState<PointMovement[]>([]);
  const activeToday = progress.days.includes(today);
  const [draft, setDraft] = useState<SceneSelection>(scene);
  const [tab, setTab] = useState<Tab>("collection");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const activeDays = progress.activeDays;
  const upcoming = nextUnlock(activeDays);
  const nextDay = new Intl.DateTimeFormat("es", { weekday: "long", hour: "2-digit", minute: "2-digit" }).format(nextUtcDayStart());
  const draftItems = [findItem(draft.characterId), findItem(draft.landscapeId)];
  const draftAvailable = draftItems.every((item) => item && isAvailable(item, activeDays, owned));
  const draftNeedsShop = draftItems.some((item) => item?.rarity && !owned.has(item.id));
  const changed = draft.characterId !== scene.characterId || draft.landscapeId !== scene.landscapeId;
  const inCollection = (item: Item) => !item.rarity || owned.has(item.id);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => setDraft(scene), [scene]);

  // Latest points earned and spent, only while the dialog is open.
  useEffect(() => {
    if (!userId) return;
    let stop: (() => void) | null = null;
    let active = true;
    void import("../progress/progressStore")
      .then(({ watchMovements }) => watchMovements(sourceUids, (value) => { if (active) setMovements(value); }, () => undefined))
      .then((unsubscribe) => { if (active) stop = unsubscribe; else unsubscribe(); })
      .catch(() => undefined);
    return () => { active = false; stop?.(); };
  }, [userId, sourceUids]);

  function close() {
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  }

  function preview(item: Item, kind: "character" | "landscape") {
    setDraft((current) => kind === "character" ? { ...current, characterId: item.id } : { ...current, landscapeId: item.id });
    setMessage("");
  }

  async function save() {
    if (!draftAvailable || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await saveScene(draft);
      setMessage("Tu escena quedó guardada. Aparecerá en los proyectos sin fecha de entrega.");
    } catch {
      setError("No se pudo guardar la escena. Comprueba que ya esté desbloqueada y tu conexión.");
    } finally {
      setSaving(false);
    }
  }

  async function buy(item: Item) {
    if (buying) return;
    setBuying(true);
    setError("");
    setMessage("");
    try {
      await purchase(item.id);
      setMessage(`«${item.name}» ya es tuyo. Puedes usarlo en tu escena.`);
    } catch (reason) {
      if ((reason as { code?: string } | null)?.code === "cowork/already-owned") setMessage(`«${item.name}» ya estaba en tu colección.`);
      else setError(purchaseError(reason));
    } finally {
      setBuying(false);
      setConfirming(null);
    }
  }

  function card(item: Item, kind: "character" | "landscape") {
    const available = isAvailable(item, activeDays, owned);
    const selected = kind === "character" ? draft.characterId === item.id : draft.landscapeId === item.id;
    const characterId = kind === "character" ? item.id : draft.characterId;
    const landscapeId = kind === "landscape" ? item.id : draft.landscapeId;
    return (
      <button type="button" className={`collectionItem${selected ? " isSelected" : ""}${available ? "" : " isLocked"}`} aria-pressed={selected} onClick={() => preview(item, kind)}>
        <span className="collectionThumb"><SceneCanvas characterId={characterId} landscapeId={landscapeId} className="collectionCanvas" label={`Vista previa: ${item.name}`} /></span>
        <strong>{item.name}{!available && <span className="collectionLock" role="img" aria-label="Bloqueado">{lockIcon}</span>}</strong>
        <small>{requirement(item, activeDays, owned)}</small>
      </button>
    );
  }

  function shopCard(item: Item, kind: "character" | "landscape") {
    const price = priceOf(item) ?? 0;
    const base = item.variantOf ? findItem(item.variantOf) : null;
    const missing = price - wallet.balance;
    return (
      <div key={item.id} className="shopItem">
        {card(item, kind)}
        <p className="shopDescription">{base ? `Variante de ${base.name}. ` : ""}{item.description}</p>
        {owned.has(item.id) ? (
          <p className="shopOwned">En tu colección</p>
        ) : confirming === item.id ? (
          <div className="shopConfirm">
            <button type="button" className="shopConfirmBuy" onClick={() => void buy(item)} disabled={buying}>{buying ? "Comprando…" : `Canjear ${price} puntos`}</button>
            <button type="button" className="shopConfirmCancel" onClick={() => setConfirming(null)} disabled={buying}>Cancelar</button>
          </div>
        ) : (
          <button type="button" className="shopBuy" disabled={!progressReady || missing > 0 || buying} onClick={() => { setConfirming(item.id); setError(""); setMessage(""); }}>
            {missing > 0 ? `Faltan ${missing} ${missing === 1 ? "punto" : "puntos"}` : `Comprar · ${price} puntos`}
          </button>
        )}
      </div>
    );
  }

  const shopCharacters = CHARACTERS.filter((item) => item.rarity);
  const shopLandscapes = LANDSCAPES.filter((item) => item.rarity);

  return (
    <dialog ref={dialogRef} className="projectCreateCard projectCreateDialog collectionDialog" aria-labelledby="collection-title" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="collectionHeader">
        <div><p className="eyebrow">MI COLECCIÓN</p><h2 id="collection-title">Personajes y paisajes</h2></div>
        <button className="collectionClose" type="button" aria-label="Cerrar" title="Cerrar" onClick={close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
        </button>
      </div>

      <div className="collectionStats" aria-live="polite">
        <div><b>{progressReady ? progress.currentStreak : <Sk w="2ch" />}</b><span>Racha actual</span></div>
        <div><b>{progressReady ? progress.bestStreak : <Sk w="2ch" />}</b><span>Mejor racha</span></div>
        <div><b>{progressReady ? activeDays : <Sk w="2ch" />}</b><span>Días activos</span></div>
        <div className="collectionPoints"><b>{walletReady ? wallet.balance : <Sk w="2ch" />}</b><span>Saldo</span></div>
      </div>
      <div className="collectionToday" aria-live="polite">
        <span className={`collectionTodayStatus${activeToday ? " isDone" : ""}`}>{!progressReady ? <Sk inline w="24ch" /> : activeToday ? "✓ Actividad de hoy registrada" : "Todavía no hay actividad hoy"}</span>
        <span className="collectionTodayPoints">
          Puntos de hoy: {walletReady ? wallet.pointsToday : <Sk inline w="1ch" />}/{DAILY_POINT_LIMIT}
          <span className="collectionPointDots" aria-hidden="true">
            {Array.from({ length: DAILY_POINT_LIMIT }, (_, index) => walletReady ? <i key={index} className={index < wallet.pointsToday ? "isEarned" : ""} /> : <Sk key={index} shape="circle" w={7} h={7} />)}
          </span>
        </span>
        {upcoming && progressReady && <span className="collectionTodayNext">Próximo desbloqueo: <strong>{upcoming.name}</strong> · faltan {upcoming.unlockDays - activeDays} {upcoming.unlockDays - activeDays === 1 ? "día" : "días"}</span>}
      </div>
      <p className="projectCreateHint collectionHint">
        Cuentan crear una tarea, cambiar su estado o registrar una rama nueva. Crear un proyecto también mantiene tu racha, pero no da puntos. La primera actividad del día suma un día activo y mantiene tu racha; cada acción de trabajo da 1 punto, hasta {DAILY_POINT_LIMIT} por día entre todos tus proyectos y dispositivos. El día cambia a medianoche UTC: el próximo empieza el {nextDay} (hora local). Un día sin actividad conserva la racha si tienes protección; de lo contrario vuelve a 0. Siempre conservas tus días, puntos y objetos.
      </p>

      <div className="collectionPreview">
        <SceneCanvas characterId={draft.characterId} landscapeId={draft.landscapeId} className="ambientCanvas" />
      </div>

      <div className="segmented collectionTabs" role="tablist" aria-label="Secciones">
        <button type="button" role="tab" aria-selected={tab === "collection"} className={tab === "collection" ? "isActive" : ""} onClick={() => setTab("collection")}>Colección</button>
        <button type="button" role="tab" aria-selected={tab === "shop"} className={tab === "shop" ? "isActive" : ""} onClick={() => setTab("shop")}>Tienda</button>
      </div>

      {tab === "collection" ? (
        <div role="tabpanel" aria-label="Colección">
          <h3 className="collectionHeading">Personajes</h3>
          <div className="collectionGrid">
            {CHARACTERS.filter(inCollection).map((item) => <div key={item.id}>{card(item, "character")}</div>)}
          </div>
          <h3 className="collectionHeading">Paisajes</h3>
          <div className="collectionGrid">
            {LANDSCAPES.filter(inCollection).map((item) => <div key={item.id}>{card(item, "landscape")}</div>)}
          </div>
        </div>
      ) : (
        <div role="tabpanel" aria-label="Tienda">
          <ProtectionShop />
          <p className="projectCreateHint collectionHint">Canjea puntos por personajes, paisajes y variantes. Los objetos comprados quedan en tu colección para siempre.</p>
          <div className="collectionLedger">
            <p className="collectionLedgerTotals">Ganados <b>{walletReady ? wallet.earned : <Sk inline w="2ch" />}</b> · Gastados <b>{walletReady ? wallet.spent : <Sk inline w="2ch" />}</b> · Saldo <b>{walletReady ? wallet.balance : <Sk inline w="2ch" />}</b></p>
            {!walletReady && <ul aria-hidden="true">{repeat(3, (index) => <li key={index}><Sk w="3ch" /><Sk w={index % 2 ? "48%" : "62%"} /><Sk w="9ch" /></li>)}</ul>}
            {walletReady && movements.length > 0 && (
              <ul aria-label="Movimientos recientes de puntos">
                {movements.map((movement) => (
                  <li key={`${movement.kind}-${movement.id}`}>
                    <span className={movement.kind === "earn" ? "isEarn" : "isSpend"}>{movement.kind === "earn" ? "+" : "−"}{movement.points}</span>
                    <span>{movement.label}</span>
                    <time>{movement.at ? movementTime.format(movement.at) : "ahora"}</time>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <h3 className="collectionHeading">Personajes</h3>
          <div className="collectionGrid">{shopCharacters.map((item) => shopCard(item, "character"))}</div>
          <h3 className="collectionHeading">Paisajes</h3>
          <div className="collectionGrid">{shopLandscapes.map((item) => shopCard(item, "landscape"))}</div>
        </div>
      )}

      {/* Sticky footer: status of the previewed combination and the action to use it, reachable from either tab. */}
      <div className="collectionFooter">
        <div className="collectionFooterStatus">
          {!draftAvailable && (
            <p className="collectionStatus isWarning" role="status">
              {draftNeedsShop ? "Puedes previsualizar esta combinación; consigue sus objetos en la tienda para usarla." : "Puedes previsualizar esta combinación, pero todavía no está desbloqueada."}
            </p>
          )}
          {error && <p className="collectionStatus isError" role="alert">{error}</p>}
          {message && <p className="collectionStatus" role="status">{message}</p>}
        </div>
        <button type="button" className="collectionSave" onClick={() => void save()} disabled={!draftAvailable || !changed || saving}>{saving ? "Guardando…" : "Usar esta combinación"}</button>
      </div>
    </dialog>
  );
}
