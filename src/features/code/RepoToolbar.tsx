import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import type { GitHubBranch, GitHubTag } from "../../types";
import { Popover } from "../../components/ui/Popover";
import { Sk } from "../../components/Skeleton";
import { cloneUrls, fuzzyFindFiles, type CloneKind, type FileMatch } from "./repoTree";
import { fileIconId, iconUrl, type IconTheme } from "./fileIcons";
import { GitHubMark, RepoIcon } from "./repoIcons";

export type RefTab = "branches" | "tags";

export interface RepoToolbarProps {
  repoPath: string;
  /** Branch, tag or commit being shown. */
  current: string;
  defaultBranch: string;
  branches: GitHubBranch[];
  branchesReady: boolean;
  branchesTruncated: boolean;
  tags: GitHubTag[];
  tagsReady: boolean;
  tagsTruncated: boolean;
  /** Every file path known for `current`. */
  files: string[];
  filesReady: boolean;
  /** Large repository: only the folders opened so far are searchable. */
  filesPartial: boolean;
  icons: IconTheme | null;
  /** Open file, for "Abrir en GitHub". */
  filePath: string;
  refreshing: boolean;
  /** Extra chips after the counts (pending files). */
  extra?: ReactNode;
  onRefChange: (ref: string) => void;
  onOpenFile: (path: string) => void;
  onRefresh: () => void;
  onCreateFile: () => void;
  onUploadFiles: (files: File[]) => void;
  onOpenFiles: () => void;
  filesDialogOpen: boolean;
  filesTriggerRef: RefObject<HTMLButtonElement | null>;
}

function countWords(count: number, truncated: boolean, one: string, many: string) {
  return truncated ? `${count} o más ${many}` : `${count} ${count === 1 ? one : many}`;
}

/** The bar above the tree and the file, laid out like GitHub's repository header. */
export function RepoToolbar(props: RepoToolbarProps) {
  const { current, branches, branchesReady, branchesTruncated, tags, tagsReady, tagsTruncated } = props;
  const [picker, setPicker] = useState<{ open: boolean; tab: RefTab }>({ open: false, tab: "branches" });
  const refKind = !branches.some((branch) => branch.name === current) && tags.some((tag) => tag.name === current) ? "tag" : "branch";
  const countLabel = (count: number, truncated: boolean, one: string, many: string) => <><b>{count}{truncated ? "+" : ""}</b><span className="repoCountLabel">{count === 1 && !truncated ? one : many}</span></>;

  return <div className="repoToolbar">
    <div className="repoToolbarRefs">
      <RefPicker {...props} open={picker.open} tab={picker.tab} refKind={refKind}
        onOpenChange={(open) => setPicker((state) => ({ ...state, open }))}
        onTab={(tab) => setPicker((state) => ({ ...state, tab }))} />
      {branchesReady
        ? <a className="repoCount repoBranches" href="#branches-page" title={`${countWords(branches.length, branchesTruncated, "rama", "ramas")}. Ver ramas`} aria-label={`${countWords(branches.length, branchesTruncated, "rama", "ramas")}. Ver ramas`}><RepoIcon name="branch" />{countLabel(branches.length, branchesTruncated, "rama", "ramas")}</a>
        : <span className="repoCount repoBranches"><RepoIcon name="branch" /><Sk w={44} /></span>}
      {tagsReady
        ? <button className="repoCount repoTags" type="button" title={`${countWords(tags.length, tagsTruncated, "etiqueta", "etiquetas")}. Ver etiquetas`} aria-label={`${countWords(tags.length, tagsTruncated, "etiqueta", "etiquetas")}. Ver etiquetas`} onClick={() => setPicker({ open: true, tab: "tags" })}><RepoIcon name="tag" />{countLabel(tags.length, tagsTruncated, "etiqueta", "etiquetas")}</button>
        : <span className="repoCount repoTags"><RepoIcon name="tag" /><Sk w={56} /></span>}
      {props.extra}
    </div>
    <div className="repoToolbarActions">
      <FileFinder files={props.files} ready={props.filesReady} partial={props.filesPartial} icons={props.icons} onOpen={props.onOpenFile} onCompactOpen={props.onOpenFiles} />
      <button ref={props.filesTriggerRef} className="repoButton repoFindTrigger" type="button" aria-haspopup="dialog" aria-expanded={props.filesDialogOpen} aria-controls={props.filesDialogOpen ? "repo-files-dialog" : undefined} aria-keyshortcuts="t" onClick={props.onOpenFiles}>Ir a archivo</button>
      <AddFileMenu onCreate={props.onCreateFile} onUpload={props.onUploadFiles} />
      <button className={`repoIconButton repoRefresh${props.refreshing ? " isSpinning" : ""}`} type="button" aria-label="Actualizar repositorio" title="Actualizar" onClick={props.onRefresh} disabled={props.refreshing}><RepoIcon name="refresh" /></button>
      <CloneMenu repoPath={props.repoPath} current={current} refKind={refKind} filePath={props.filePath} />
    </div>
  </div>;
}

export function RefPicker({ current, defaultBranch, branches, branchesReady, branchesTruncated, tags, tagsReady, tagsTruncated, open, tab, refKind, onOpenChange, onTab, onRefChange }: RepoToolbarProps & {
  open: boolean;
  tab: RefTab;
  refKind: "branch" | "tag";
  onOpenChange: (open: boolean) => void;
  onTab: (tab: RefTab) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const names = useMemo(() => {
    const all = tab === "branches" ? branches.map((branch) => branch.name) : tags.map((item) => item.name);
    // The default branch leads the list, like on GitHub.
    const ordered = tab === "branches" && all.includes(defaultBranch) ? [defaultBranch, ...all.filter((name) => name !== defaultBranch)] : all;
    const needle = query.trim().toLowerCase();
    return needle ? ordered.filter((name) => name.toLowerCase().includes(needle)) : ordered;
  }, [branches, defaultBranch, query, tab, tags]);
  const shown = names.slice(0, 100);
  const ready = tab === "branches" ? branchesReady : tagsReady;
  const truncated = tab === "branches" ? branchesTruncated : tagsTruncated;

  useEffect(() => { if (open) { setQuery(""); setActive(0); } }, [open]);
  useEffect(() => setActive(0), [query, tab]);
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId, open]);

  function choose(name: string) {
    onOpenChange(false);
    if (name !== current) onRefChange(name);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(value + 1, shown.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
    else if (event.key === "Enter" && shown[active]) { event.preventDefault(); choose(shown[active]); }
  }

  const kindLabel = refKind === "tag" ? "Etiqueta" : "Rama";
  return <Popover
    className="repoPicker"
    panelClassName="repoPickerPanel"
    open={open}
    onOpenChange={onOpenChange}
    label="Cambiar rama o etiqueta"
    initialFocus={inputRef}
    trigger={(trigger) => <button {...trigger} className="repoRefButton" type="button" disabled={!branchesReady} title={current} aria-label={`${kindLabel}: ${current || "ninguna"}. Cambiar rama o etiqueta`}>
      <RepoIcon name={refKind === "tag" ? "tag" : "branch"} />
      <span className="repoRefName">{branchesReady ? current : <Sk w={72} />}</span>
      <RepoIcon name="caret" className="repoCaret" />
    </button>}
  >
    <header className="repoPopHead"><strong>Cambiar rama o etiqueta</strong></header>
    <div className="repoPopSearch">
      <RepoIcon name="search" />
      <input ref={inputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKeyDown}
        placeholder={tab === "branches" ? "Buscar rama" : "Buscar etiqueta"} aria-label={tab === "branches" ? "Buscar rama" : "Buscar etiqueta"}
        role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={shown.length ? `${listId}-${active}` : undefined} autoComplete="off" spellCheck={false} />
    </div>
    <div className="repoTabs" role="tablist" aria-label="Tipo de referencia">
      {(["branches", "tags"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} className="repoTab" onClick={() => { onTab(value); inputRef.current?.focus(); }}>
        {value === "branches" ? "Ramas" : "Etiquetas"}
      </button>)}
    </div>
    <div className="repoRefList" id={listId} role="listbox" aria-label={tab === "branches" ? "Ramas" : "Etiquetas"}>
      {!ready ? <div className="repoRefSkeleton" aria-hidden="true">{[96, 72, 120, 84].map((width) => <span className="repoRefOption" key={width}><span className="repoCheck" /><Sk w={width} /></span>)}</div>
        : shown.map((name, index) => <div key={name} id={`${listId}-${index}`} role="option" aria-selected={name === current}
          className={`repoRefOption${index === active ? " isActive" : ""}`}
          onPointerDown={(event) => event.preventDefault()} onPointerMove={() => setActive(index)} onClick={() => choose(name)}>
          <span className="repoCheck">{name === current && <RepoIcon name="check" />}</span>
          <span className="repoRefOptionName">{name}</span>
          {tab === "branches" && name === defaultBranch && <span className="repoDefault">principal</span>}
        </div>)}
      {ready && !shown.length && <p className="repoPopEmpty">{query.trim() ? `Ninguna ${tab === "branches" ? "rama" : "etiqueta"} coincide con «${query.trim()}».` : tab === "branches" ? "El repositorio no tiene ramas." : "El repositorio no tiene etiquetas."}</p>}
    </div>
    {ready && (names.length > shown.length || truncated) && <p className="repoPopNote">{names.length > shown.length ? `Se muestran ${shown.length} de ${names.length}; escribe para afinar.` : "Hay más de las que se leyeron de GitHub."}</p>}
    {tab === "branches" && <footer className="repoPopFoot"><a href="#branches-page" onClick={() => onOpenChange(false)}>Ver todas las ramas</a></footer>}
  </Popover>;
}

/** "src/App.tsx" with the matched letters in bold. */
function Highlighted({ match }: { match: FileMatch }) {
  const marked = new Set(match.indices);
  const parts: ReactNode[] = [];
  let run = "";
  let bold = false;
  const flush = (key: number) => { if (run) parts.push(bold ? <b key={key}>{run}</b> : <span key={key}>{run}</span>); run = ""; };
  [...match.path].forEach((character, index) => {
    if (marked.has(index) !== bold) { flush(index); bold = !bold; }
    run += character;
  });
  flush(match.path.length);
  return <>{parts}</>;
}

export function FileFinder({ files, ready, partial, icons, onOpen, onCompactOpen, mode = "toolbar", searchRef, children }: {
  files: string[]; ready: boolean; partial: boolean; icons: IconTheme | null; onOpen: (path: string) => void;
  onCompactOpen?: () => void;
  mode?: "toolbar" | "dialog";
  searchRef?: RefObject<HTMLInputElement | null>;
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const ownInputRef = useRef<HTMLInputElement>(null);
  const inputRef = searchRef ?? ownInputRef;
  const listId = useId();
  const matches = useMemo(() => fuzzyFindFiles(files, query, 20), [files, query]);
  const open = (mode === "dialog" || focused) && Boolean(query.trim());

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId, open]);

  // "t" anywhere on the page jumps here, as on GitHub, unless the person is typing.
  useEffect(() => {
    if (mode === "dialog") {
      if (ready) inputRef.current?.focus({ preventScroll: true });
      return;
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "t" || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu'], dialog")) return;
      if (document.querySelector("dialog[open]")) return;
      if (window.matchMedia("(max-width: 800px)").matches && onCompactOpen) {
        event.preventDefault();
        onCompactOpen();
        return;
      }
      if (!inputRef.current || inputRef.current.disabled) return;
      event.preventDefault();
      inputRef.current.focus();
      inputRef.current.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [inputRef, mode, onCompactOpen, ready]);

  function choose(match: FileMatch | undefined) {
    if (!match) return;
    setQuery("");
    inputRef.current?.blur();
    onOpen(match.path);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(value + 1, matches.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
    else if (event.key === "Enter") { event.preventDefault(); choose(matches[active]); }
    else if (event.key === "Escape" && (query || mode === "toolbar")) {
      event.preventDefault();
      event.stopPropagation();
      if (query) setQuery(""); else inputRef.current?.blur();
    }
  }

  const results = open && <div className="repoFindResults" id={listId} role="listbox" aria-label="Archivos encontrados">
    {matches.map((match, index) => <div key={match.path} id={`${listId}-${index}`} role="option" aria-selected={index === active}
      className={`repoFindOption${index === active ? " isActive" : ""}`}
      onPointerDown={(event) => event.preventDefault()} onPointerMove={() => setActive(index)} onClick={() => choose(match)}>
      {icons ? <img src={iconUrl(fileIconId(match.path.slice(match.path.lastIndexOf("/") + 1), icons))} alt="" width={16} height={16} decoding="async" /> : <RepoIcon name="filePlus" />}
      <span className="repoFindPath"><Highlighted match={match} /></span>
    </div>)}
    {!matches.length && <p className="repoPopEmpty">Ningún archivo coincide con «{query.trim()}».</p>}
    {partial && <p className="repoPopNote">Repositorio grande: solo se busca en las carpetas ya abiertas.</p>}
  </div>;

  return <div className={`repoFind${mode === "dialog" ? " repoFilesFinder" : ""}${open ? " isOpen" : ""}`}>
    <div className="repoFindField">
      <RepoIcon name="search" />
      <input ref={inputRef} type="text" value={query} disabled={!ready}
        onChange={(event) => setQuery(event.target.value)} onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder="Ir a archivo" aria-label="Ir a archivo" aria-keyshortcuts="t"
        role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-activedescendant={open && matches.length ? `${listId}-${active}` : undefined}
        autoComplete="off" spellCheck={false} />
      <kbd className="repoFindKey" aria-hidden="true">T</kbd>
    </div>
    {mode === "dialog" ? <div className="repoFilesContent">{open ? results : children}</div> : results}
  </div>;
}

export function AddFileMenu({ onCreate, onUpload }: { onCreate: () => void; onUpload: (files: File[]) => void }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  return <>
    <Popover className="repoAdd" open={open} onOpenChange={setOpen} role="menu" align="end" label="Añadir archivo"
      trigger={(trigger) => <button {...trigger} className="repoButton repoAddButton" type="button" aria-label="Añadir archivo" title="Añadir archivo">
        <RepoIcon name="plus" /><span className="repoButtonLabel">Añadir archivo</span><RepoIcon name="caret" className="repoCaret" />
      </button>}>
      <button type="button" role="menuitem" className="repoMenuItem" onClick={() => { setOpen(false); onCreate(); }}>
        <RepoIcon name="filePlus" /><span><b>Crear archivo nuevo</b><small>Queda pendiente de revisión antes de subirse.</small></span>
      </button>
      <button type="button" role="menuitem" className="repoMenuItem" onClick={() => { setOpen(false); fileRef.current?.click(); }}>
        <RepoIcon name="upload" /><span><b>Subir archivos</b><small>Hasta 650 KB cada uno; también pendientes de revisión.</small></span>
      </button>
    </Popover>
    <input ref={fileRef} className="visuallyHidden" type="file" multiple tabIndex={-1} aria-hidden="true"
      onChange={(event) => { const picked = [...(event.target.files ?? [])]; event.target.value = ""; if (picked.length) onUpload(picked); }} />
  </>;
}

const CLONE_KEY = "cowork.clone-kind";
const CLONE_TABS: { kind: CloneKind; label: string; hint: string }[] = [
  { kind: "https", label: "HTTPS", hint: "Clona con Git usando la dirección web." },
  { kind: "ssh", label: "SSH", hint: "Usa una clave SSH vinculada a tu cuenta de GitHub." },
  { kind: "cli", label: "GitHub CLI", hint: "Trabaja desde la terminal con la CLI oficial de GitHub." },
];

function readCloneKind(): CloneKind {
  try {
    const value = localStorage.getItem(CLONE_KEY);
    return value === "ssh" || value === "cli" ? value : "https";
  } catch {
    return "https";
  }
}

async function copyText(text: string, field: HTMLInputElement | null) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    field?.select();
    return document.execCommand?.("copy") ?? false;
  }
}

function CloneMenu({ repoPath, current, refKind, filePath }: { repoPath: string; current: string; refKind: "branch" | "tag"; filePath: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CloneKind>(readCloneKind);
  const [copied, setCopied] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  const urls = cloneUrls(repoPath, current, refKind, filePath);
  const tab = CLONE_TABS.find((item) => item.kind === kind)!;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  function pick(next: CloneKind) {
    setKind(next);
    setCopied(false);
    try { localStorage.setItem(CLONE_KEY, next); } catch { /* the choice just is not remembered */ }
  }

  return <Popover className="repoCode" open={open} onOpenChange={setOpen} align="end" label="Clonar o descargar" panelClassName="repoCodePanel"
    trigger={(trigger) => <button {...trigger} className="repoButton repoCodeButton" type="button">
      <RepoIcon name="code" /><span>Código</span><RepoIcon name="caret" className="repoCaret" />
    </button>}>
    <header className="repoPopHead"><RepoIcon name="terminal" /><strong>Clonar</strong></header>
    <div className="repoTabs" role="tablist" aria-label="Forma de clonar">
      {CLONE_TABS.map((item) => <button key={item.kind} type="button" role="tab" aria-selected={item.kind === kind} className="repoTab" onClick={() => pick(item.kind)}>{item.label}</button>)}
    </div>
    <div className="repoCloneField">
      <input ref={fieldRef} readOnly value={urls[kind]} aria-label={`Comando para clonar (${tab.label})`} onFocus={(event) => event.target.select()} spellCheck={false} />
      <button className="repoIconButton" type="button" aria-label={copied ? "Copiado" : "Copiar"} title="Copiar" onClick={() => void copyText(urls[kind], fieldRef.current).then(setCopied)}>
        <RepoIcon name={copied ? "check" : "copy"} />
      </button>
    </div>
    <p className="repoCloneHint">{tab.hint}</p>
    <p className="visuallyHidden" role="status">{copied ? "Copiado en el portapapeles" : ""}</p>
    <div className="repoCodeLinks">
      {urls.zip && <a className="repoMenuItem" href={urls.zip} target="_blank" rel="noreferrer"><RepoIcon name="download" /><span><b>Descargar ZIP</b><small>{refKind === "tag" ? "Etiqueta" : "Rama"} <code>{current}</code></small></span></a>}
      <a className="repoMenuItem" href={urls.web} target="_blank" rel="noreferrer"><GitHubMark /><span><b>Abrir en GitHub</b><small>{filePath ? filePath : "Repositorio en esta rama"}</small></span></a>
    </div>
  </Popover>;
}
