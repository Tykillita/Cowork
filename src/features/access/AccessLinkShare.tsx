import { useEffect, useId, useState } from "react";
import { Sk } from "../../components/Skeleton";

function fileSlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "proyecto";
}

/** Copy button and downloadable QR. The QR is rendered in the browser; the link never leaves the device. */
export function AccessLinkShare({ url, projectName, expiresAt, compact = false }: {
  url: string;
  projectName: string;
  expiresAt: string;
  compact?: boolean;
}) {
  const hintId = useId();
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  useEffect(() => {
    let active = true;
    setQr("");
    void import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 480,
      color: { dark: "#0b0d0f", light: "#ffffff" },
    })).then((data) => { if (active) setQr(data); }).catch(() => { if (active) setQr(""); });
    return () => { active = false; };
  }, [url]);

  useEffect(() => {
    if (copied === "idle") return;
    const timer = window.setTimeout(() => setCopied("idle"), 2400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  const expiry = new Intl.DateTimeFormat("es", { dateStyle: "long", timeStyle: "short" }).format(new Date(expiresAt));

  return (
    <div className={`accessShare${compact ? " isCompact" : ""}`}>
      <div className={`accessShareQr${qr ? "" : " isPending"}`} role={qr ? undefined : "status"} aria-label={qr ? undefined : "Generando QR"}>
        {qr ? <img src={qr} alt={`Código QR para solicitar acceso a ${projectName}`} width={160} height={160} /> : <Sk shape="block" h="100%" r={12} />}
      </div>
      <div className="accessShareBody">
        <label className="controlField">
          <span>Enlace para solicitar acceso</span>
          <input value={url} readOnly onFocus={(event) => event.currentTarget.select()} aria-describedby={hintId} />
        </label>
        <p className="accessShareHint" id={hintId}>Vence el {expiry}. Cada solicitud necesita tu aprobación.</p>
        <div className="accessShareActions">
          <button type="button" onClick={() => void copy()}>{copied === "done" ? "Enlace copiado" : "Copiar enlace"}</button>
          {!qr && <Sk shape="block" w={112} h={38} r={10} />}
          {qr && <a className="ghost accessShareDownload" href={qr} download={`cowork-acceso-${fileSlug(projectName)}.png`}>Descargar QR</a>}
        </div>
        {copied === "failed" && <p className="projectFormError" role="alert">No se pudo copiar automáticamente. Selecciona el enlace y cópialo.</p>}
        <span className="visuallyHidden" role="status">{copied === "done" ? "Enlace copiado al portapapeles." : ""}</span>
      </div>
    </div>
  );
}
