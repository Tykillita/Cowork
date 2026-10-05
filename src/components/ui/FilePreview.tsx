import { Fragment, useEffect, useState, type ReactNode } from "react";
import { formatBytes } from "../../features/code/repoTree";
import { GitHubMark } from "../../features/code/repoIcons";
import "./CodeBlock.css";

/**
 * Files that are not shown as code (images, binaries, files too large, read
 * errors) in the same window as CodeBlock: header with path and actions, file
 * bar, a stage or an explanation, and a footer with type, size and dimensions.
 */

export type PreviewKind = "image" | "binary" | "large" | "error";
type Backdrop = "checker" | "dark" | "light";

const BACKDROP_KEY = "cowork.preview-backdrop";
const BACKDROPS: { value: Backdrop; label: string }[] = [
  { value: "checker", label: "Fondo a cuadros" },
  { value: "dark", label: "Fondo oscuro" },
  { value: "light", label: "Fondo claro" },
];

function readBackdrop(): Backdrop {
  try {
    const value = localStorage.getItem(BACKDROP_KEY);
    return value === "dark" || value === "light" ? value : "checker";
  } catch {
    return "checker";
  }
}

/** "Ver en GitHub" with GitHub's mark: a pill in headers, a full button in empty states. */
export function GitHubLink({ href, variant = "pill", label = "Ver en GitHub" }: { href: string; variant?: "pill" | "button"; label?: string }) {
  return <a className={variant === "pill" ? "cbGitHub" : "ghButton"} href={href} target="_blank" rel="noreferrer" title={label}>
    <GitHubMark />
    <span className="ghLabel">{variant === "pill" ? "GitHub" : label}</span>
    <svg className="ghArrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4h6v6M12 4l-7 7" /></svg>
    <span className="visuallyHidden"> (se abre en otra pestaña)</span>
  </a>;
}

/** "Vista previa" / "Código" for files that can be read both ways (SVG). */
export function ViewSwitch({ value, onChange }: { value: "preview" | "code"; onChange: (value: "preview" | "code") => void }) {
  return <span className="cbSegment" role="group" aria-label="Forma de ver el archivo">
    <button type="button" aria-pressed={value === "preview"} onClick={() => onChange("preview")}>Vista previa</button>
    <button type="button" aria-pressed={value === "code"} onClick={() => onChange("code")}>Código</button>
  </span>;
}

const TITLES: Record<Exclude<PreviewKind, "image">, string> = {
  binary: "Archivo binario",
  large: "Archivo demasiado grande",
  error: "No se pudo abrir el archivo",
};

export function FilePreview({ name, breadcrumb = [], icon, kind, url, size, message, typeLabel, githubUrl, rawUrl, headerExtra }: {
  name: string;
  breadcrumb?: string[];
  /** File logo, shown small in the file bar and large in empty states. */
  icon?: ReactNode;
  kind: PreviewKind;
  /** Image address (a blob: URL). */
  url?: string;
  size: number;
  message?: string;
  /** "Imagen PNG", "Archivo BIN"… */
  typeLabel: string;
  githubUrl?: string;
  /** Download through github.com when Cowork does not have the bytes. */
  rawUrl?: string;
  headerExtra?: ReactNode;
}) {
  const [backdrop, setBackdrop] = useState<Backdrop>(readBackdrop);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => setNatural(null), [url]);

  function pickBackdrop(value: Backdrop) {
    setBackdrop(value);
    try { localStorage.setItem(BACKDROP_KEY, value); } catch { /* not remembered */ }
  }

  // Tiny icons (16–48 px) are enlarged with sharp pixels so they can be seen.
  const longest = natural ? Math.max(natural.width, natural.height) : 0;
  const zoom = longest > 0 && longest < 64 ? Math.max(2, Math.floor(128 / longest)) : 1;
  const downloadHref = url;
  const description = kind === "binary" ? "Su contenido no es texto, así que no se puede mostrar aquí."
    : kind === "large" ? "Supera el límite de 1 MB para mostrarlo aquí. Ábrelo en GitHub o descárgalo."
    : message || "GitHub no devolvió el contenido.";

  return <section className="codeBlock cbPreview" aria-label={`Archivo ${name}`}>
    <header className="cbHeader">
      <span className="cbDots" aria-hidden="true"><i /><i /><i /></span>
      {breadcrumb.length > 0 && <nav className="cbBreadcrumb" aria-label="Ruta del archivo">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" /></svg>
        {breadcrumb.map((part, index) => <Fragment key={`${part}-${index}`}>{index > 0 && <span className="cbSep" aria-hidden="true">›</span>}<span className={index === breadcrumb.length - 1 ? "cbCrumbLast" : ""}>{part}</span></Fragment>)}
      </nav>}
      {size > 0 && <span className="cbStats">{formatBytes(size)}</span>}
      <span className="cbActions">
        {headerExtra}
        {kind === "image" && downloadHref && <a className="cbIconButton" href={downloadHref} download={name} target={kind === "image" ? undefined : "_blank"} rel="noreferrer" aria-label={`Descargar ${name}`} title="Descargar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" /></svg>
        </a>}
        {kind === "image" && githubUrl && <GitHubLink href={githubUrl} />}
      </span>
    </header>
    <div className="cbFilename">
      {icon ? <span className="cbFileIcon">{icon}</span> : null}<span className="cbFileName">{name}</span>
      {kind === "image" && <span className="cbBackdrops" role="group" aria-label="Fondo de la vista previa">
        {BACKDROPS.map((option) => <button key={option.value} type="button" className={`cbSwatch is-${option.value}`} aria-pressed={backdrop === option.value} aria-label={option.label} title={option.label} onClick={() => pickBackdrop(option.value)} />)}
      </span>}
    </div>
    {kind === "image" && url
      ? <div className={`cbStage is-${backdrop}`}>
        <img src={url} alt={`Vista previa de ${name}`} className={zoom > 1 ? "isPixel" : undefined}
          style={zoom > 1 && natural ? { width: natural.width * zoom, height: natural.height * zoom } : undefined}
          onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
      </div>
      : <div className="cbEmpty">
        <span className={`cbEmptyIcon is-${kind}`} aria-hidden="true">{icon ?? <svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></svg>}</span>
        <h3>{kind === "image" ? "Imagen" : TITLES[kind]}</h3>
        <p>{description}</p>
        {(githubUrl || rawUrl) && <div className="cbEmptyActions">
          {githubUrl && <GitHubLink href={githubUrl} variant="button" />}
          {rawUrl && <a className="ghButton isQuiet" href={rawUrl} target="_blank" rel="noreferrer">
            <svg className="ghArrow isDownload" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" /></svg>Descargar
          </a>}
        </div>}
      </div>}
    <footer className="cbFooter">
      <span>{typeLabel}</span>
      {natural && <span>{natural.width} × {natural.height} px</span>}
      {zoom > 1 && natural && <span>Ampliada ×{zoom}</span>}
      {size > 0 && <span>{formatBytes(size)}</span>}
      <span className="cbEncoding">{kind === "image" ? "Vista previa" : kind === "binary" ? "Binario" : kind === "large" ? "Sin vista previa" : "Error"}</span>
    </footer>
  </section>;
}
