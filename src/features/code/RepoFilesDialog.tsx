import { useEffect, useRef, useState, type ReactNode } from "react";
import { RepoFilesDialogSkeleton } from "../../components/PageSkeletons";
import { AddFileMenu, FileFinder, RefPicker, type RefTab, type RepoToolbarProps } from "./RepoToolbar";
import { RepoIcon } from "./repoIcons";

/** The compact toolbar's explorer shares the page's tree and navigation state. */
export function RepoFilesDialog({ toolbar, onClose, children }: {
  toolbar: RepoToolbarProps;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [picker, setPicker] = useState<{ open: boolean; tab: RefTab }>({ open: false, tab: "branches" });
  const refKind = !toolbar.branches.some((branch) => branch.name === toolbar.current) && toolbar.tags.some((tag) => tag.name === toolbar.current) ? "tag" : "branch";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = toolbar.filesTriggerRef.current;
    dialog.showModal();
    searchRef.current?.focus({ preventScroll: true });
    const close = (event: Event) => { event.preventDefault(); closeRef.current(); };
    const wide = window.matchMedia("(min-width: 801px)");
    const resize = () => { if (wide.matches) closeRef.current(); };
    dialog.addEventListener("cancel", close);
    wide.addEventListener("change", resize);
    return () => {
      dialog.removeEventListener("cancel", close);
      wide.removeEventListener("change", resize);
      if (dialog.open) dialog.close();
      if (opener?.isConnected && opener.getClientRects().length) opener.focus({ preventScroll: true });
      else document.querySelector<HTMLInputElement>(".repoToolbar .repoFind input")?.focus({ preventScroll: true });
    };
  }, [toolbar.filesTriggerRef]);

  return <dialog ref={dialogRef} id="repo-files-dialog" className="repoFilesDialog" aria-label="Archivos" onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]")]
      .filter((node) => node.tabIndex >= 0 && !node.hasAttribute("disabled") && node.getClientRects().length);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
  }}>
    <header className="repoFilesHeader">
      <h2>Archivos</h2>
      <button className="repoIconButton" type="button" aria-label="Cerrar archivos" title="Cerrar" onClick={onClose}><RepoIcon name="close" /></button>
    </header>
    {!toolbar.branchesReady ? <RepoFilesDialogSkeleton /> : <>
      <div className="repoFilesControls">
        <RefPicker {...toolbar} open={picker.open} tab={picker.tab} refKind={refKind}
          onOpenChange={(open) => setPicker((state) => ({ ...state, open }))}
          onTab={(tab) => setPicker((state) => ({ ...state, tab }))} />
        <AddFileMenu onCreate={() => { onClose(); toolbar.onCreateFile(); }} onUpload={(files) => { onClose(); toolbar.onUploadFiles(files); }} />
        <button className="repoIconButton" type="button" aria-label="Enfocar búsqueda de archivos" title="Buscar archivo" disabled={!toolbar.filesReady} onClick={() => searchRef.current?.focus()}><RepoIcon name="search" /></button>
      </div>
      <FileFinder key={toolbar.current} files={toolbar.files} ready={toolbar.filesReady} partial={toolbar.filesPartial} icons={toolbar.icons}
        mode="dialog" searchRef={searchRef} onOpen={(path) => { onClose(); toolbar.onOpenFile(path); }}>
        {children}
      </FileFinder>
    </>}
  </dialog>;
}
