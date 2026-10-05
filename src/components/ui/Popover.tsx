import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

export interface PopoverTriggerProps {
  ref: RefObject<HTMLButtonElement | null>;
  "aria-haspopup": "dialog" | "menu";
  "aria-expanded": boolean;
  "aria-controls"?: string;
  onClick: () => void;
}

const FOCUSABLE = "input:not([disabled]), [role='menuitem'], button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

/**
 * A button with an anchored panel. It closes on a click outside, on Escape
 * (focus goes back to the button) and when focus leaves it. On phones the
 * panel is a centred modal over a dimmed page (`.popoverPanel` in code.css).
 * With `role="menu"` the arrow keys move between `[role="menuitem"]` items.
 */
export function Popover({ open, onOpenChange, trigger, label, role = "dialog", align = "start", className = "", panelClassName = "", initialFocus, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: (props: PopoverTriggerProps) => ReactNode;
  label: string;
  role?: "dialog" | "menu";
  align?: "start" | "end";
  className?: string;
  panelClassName?: string;
  /** Focused when the panel opens; otherwise its first control. */
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const change = useRef(onOpenChange);
  change.current = onOpenChange;
  /** Closed by a click elsewhere: focus stays where the person clicked. */
  const clickedAway = useRef(false);

  useEffect(() => {
    if (!open) return;
    clickedAway.current = false;
    const target = initialFocus?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panelRef.current;
    target?.focus({ preventScroll: true });
    const close = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      clickedAway.current = true;
      change.current(false);
    };
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      // Choosing an option unmounts the focused element: give focus back to the button.
      const active = document.activeElement;
      if (!clickedAway.current && (!active || active === document.body || panelRef.current?.contains(active))) {
        requestAnimationFrame(() => { if (document.activeElement === document.body || !document.activeElement) triggerRef.current?.focus({ preventScroll: true }); });
      }
    };
    // Focus moves in only when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      triggerRef.current?.focus();
      return;
    }
    if (role !== "menu" || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([aria-disabled='true'])") ?? [])];
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
    items[next].focus();
  }

  return <div
    className={`popover${className ? ` ${className}` : ""}`}
    ref={rootRef}
    onKeyDown={onKeyDown}
    onBlur={(event) => { if (open && event.relatedTarget && !rootRef.current?.contains(event.relatedTarget as Node)) onOpenChange(false); }}
  >
    {trigger({ ref: triggerRef, "aria-haspopup": role, "aria-expanded": open, "aria-controls": open ? id : undefined, onClick: () => onOpenChange(!open) })}
    {open && <div
      ref={panelRef}
      id={id}
      className={`popoverPanel is-${align}${panelClassName ? ` ${panelClassName}` : ""}`}
      role={role}
      aria-label={label}
      tabIndex={-1}
    >{children}</div>}
  </div>;
}
