import { Fragment, useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { CodeTheme, HighlightedLine } from "../../features/code/highlighter";
import { languageLabel } from "../../features/code/repoTree";
import "./CodeBlock.css";

/**
 * Code viewer with the features of ScrollX UI's CodeBlock: window header with
 * breadcrumb and stats, tabs, line numbers, highlighted lines, copy, download,
 * full-screen view, footer and dark or light theme. The text shows at once;
 * Shiki colours it when its chunk has loaded. Tokens are React text, never HTML.
 */

export interface CodeFile {
  name: string;
  /** Used for the download name and as the tab id. */
  path?: string;
  language: string;
  code: string;
  /** Shown before the name in the file bar and tabs (for example a language logo). */
  icon?: ReactNode;
}

type LineMark = number | [number, number];

const CHUNK = 500;

function inMarks(line: number, marks: LineMark[]) {
  return marks.some((mark) => (Array.isArray(mark) ? line >= mark[0] && line <= mark[1] : line === mark));
}

function linesOf(code: string) {
  const lines = code.split("\n");
  // A final newline does not make an extra empty line.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function CodeBlock({ files, activeFile, onActiveFileChange, breadcrumb = [], theme = "dark", showLineNumbers = true, highlightLines = [], onLineClick, actions = { copy: true, download: true, expand: true }, headerExtra }: {
  files: CodeFile[];
  activeFile?: string;
  onActiveFileChange?: (path: string) => void;
  breadcrumb?: string[];
  theme?: CodeTheme;
  showLineNumbers?: boolean;
  highlightLines?: LineMark[];
  /** A line number was clicked; `extend` when Shift was held (ranges). */
  onLineClick?: (line: number, extend: boolean) => void;
  actions?: { copy?: boolean; download?: boolean; expand?: boolean };
  headerExtra?: ReactNode;
}) {
  const [ownActive, setOwnActive] = useState(files[0]?.path ?? files[0]?.name ?? "");
  const activeId = activeFile ?? ownActive;
  const file = files.find((entry) => (entry.path ?? entry.name) === activeId) ?? files[0];
  const [expanded, setExpanded] = useState(false);
  if (!file) return null;
  const choose = (id: string) => { setOwnActive(id); onActiveFileChange?.(id); };
  const frame = (inDialog: boolean) => <CodeFrame
    file={file}
    files={files}
    activeId={file.path ?? file.name}
    onChoose={choose}
    breadcrumb={breadcrumb}
    theme={theme}
    showLineNumbers={showLineNumbers}
    highlightLines={highlightLines}
    onLineClick={onLineClick}
    actions={{ ...actions, expand: actions.expand && !inDialog }}
    onExpand={() => setExpanded(true)}
    onClose={inDialog ? () => setExpanded(false) : undefined}
    headerExtra={headerExtra}
  />;
  return <>
    {frame(false)}
    {expanded && <ExpandedCode label={`${file.name} a pantalla completa`} onClose={() => setExpanded(false)}>{frame(true)}</ExpandedCode>}
  </>;
}

function ExpandedCode({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const cancel = (event: Event) => { event.preventDefault(); onClose(); };
    dialog.addEventListener("cancel", cancel);
    return () => { dialog.removeEventListener("cancel", cancel); if (dialog.open) dialog.close(); };
  }, [onClose]);
  return <dialog ref={ref} className="cbDialog" aria-label={label}>{children}</dialog>;
}

function CodeFrame({ file, files, activeId, onChoose, breadcrumb, theme, showLineNumbers, highlightLines, onLineClick, actions, onExpand, onClose, headerExtra }: {
  file: CodeFile;
  files: CodeFile[];
  activeId: string;
  onChoose: (id: string) => void;
  breadcrumb: string[];
  theme: CodeTheme;
  showLineNumbers: boolean;
  highlightLines: LineMark[];
  onLineClick?: (line: number, extend: boolean) => void;
  actions: { copy?: boolean; download?: boolean; expand?: boolean };
  onExpand: () => void;
  onClose?: () => void;
  headerExtra?: ReactNode;
}) {
  const ids = useId();
  const [tokens, setTokens] = useState<HighlightedLine[] | null>(null);
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => linesOf(file.code), [file.code]);
  const words = useMemo(() => file.code.split(/\s+/).filter(Boolean).length, [file.code]);

  useEffect(() => {
    let active = true;
    setTokens(null);
    void import("../../features/code/highlighter")
      .then(({ highlight }) => highlight(file.code, file.language, theme))
      .then((result) => { if (active) setTokens(result); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [file.code, file.language, theme]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(file.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([file.code], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = (file.path ?? file.name).split("/").pop() || "archivo.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function onGutterClick(event: MouseEvent<HTMLDivElement>) {
    const number = (event.target as HTMLElement).closest<HTMLElement>(".cbNum");
    if (!number || !onLineClick) return;
    onLineClick(Number(number.dataset.n), event.shiftKey);
  }

  const chunks: string[][] = [];
  for (let index = 0; index < lines.length; index += CHUNK) chunks.push(lines.slice(index, index + CHUNK));

  return <section className="codeBlock" data-theme={theme} aria-label={`Código de ${file.name}`}>
    <header className="cbHeader">
      <span className="cbDots" aria-hidden="true"><i /><i /><i /></span>
      {breadcrumb.length > 0 && <nav className="cbBreadcrumb" aria-label="Ruta del archivo">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" /></svg>
        {breadcrumb.map((part, index) => <Fragment key={`${part}-${index}`}>{index > 0 && <span className="cbSep" aria-hidden="true">›</span>}<span className={index === breadcrumb.length - 1 ? "cbCrumbLast" : ""}>{part}</span></Fragment>)}
      </nav>}
      <span className="cbStats" aria-label={`${lines.length} líneas, ${words} palabras`}>{lines.length} L · {words} P</span>
      <span className="cbActions">
        {headerExtra}
        {actions.expand && <button type="button" className="cbIconButton" onClick={onExpand} aria-label="Ver a pantalla completa" title="Pantalla completa"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg></button>}
        {onClose && <button type="button" className="cbIconButton" onClick={onClose} aria-label="Salir de pantalla completa" title="Cerrar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg></button>}
        {actions.download && <button type="button" className="cbIconButton" onClick={download} aria-label={`Descargar ${file.name}`} title="Descargar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" /></svg></button>}
        {actions.copy && <button type="button" className="cbIconButton" onClick={() => void copy()} aria-label="Copiar el código" title="Copiar">{copied
          ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></svg>}</button>}
        <span className="visuallyHidden" role="status">{copied ? "Copiado" : ""}</span>
      </span>
    </header>
    {files.length > 1
      ? <div className="cbTabs" role="tablist" aria-label="Archivos">{files.map((entry) => {
        const id = entry.path ?? entry.name;
        return <button key={id} type="button" role="tab" id={`${ids}-tab-${id}`} aria-selected={id === activeId} aria-controls={`${ids}-panel`} className={id === activeId ? "isActive" : ""} onClick={() => onChoose(id)}>{entry.icon && <span className="cbFileIcon">{entry.icon}</span>}{entry.name}</button>;
      })}</div>
      : <div className="cbFilename">{file.icon ? <span className="cbFileIcon">{file.icon}</span> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8-4 4 4 4M16 8l4 4-4 4" /></svg>}{file.name}</div>}
    <div className="cbBody" id={`${ids}-panel`} role={files.length > 1 ? "tabpanel" : undefined} aria-labelledby={files.length > 1 ? `${ids}-tab-${activeId}` : undefined} tabIndex={0} onClick={onGutterClick}>
      <div className={`cbPre${showLineNumbers ? " hasNumbers" : ""}`} translate="no">
        {chunks.map((chunk, chunkIndex) => <div className="cbChunk" key={chunkIndex} style={{ containIntrinsicSize: `auto ${chunk.length * 20}px` }}>
          {chunk.map((text, offset) => {
            const number = chunkIndex * CHUNK + offset + 1;
            const lineTokens = tokens?.[number - 1];
            const marked = inMarks(number, highlightLines);
            return <div className={`cbLine${marked ? " isMarked" : ""}`} key={number} data-line={number}>
              {showLineNumbers && <span className={`cbNum${onLineClick ? " isLink" : ""}`} data-n={number} aria-hidden="true" />}
              <span className="cbText">{lineTokens
                ? lineTokens.map((token, index) => <span key={index} style={{ color: token.color, fontStyle: token.fontStyle && token.fontStyle & 1 ? "italic" : undefined, fontWeight: token.fontStyle && token.fontStyle & 2 ? 600 : undefined }}>{token.content}</span>)
                : text || "​"}</span>
            </div>;
          })}
        </div>)}
      </div>
    </div>
    <footer className="cbFooter">
      <span>{languageLabel(file.language)}</span>
      <span>{lines.length} {lines.length === 1 ? "línea" : "líneas"}</span>
      <span>{file.code.length.toLocaleString("es")} caracteres</span>
      <span className="cbEncoding">UTF-8</span>
    </footer>
  </section>;
}
