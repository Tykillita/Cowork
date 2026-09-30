import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Avatar } from "../../components/Avatar";
import type { AssigneeView } from "../milestones/milestoneModel";
import type { TeamDirectoryEntry } from "../../types";

type Option = { uid: string; name: string; photoURL: string };

/**
 * Menu button listing active members plus "Sin asignar". Arrow keys move,
 * Enter/Space choose, Escape closes and returns focus to the button.
 */
export function AssigneeMenu({ current, members, disabled, onChoose, label }: {
  current: AssigneeView;
  members: TeamDirectoryEntry[];
  disabled?: boolean;
  onChoose: (member: Option | null) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const options: (Option | null)[] = [null, ...members.filter((member) => member.active).map(({ uid, name, photoURL }) => ({ uid, name, photoURL }))];

  useEffect(() => {
    if (!open) return;
    optionRefs.current[active]?.focus();
  }, [active, open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function openMenu() {
    const selected = current.kind === "member" ? options.findIndex((option) => option?.uid === current.uid) : 0;
    setActive(Math.max(0, selected));
    setOpen(true);
  }

  function choose(option: Option | null) {
    setOpen(false);
    buttonRef.current?.focus();
    onChoose(option);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); buttonRef.current?.focus(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => (value + 1) % options.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => (value - 1 + options.length) % options.length); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(options.length - 1); }
    else if (event.key === "Tab") setOpen(false);
  }

  const chipLabel = current.kind === "none" ? "Sin asignar" : current.kind === "left" ? `${current.label} · Miembro sin acceso` : current.kind === "review" ? `${current.label} · por revisar` : current.label;

  return (
    <div className="assigneeMenu" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className={`assigneeButton is-${current.kind}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${label}: ${chipLabel}. Cambiar responsable`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => { if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); openMenu(); } }}
      >
        {current.kind === "member" ? <Avatar name={current.label} photoURL={current.photoURL} size={20} /> : <Avatar name={current.kind === "none" ? "?" : current.label} size={20} muted />}
        <span>{chipLabel}</span>
        <span className="assigneeCaret" aria-hidden="true">▾</span>
      </button>
      {open && <div className="assigneeOptions" id={menuId} role="menu" aria-label="Elegir responsable">
        {options.map((option, index) => (
          <button
            key={option?.uid ?? "none"}
            ref={(node) => { optionRefs.current[index] = node; }}
            type="button"
            role="menuitemradio"
            aria-checked={option ? current.kind === "member" && current.uid === option.uid : current.kind === "none"}
            tabIndex={index === active ? 0 : -1}
            className="assigneeOption"
            onClick={() => choose(option)}
            onFocus={() => setActive(index)}
          >
            {option ? <Avatar name={option.name} photoURL={option.photoURL} size={22} /> : <Avatar name="?" size={22} muted />}
            <span>{option ? option.name : "Sin asignar"}</span>
          </button>
        ))}
        {options.length === 1 && <p className="assigneeEmpty">Todavía no hay otros miembros en el directorio del equipo.</p>}
      </div>}
    </div>
  );
}
