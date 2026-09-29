import { useEffect, useRef, useState } from "react";
import type { Project } from "../../types";
import { moveInOrder, personalOrder } from "./projectListing";

/** "Mi orden": accessible up/down controls that work with keyboard, pointer and touch. */
export function ProjectOrderEditor({ projects, order, favorites, onChange, onClose }: {
  projects: Project[];
  order: string[];
  favorites: string[];
  onChange: (order: string[]) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState(() => personalOrder(projects, order));
  const [announcement, setAnnouncement] = useState("");
  const byId = new Map(projects.map((project) => [project.id, project]));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function move(id: string, offset: -1 | 1) {
    const next = moveInOrder(current, id, offset);
    if (next === current) return;
    setCurrent(next);
    onChange(next);
    setAnnouncement(`${byId.get(id)?.name ?? "Proyecto"} ahora está en la posición ${next.indexOf(id) + 1} de ${next.length}.`);
  }

  function close() {
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  }

  return (
    <dialog ref={dialogRef} className="projectCreateCard projectCreateDialog projectOrderDialog" aria-labelledby="project-order-title" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="projectCreateHeading">
        <div><p className="eyebrow">MI ORDEN</p><h2 id="project-order-title">Ordenar proyectos</h2></div>
        <button className="plain" type="button" onClick={close}>Listo</button>
      </div>
      <p className="projectCreateHint">Usa las flechas para mover cada proyecto. Los favoritos se muestran siempre primero; este orden se guarda en tu cuenta.</p>
      <ol className="projectOrderList">
        {current.map((id, index) => {
          const project = byId.get(id);
          if (!project) return null;
          return (
            <li key={id} className="projectOrderItem">
              <span className="projectOrderPosition" aria-hidden="true">{index + 1}</span>
              <span className="projectOrderName">{favorites.includes(id) && <span aria-label="Favorito">★ </span>}{project.name}</span>
              <button type="button" className="plain projectOrderMove" onClick={() => move(id, -1)} disabled={index === 0} aria-label={`Subir ${project.name}`}>↑</button>
              <button type="button" className="plain projectOrderMove" onClick={() => move(id, 1)} disabled={index === current.length - 1} aria-label={`Bajar ${project.name}`}>↓</button>
            </li>
          );
        })}
      </ol>
      <p className="visuallyHidden" role="status" aria-live="polite">{announcement}</p>
    </dialog>
  );
}
