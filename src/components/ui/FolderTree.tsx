import { Children, createContext, isValidElement, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import "./FolderTree.css";

/**
 * Folder tree with the same compound API as ScrollX UI's FolderTree:
 *
 *   <FolderTree.Root defaultExpanded={["src"]} defaultSelected="src/App.tsx">
 *     <FolderTree.Item id="src" label="src">
 *       <FolderTree.Content>
 *         <FolderTree.Item id="src/App.tsx" label="App.tsx" badge="M" />
 *       </FolderTree.Content>
 *     </FolderTree.Item>
 *   </FolderTree.Root>
 *
 * It follows the ARIA tree pattern: one tab stop, arrow keys, Home/End,
 * Enter/Space, "*" to open sibling folders and type-ahead. Only open folders
 * render their content, so large trees stay light.
 */

type TreeState = {
  expanded: ReadonlySet<string>;
  selected: string | null;
  focused: string | null;
  toggle: (id: string, open?: boolean) => void;
  select: (id: string) => void;
  focus: (id: string) => void;
};

const TreeContext = createContext<TreeState | null>(null);
const LevelContext = createContext(1);

function useTree() {
  const tree = useContext(TreeContext);
  if (!tree) throw new Error("FolderTree.Item debe estar dentro de FolderTree.Root.");
  return tree;
}

function Root({
  children, className = "", defaultExpanded = [], defaultSelected = null, expanded: expandedProp, onExpandedChange, selected: selectedProp, onSelect, onExpand, "aria-label": label = "Archivos",
}: {
  children: ReactNode;
  className?: string;
  defaultExpanded?: string[];
  defaultSelected?: string | null;
  /** Controlled open folders. */
  expanded?: string[];
  onExpandedChange?: (expanded: string[]) => void;
  /** Controlled selection. */
  selected?: string | null;
  onSelect?: (id: string) => void;
  /** A folder was opened (for loading its content on demand). */
  onExpand?: (id: string) => void;
  "aria-label"?: string;
}) {
  const [ownExpanded, setOwnExpanded] = useState<string[]>(defaultExpanded);
  const [ownSelected, setOwnSelected] = useState<string | null>(defaultSelected);
  const [focused, setFocused] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  const expandedList = expandedProp ?? ownExpanded;
  const expanded = new Set(expandedList);
  const selected = selectedProp !== undefined ? selectedProp : ownSelected;

  const setExpanded = useCallback((next: string[]) => {
    if (expandedProp === undefined) setOwnExpanded(next);
    onExpandedChange?.(next);
  }, [expandedProp, onExpandedChange]);

  const toggle = (id: string, open?: boolean) => {
    const isOpen = expanded.has(id);
    const shouldOpen = open ?? !isOpen;
    if (shouldOpen === isOpen) return;
    setExpanded(shouldOpen ? [...expandedList, id] : expandedList.filter((entry) => entry !== id));
    if (shouldOpen) onExpand?.(id);
  };
  const select = (id: string) => {
    if (selectedProp === undefined) setOwnSelected(id);
    onSelect?.(id);
  };

  // Exactly one item is reachable with Tab: the focused one, else the selected one, else the first.
  useLayoutEffect(() => {
    const items = [...(rootRef.current?.querySelectorAll<HTMLElement>("[role=treeitem]") ?? [])];
    const stop = items.find((item) => item.dataset.id === focused) ?? items.find((item) => item.dataset.id === selected) ?? items[0];
    for (const item of items) item.tabIndex = item === stop ? 0 : -1;
  });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = (event.target as HTMLElement).closest<HTMLElement>("[role=treeitem]");
    if (!current || !rootRef.current) return;
    const items = [...rootRef.current.querySelectorAll<HTMLElement>("[role=treeitem]")];
    const index = items.indexOf(current);
    const id = current.dataset.id!;
    const isFolder = current.hasAttribute("aria-expanded");
    const isOpen = current.getAttribute("aria-expanded") === "true";
    const move = (target: HTMLElement | undefined) => { if (target) { event.preventDefault(); target.focus(); } };
    switch (event.key) {
      case "ArrowDown": move(items[index + 1]); return;
      case "ArrowUp": move(items[index - 1]); return;
      case "Home": move(items[0]); return;
      case "End": move(items[items.length - 1]); return;
      case "ArrowRight":
        event.preventDefault();
        if (isFolder && !isOpen) toggle(id, true);
        else if (isFolder && isOpen) current.querySelector<HTMLElement>("[role=group] > [role=treeitem]")?.focus();
        return;
      case "ArrowLeft":
        event.preventDefault();
        if (isFolder && isOpen) toggle(id, false);
        else current.parentElement?.closest<HTMLElement>("[role=treeitem]")?.focus();
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (isFolder) toggle(id);
        select(id);
        return;
      case "*": {
        event.preventDefault();
        const siblings = [...(current.parentElement?.children ?? [])].filter((node): node is HTMLElement => node instanceof HTMLElement && node.getAttribute("aria-expanded") === "false");
        const ids = siblings.map((node) => node.dataset.id!).filter((entry) => !expanded.has(entry));
        if (ids.length) { setExpanded([...expandedList, ...ids]); ids.forEach((entry) => onExpand?.(entry)); }
        return;
      }
      default:
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        // Type-ahead: jump to the next visible item whose name starts with what was typed.
        const now = Date.now();
        typeahead.current = { text: (now - typeahead.current.at < 500 ? typeahead.current.text : "") + event.key.toLowerCase(), at: now };
        const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)];
        const match = ordered.find((item) => (item.dataset.label ?? "").toLowerCase().startsWith(typeahead.current.text));
        if (match) { event.preventDefault(); match.focus(); }
    }
  }

  return <TreeContext.Provider value={{ expanded, selected, focused, toggle, select, focus: setFocused }}>
    <div ref={rootRef} className={`folderTree ${className}`.trim()} role="tree" aria-label={label} onKeyDown={onKeyDown}>{children}</div>
  </TreeContext.Provider>;
}

function Content({ children }: { children: ReactNode }) {
  return <div role="group" className="ftGroup">{children}</div>;
}

const FolderIcon = ({ open }: { open: boolean }) => open
  ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5V10H7.2a1.5 1.5 0 0 0-1.43 1.05L3.5 18V7.5Z" /><path d="M5.8 11h15.7l-2.4 7H3.5l2.3-7Z" /></svg>
  : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" /></svg>;
const FileIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h6.5L18 8v12.5H7z" /><path d="M13 3.5V8h5" /></svg>;

const BADGE_LABEL: Record<string, string> = { A: "añadido", M: "modificado", D: "eliminado", R: "renombrado", P: "pendiente de revisión", X: "rechazado en la revisión" };

function Item({ id, label, kind, badge, icon, children }: {
  id: string;
  label: string;
  /** Inferred from having a `FolderTree.Content`, unless given. */
  kind?: "folder" | "file";
  /** A change letter (A, M, D, R) or a count. */
  badge?: string | number;
  /** Custom icon (for example a language logo); a function receives whether the folder is open. */
  icon?: ReactNode | ((open: boolean) => ReactNode);
  children?: ReactNode;
}) {
  const tree = useTree();
  const level = useContext(LevelContext);
  const content = Children.toArray(children).find((child) => isValidElement(child) && child.type === Content);
  const isFolder = (kind ?? (content ? "folder" : "file")) === "folder";
  const open = isFolder && tree.expanded.has(id);
  const selected = tree.selected === id;
  const badgeText = badge === undefined || badge === "" || badge === 0 ? null : String(badge);
  const badgeLabel = badgeText && BADGE_LABEL[badgeText] ? `, ${BADGE_LABEL[badgeText]}` : badgeText ? `, ${badgeText} cambios` : "";

  return <div
    role="treeitem"
    className={`ftItem${selected ? " isSelected" : ""}`}
    data-id={id}
    data-label={label}
    aria-level={level}
    aria-expanded={isFolder ? open : undefined}
    aria-selected={selected}
    aria-label={`${label}${badgeLabel}`}
    tabIndex={-1}
    onFocus={(event) => { if (event.target === event.currentTarget) tree.focus(id); }}
  >
    <div
      className="ftRow"
      style={{ paddingLeft: `${8 + (level - 1) * 16}px` }}
      onClick={() => { if (isFolder) tree.toggle(id); tree.select(id); }}
    >
      <span className={`ftChevron${open ? " isOpen" : ""}`} aria-hidden="true">{isFolder && <svg viewBox="0 0 16 16"><path d="m6 4 4 4-4 4" /></svg>}</span>
      <span className={`ftIcon${isFolder ? " isFolder" : ""}${icon ? " isCustom" : ""}`}>{icon ? (typeof icon === "function" ? icon(open) : icon) : isFolder ? <FolderIcon open={open} /> : <FileIcon />}</span>
      <span className="ftLabel">{label}</span>
      {badgeText && <span className="ftBadge" data-badge={/^[AMDRPX]$/.test(badgeText) ? badgeText : "count"} aria-hidden="true">{badgeText}</span>}
    </div>
    {open && content && <LevelContext.Provider value={level + 1}>{content}</LevelContext.Provider>}
  </div>;
}

/** Scrolls the selected item into view when the selection changes from outside (a deep link). */
function useRevealSelected(rootSelector: string, selected: string | null) {
  useEffect(() => {
    if (!selected) return;
    document.querySelector(`${rootSelector} [role=treeitem][data-id="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [rootSelector, selected]);
}

export const FolderTree = { Root, Item, Content, useRevealSelected };
export default FolderTree;
