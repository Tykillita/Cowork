import { useState } from "react";
import type { User } from "firebase/auth";
import type { PanelUser } from "../../types";
import { discardVerifiedAccount, mergeVerifiedAccount, previewAccountMerge, verifyOtherAccount, verifyOtherAccountWithPassword, type MergePairPreview } from "./accountMerge";
import "./accountMerge.css";

function readableError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "cowork/merge-new-account") return "Ese método todavía no tiene una cuenta de Cowork. Inicia sesión primero con esa cuenta y crea su perfil.";
  if (code === "cowork/merge-new-account-cleanup-failed") return error instanceof Error ? error.message : "Firebase creó una cuenta temporal y no se pudo retirar. Inicia sesión con una cuenta Cowork existente y vuelve a intentarlo.";
  if (code === "cowork/merge-cleanup-pending") return error instanceof Error ? error.message : "Verifica primero la cuenta del intento anterior para terminar su limpieza.";
  if (code === "cowork/merge-already-linked") return "Una de las cuentas ya forma parte de otra fusión.";
  if (code === "cowork/merge-profile-mismatch") return "Hay una fusión pendiente con otro perfil principal. Repite la elección original.";
  if (code === "cowork/merge-pairs-changed") return "Las rachas activas cambiaron mientras elegías. Verifica otra vez y elige cuáles conservar.";
  if (code === "auth/popup-closed-by-user") return "Se cerró la ventana de acceso antes de verificar la cuenta.";
  if (code === "auth/popup-blocked") return "El navegador bloqueó la ventana de acceso. Permite ventanas emergentes y vuelve a intentarlo.";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"].includes(code)) return "El correo o la contraseña de la otra cuenta no coinciden.";
  if (code === "auth/account-exists-with-different-credential") return "Ese correo usa otro método de acceso. Elige el proveedor con el que se creó la otra cuenta.";
  if (code === "auth/unauthorized-domain") return "Este dominio todavía no está autorizado en Firebase Authentication.";
  if (code === "auth/operation-not-allowed") return "Activa ese método de acceso en Firebase Authentication.";
  return error instanceof Error ? error.message : "No se pudo verificar la otra cuenta.";
}

function accountLabel(value: User) {
  return value.displayName?.trim() || value.email?.split("@")[0] || "Cuenta Cowork";
}

export function AccountMergeControl({ user, onUserUpdated }: { user: PanelUser; onUserUpdated: (user: PanelUser) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [second, setSecond] = useState<User | null>(null);
  const [pairs, setPairs] = useState<MergePairPreview[]>([]);
  const [retainedPairs, setRetainedPairs] = useState<string[]>([]);
  const [profileUid, setProfileUid] = useState(user.profileUid ?? user.id);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const merged = user.mergedUids?.length === 2;

  async function verify(operation: () => Promise<User>) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const identity = await operation();
      if (identity.uid === user.id) throw Object.assign(new Error("Selecciona una cuenta de Firebase diferente."), { code: "cowork/merge-same-account" });
      if (!identity.email) throw new Error("El otro método no compartió un correo. No se puede comprobar su cuenta Cowork.");
      const activePairs = await previewAccountMerge(identity.uid);
      const externalPairs = activePairs.filter((pair) => pair.friendUid);
      setSecond(identity);
      setPairs(activePairs);
      setRetainedPairs(externalPairs.length > 5 ? [] : externalPairs.map((pair) => pair.id));
      setProfileUid(user.profileUid ?? user.id);
      setPassword("");
    } catch (reason) {
      const code = reason && typeof reason === "object" && "code" in reason ? reason.code : "";
      if (code !== "cowork/merge-new-account-cleanup-failed") await discardVerifiedAccount().catch(() => undefined);
      setError(readableError(reason));
    }
    finally { setBusy(false); }
  }

  async function finish() {
    if (!second || busy) return;
    setBusy(true); setError("");
    try {
      const mergedProfile = await mergeVerifiedAccount(second, profileUid, retainedPairs, pairs.map((pair) => pair.id));
      onUserUpdated({ ...user, profileUid: mergedProfile.profileUid, mergeId: mergedProfile.mergeId, mergedUids: mergedProfile.memberUids,
        name: mergedProfile.name, email: mergedProfile.email || user.email, photoURL: mergedProfile.photoURL || user.photoURL });
      setSecond(null);
      setPairs([]); setRetainedPairs([]);
      setOpen(false);
    } catch (reason) {
      if (reason && typeof reason === "object" && "code" in reason && reason.code === "cowork/merge-pairs-changed") {
        try {
          const refreshed = await previewAccountMerge(second.uid);
          const available = new Set(refreshed.filter((pair) => pair.friendUid).map((pair) => pair.id));
          setPairs(refreshed);
          setRetainedPairs((selected) => selected.filter((id) => available.has(id)));
        } catch { /* Keep the current choices visible if refresh also fails. */ }
      }
      setError(readableError(reason));
    }
    finally { setBusy(false); }
  }

  if (merged) return <div className="accountMergeStatus" role="status">
    <span className="accountAccessMethodsLabel">PERFIL FUSIONADO</span>
    <strong>2 cuentas pueden entrar al mismo perfil</strong>
    <small>Los dos UID de Firebase siguen separados. Los proyectos y datos personales se comparten dentro de Cowork.</small>
  </div>;

  return <section className="accountMergeControl" aria-label="Unir cuentas Cowork">
    {!open ? <button className="accountMergeOpen" type="button" onClick={() => { setOpen(true); setError(""); }}>
      <span><strong>Unir otra cuenta Cowork</strong><small>Confirma el acceso a ambas cuentas para compartir el perfil.</small></span>
      <span aria-hidden="true">↗</span>
    </button> : <div className="accountMergeFlow">
      <div className="accountMergeHeading"><strong>{second ? "Elige el perfil principal" : "Verifica la otra cuenta"}</strong>
        <button type="button" className="accountMergeClose" onClick={() => { void discardVerifiedAccount().catch(() => undefined); setOpen(false); setSecond(null); setPairs([]); setRetainedPairs([]); setError(""); }} disabled={busy} aria-label="Cerrar fusión">×</button>
      </div>
      {!second ? <>
        <p>Entra con el método que ya usas en la otra cuenta. La sesión actual de Cowork seguirá abierta.</p>
        <div className="accountMergeProviders">
          <button type="button" onClick={() => void verify(() => verifyOtherAccount("google"))} disabled={busy}>{busy ? "Verificando…" : "Continuar con Google"}</button>
          <button type="button" onClick={() => void verify(() => verifyOtherAccount("github"))} disabled={busy}>{busy ? "Verificando…" : "Continuar con GitHub"}</button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void verify(() => verifyOtherAccountWithPassword(email, password)); }}>
          <label>O entra con correo y contraseña
            <input autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>Contraseña de la otra cuenta
            <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <button className="accountMergeSecondary" type="submit" disabled={busy}>{busy ? "Verificando…" : "Verificar cuenta"}</button>
        </form>
      </> : <>
        <p>Las dos identidades confirmaron el acceso. Elige qué nombre, avatar, preferencias y escena verás en el perfil compartido.</p>
        <label className="accountMergeChoice"><input type="radio" name="merge-profile" checked={profileUid === user.id} onChange={() => setProfileUid(user.id)} />
          <span><strong>{user.name}</strong><small>{user.email} · perfil actual</small></span>
        </label>
        <label className="accountMergeChoice"><input type="radio" name="merge-profile" checked={profileUid === second.uid} onChange={() => setProfileUid(second.uid)} />
          <span><strong>{accountLabel(second)}</strong><small>{second.email} · otra cuenta</small></span>
        </label>
        {pairs.length > 0 && <div className="accountMergePairs">
          <strong>{pairs.some((pair) => pair.friendUid) ? "Rachas que seguirán activas" : "Racha entre estas cuentas"}</strong>
          <small>{pairs.filter((pair) => pair.friendUid).length > 5
            ? "Conserva exactamente cinco rachas. Las demás amistades y su historial se mantienen."
            : pairs.some((pair) => pair.friendUid)
              ? "Puedes conservar hasta cinco; las amistades se mantienen aunque cierres una racha."
              : "La racha entre las dos cuentas se cerrará al unirlas; las amistades y su historial se mantienen."}</small>
          {pairs.filter((pair) => pair.friendUid).map((pair) => {
            const checked = retainedPairs.includes(pair.id), limitReached = pairs.filter((entry) => entry.friendUid).length > 5 && retainedPairs.length >= 5;
            return <label className="accountMergePair" key={pair.id}>
              <input type="checkbox" checked={checked} disabled={busy || !checked && limitReached}
                onChange={() => setRetainedPairs((value) => checked ? value.filter((id) => id !== pair.id) : [...value, pair.id])} />
              <span>{pair.name}</span><small>{checked ? "Se conserva" : "Se cierra la racha"}</small>
            </label>;
          })}
          {pairs.filter((pair) => !pair.friendUid).length > 0 && <small>Se cerrará automáticamente la racha entre las dos cuentas que estás uniendo.</small>}
        </div>}
        <p className="accountMergeConsent">Al fusionar, cualquiera de las dos cuentas podrá acceder a los proyectos y al progreso personal de ambas. La fusión no elimina los UID de Firebase.</p>
        <button className="accountMergeFinish" type="button" onClick={() => void finish()}
          disabled={busy || pairs.filter((pair) => pair.friendUid).length > 5 && retainedPairs.length !== 5}>
          {busy ? "Fusionando…" : "Fusionar las dos cuentas"}
        </button>
      </>}
      {error && <p className="accountMergeError" role="alert">{error}</p>}
    </div>}
  </section>;
}
