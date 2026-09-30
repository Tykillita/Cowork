import { useRef, useState } from "react";
import { DAY_MS, PROTECTION_PRICES, type ProtectionProduct } from "./streakModel";
import { usePersonal } from "../personal/PersonalContext";
import { streakCommand, streakError } from "./streakClient";
import { Sk } from "../../components/Skeleton";

export function ProtectionShop() {
  const { streak, streakError: historyError, wallet, walletReady, today, refreshStreak } = usePersonal();
  const [confirming, setConfirming] = useState<ProtectionProduct | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const requests = useRef<Partial<Record<ProtectionProduct, string>>>({});
  const state = streak?.state;
  const ready = walletReady && (!!streak || !!historyError);
  const end = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date((today + 7) * DAY_MS));
  async function buy(product: ProtectionProduct) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    requests.current[product] ??= crypto.randomUUID();
    try {
      await streakCommand("buyProtection", { product, requestId: requests.current[product] });
      delete requests.current[product];
      await refreshStreak();
      setMessage(product === "single" ? "Protector guardado. Se usará automáticamente si hace falta." : "Escudo activado durante siete días UTC.");
      setConfirming(null);
    } catch (reason) { setError(streakError(reason)); }
    finally { setBusy(false); }
  }
  return <section className="streakProtection" aria-labelledby="protection-title">
    <div className="streakSectionHead"><h3 id="protection-title">Protección de racha</h3><span>{walletReady ? wallet.balance : <Sk inline w="1.5ch" />} puntos</span></div>
    <p className="streakHint">Conserva tu racha durante una ausencia. Los días protegidos no suman actividad ni puntos.</p>
    <div className="protectionGrid">
      {(["single", "shield"] as const).map((product) => {
        const price = PROTECTION_PRICES[product];
        const unavailable = !state || (product === "single" ? state.protectors >= 2 : state.shieldEnd >= today);
        return <article className="protectionProduct" key={product}>
          <span className="pixelShield" aria-hidden="true">{product === "single" ? "1" : "7"}</span>
          <div><h4>{product === "single" ? "Protector individual" : "Escudo de siete días"}</h4>
            {!ready ? <><p><Sk w="80%" /></p><Sk shape="block" h={36} r={11} className="protectionButtonSkeleton" /></> : <>
            <p>{product === "single" ? `${state?.protectors ?? 0}/2 guardados · cubre una ausencia` : state && state.shieldEnd >= today
              ? `Activo hasta ${new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date((state.shieldEnd + 1) * DAY_MS))}`
              : "Se activa al comprarlo · siete fechas UTC"}</p>
            <button type="button" disabled={unavailable || busy || wallet.balance < price} onClick={() => { setConfirming(product); setError(""); setMessage(""); }}>
              {unavailable && state ? product === "single" ? "Inventario completo" : "Escudo activo" : wallet.balance < price ? `Faltan ${price - wallet.balance} puntos` : `Comprar · ${price} puntos`}
            </button></>}
          </div>
        </article>;
      })}
    </div>
    {confirming && <div className="protectionConfirm" role="group" aria-label="Confirmar compra de protección">
      <p>{confirming === "shield" ? `El escudo empieza hoy y vence el ${end}, hora local. Cubre hoy y las seis fechas UTC siguientes.` : "Se guardará un protector para tu próxima ausencia. No repara días anteriores."}</p>
      <button className="streakPrimary" type="button" onClick={() => void buy(confirming)} disabled={busy}>{busy ? "Comprando…" : `Confirmar · ${PROTECTION_PRICES[confirming]} puntos`}</button>
      <button type="button" onClick={() => setConfirming(null)} disabled={busy}>Cancelar</button>
    </div>}
    {message && <p role="status" className="streakSuccess">{message}</p>}
    {error && <p role="alert" className="streakError">{error}</p>}
  </section>;
}
