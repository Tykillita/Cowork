import { useEffect, useRef, type ReactNode } from "react";

/**
 * Side sheet on wide screens and a centred modal on phones, on top of a native
 * modal `<dialog>`: focus stays inside, Escape closes and the page behind is
 * inert. The task drawer and its skeleton share it so both take the same box.
 */
export function Drawer({ label, onClose, busy = false, className = "", children }: {
  label: string;
  onClose: () => void;
  busy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    const cancel = (event: Event) => { event.preventDefault(); closeRef.current(); };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      if (dialog.open) dialog.close();
      // Back to whatever opened it, if it is still on the page.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return <dialog
    ref={ref}
    className={`drawer ${className}`.trim()}
    aria-label={label}
    aria-busy={busy || undefined}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div className="drawerBody">{children}</div>
  </dialog>;
}
