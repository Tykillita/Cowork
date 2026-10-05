import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { TASK_STATUSES, type Task, type TaskStatus } from "../../types";
import { moveCard, type BoardPosition } from "./taskFilters";
import { TaskChips } from "./TaskChips";
import { TaskAssignee, TaskItemError, TaskStatusSelect, type TaskItemActions } from "./TaskItemParts";

type Lift =
  | { mode: "keyboard"; id: string; at: BoardPosition }
  | { mode: "pointer"; id: string; at: BoardPosition; left: number; top: number; width: number };

type PointerDrag = { id: string; pointerId: number; startX: number; startY: number; started: boolean; element: HTMLElement; frame: number };

const INTERACTIVE = "button, select, a, input, textarea, [role=menu]";

function positionLabel(columns: Record<TaskStatus, Task[]>, at: BoardPosition, liftedId: string) {
  const status = TASK_STATUSES[at.column];
  const size = columns[status].filter((task) => task.id !== liftedId).length + 1;
  return `${status}, posición ${at.index + 1} de ${size}`;
}

/**
 * Three status columns. A card moves by dragging it (mouse anywhere on the
 * card, touch on its handle), with the keyboard from the handle (Space to
 * lift, arrows to move, Space to drop, Escape to cancel), or with its status
 * select, which works everywhere and opens as a modal on phones.
 */
export function KanbanView({ columns, actions, onMove }: {
  columns: Record<TaskStatus, Task[]>;
  actions: TaskItemActions;
  /** `index` counts the target column without the moved task. */
  onMove: (task: Task, status: TaskStatus, index: number) => void;
}) {
  const [lift, setLift] = useState<Lift | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const dragRef = useRef<PointerDrag | null>(null);
  const liftRef = useRef<Lift | null>(null);
  liftRef.current = lift;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const rootRef = useRef<HTMLDivElement>(null);

  const all = TASK_STATUSES.flatMap((status) => columns[status]);
  const find = (id: string) => all.find((task) => task.id === id) ?? null;
  const originOf = (id: string): BoardPosition => {
    const column = TASK_STATUSES.findIndex((status) => columns[status].some((task) => task.id === id));
    return { column, index: columns[TASK_STATUSES[column]].findIndex((task) => task.id === id) };
  };
  const sizesWithout = (id: string) => TASK_STATUSES.map((status) => columns[status].filter((task) => task.id !== id).length);

  function drop(id: string, at: BoardPosition) {
    const task = find(id);
    setLift(null);
    if (!task) return;
    const origin = originOf(id);
    if (origin.column === at.column && origin.index === at.index) { setAnnouncement(`«${task.title}» vuelve a su lugar.`); return; }
    setAnnouncement(`«${task.title}» soltada en ${positionLabel(columns, at, id)}.`);
    onMove(task, TASK_STATUSES[at.column], at.index);
  }

  // ─── Keyboard ─────────────────────────────────────────────────────────────
  /** Returns true when the key was used (so the browser default is skipped). */
  function onHandleKey(key: string, task: Task) {
    const current = lift?.mode === "keyboard" && lift.id === task.id ? lift : null;
    if (key === " " || key === "Enter") {
      if (current) drop(task.id, current.at);
      else {
        const at = originOf(task.id);
        setLift({ mode: "keyboard", id: task.id, at });
        setAnnouncement(`«${task.title}» tomada. ${positionLabel(columns, at, task.id)}. Usa las flechas para moverla, Espacio para soltarla y Escape para cancelar.`);
      }
      return true;
    }
    if (!current) return false;
    if (key === "Escape" || key === "Tab") {
      setLift(null);
      setAnnouncement(`Movimiento cancelado. «${task.title}» sigue en ${task.status}.`);
      return key === "Escape";
    }
    const next = moveCard(current.at, key, sizesWithout(task.id));
    if (next === current.at) return false;
    setLift({ ...current, at: next });
    setAnnouncement(positionLabel(columns, next, task.id));
    return true;
  }

  // The lifted card is re-rendered in its new column: keep the focus on its handle.
  useEffect(() => {
    if (lift?.mode !== "keyboard") return;
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-task-id="${CSS.escape(lift.id)}"] .taskCardHandle`)?.focus();
  }, [lift]);

  // ─── Pointer ──────────────────────────────────────────────────────────────
  function targetAt(x: number, y: number, liftedId: string): BoardPosition | null {
    const column = document.elementsFromPoint(x, y).find((element): element is HTMLElement => element instanceof HTMLElement && Boolean(element.dataset.kanbanColumn));
    if (!column) return null;
    const index = TASK_STATUSES.indexOf(column.dataset.kanbanColumn as TaskStatus);
    const cards = [...column.querySelectorAll<HTMLElement>("[data-task-id]")].filter((card) => card.dataset.taskId !== liftedId);
    const position = cards.filter((card) => { const box = card.getBoundingClientRect(); return box.top + box.height / 2 < y; }).length;
    return { column: index, index: position };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>, task: Task) {
    if (event.button !== 0 || !actions.canEdit || actions.isBusy(task.id) || lift) return;
    const target = event.target as HTMLElement;
    const onHandle = Boolean(target.closest(".taskCardHandle"));
    if (!onHandle && (event.pointerType !== "mouse" || target.closest(INTERACTIVE))) return;
    dragRef.current = { id: task.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, started: false, element: event.currentTarget, frame: 0 };
  }

  useEffect(() => {
    function move(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.started) {
        if (Math.hypot(dx, dy) < 5) return;
        drag.started = true;
        // The lifted card leaves the flow: keep the board's height so nothing jumps under the pointer.
        if (rootRef.current) rootRef.current.style.minHeight = `${rootRef.current.offsetHeight}px`;
        const box = drag.element.getBoundingClientRect();
        const origin = TASK_STATUSES.findIndex((status) => columnsRef.current[status].some((task) => task.id === drag.id));
        const index = columnsRef.current[TASK_STATUSES[origin]].findIndex((task) => task.id === drag.id);
        setLift({ mode: "pointer", id: drag.id, at: { column: origin, index }, left: box.left, top: box.top, width: box.width });
      }
      event.preventDefault();
      cancelAnimationFrame(drag.frame);
      drag.frame = requestAnimationFrame(() => {
        drag.element.style.transform = `translate(${dx}px, ${dy}px)`;
        const at = targetAt(event.clientX, event.clientY, drag.id);
        const current = liftRef.current;
        if (at && current?.mode === "pointer" && (at.column !== current.at.column || at.index !== current.at.index)) setLift({ ...current, at });
        // Near the edges the page scrolls so long columns stay reachable.
        if (event.clientY < 56) window.scrollBy(0, -14);
        else if (event.clientY > window.innerHeight - 56) window.scrollBy(0, 14);
      });
    }
    function end(event: PointerEvent, cancelled: boolean) {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      cancelAnimationFrame(drag.frame);
      drag.element.style.transform = "";
      dragRef.current = null;
      if (rootRef.current) rootRef.current.style.minHeight = "";
      const current = liftRef.current;
      if (!drag.started || current?.mode !== "pointer") return;
      if (cancelled) { setLift(null); return; }
      // A quick release can come before the last frame ran: use where the pointer is now.
      drop(drag.id, targetAt(event.clientX, event.clientY, drag.id) ?? current.at);
    }
    const up = (event: PointerEvent) => end(event, false);
    const cancel = (event: PointerEvent) => end(event, true);
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !dragRef.current?.started) return;
      dragRef.current.element.style.transform = "";
      if (rootRef.current) rootRef.current.style.minHeight = "";
      dragRef.current = null;
      setLift(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape);
    };
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  // Keyboard: the card is shown where it would land. Pointer: it floats under
  // the pointer and a placeholder marks the landing spot.
  const layout = TASK_STATUSES.map((status, column) => {
    let items: (Task | "placeholder")[] = columns[status];
    if (lift?.mode === "keyboard") {
      const lifted = find(lift.id);
      items = columns[status].filter((task) => task.id !== lift.id);
      if (lifted && lift.at.column === column) items = [...items.slice(0, lift.at.index), lifted, ...items.slice(lift.at.index)];
    } else if (lift?.mode === "pointer" && lift.at.column === column) {
      const others = columns[status].filter((task) => task.id !== lift.id);
      const placed: (Task | "placeholder")[] = [...others.slice(0, lift.at.index), "placeholder", ...others.slice(lift.at.index)];
      const floating = columns[status].find((task) => task.id === lift.id);
      items = floating ? [...placed, floating] : placed;
    }
    return { status, items };
  });

  return <div className="kanban" ref={rootRef} role="group" aria-label="Tablero de tareas por estado" data-dragging={lift ? lift.mode : undefined}>
    {layout.map(({ status, items }) => {
      const count = columns[status].length;
      return <section className="kanbanColumn" key={status} data-kanban-column={status} data-status={status} aria-labelledby={`kanban-${status.replace(/\s/g, "-")}`}>
        <header className="kanbanColumnHead">
          <h3 id={`kanban-${status.replace(/\s/g, "-")}`}>{status}</h3>
          <span className="kanbanCount" aria-label={`${count} ${count === 1 ? "tarea" : "tareas"}`}>{count}</span>
        </header>
        <div className="kanbanList" role="list">
          {items.map((item) => item === "placeholder"
            ? <div className="taskCardPlaceholder" key="placeholder" aria-hidden="true" />
            : <TaskCard
              key={item.id}
              task={item}
              actions={actions}
              lifted={lift?.id === item.id ? lift : null}
              onPointerDown={(event) => onPointerDown(event, item)}
              onHandleKey={(key) => onHandleKey(key, item)}
              onMoveTo={(status) => onMove(item, status, columns[status].filter((task) => task.id !== item.id).length)}
            />)}
          {!count && !(lift && lift.at.column === TASK_STATUSES.indexOf(status)) && <p className="kanbanEmpty">Sin tareas</p>}
        </div>
      </section>;
    })}
    <p className="visuallyHidden" role="status" aria-live="assertive">{announcement}</p>
    <p className="visuallyHidden" id="kanban-help">Pulsa Espacio para tomar la tarjeta, las flechas para moverla, Espacio para soltarla y Escape para cancelar.</p>
  </div>;
}

function TaskCard({ task, actions, lifted, onPointerDown, onHandleKey, onMoveTo }: {
  task: Task;
  actions: TaskItemActions;
  lifted: Lift | null;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onHandleKey: (key: string) => boolean;
  onMoveTo: (status: TaskStatus) => void;
}) {
  const busy = actions.isBusy(task.id);
  const floating = lifted?.mode === "pointer" ? { position: "fixed" as const, left: lifted.left, top: lifted.top, width: lifted.width } : undefined;
  return <article
    className={`taskCard taskItem${task.status === "Hecha" ? " done" : ""}${lifted ? " isLifted" : ""}${floating ? " isFloating" : ""}`}
    id={`task-${task.id}`}
    data-task-id={task.id}
    role="listitem"
    aria-busy={busy}
    style={floating}
    onPointerDown={onPointerDown}
  >
    <div className="taskCardHead">
      <button className="taskCardTitle" type="button" onClick={() => actions.open(task)} aria-label={`Abrir la tarea ${task.title}`}><span className="t">{task.title}</span></button>
      <button
        className="taskCardHandle"
        type="button"
        aria-label={`Mover «${task.title}»`}
        aria-describedby="kanban-help"
        aria-pressed={lifted?.mode === "keyboard"}
        disabled={!actions.canEdit || busy}
        onKeyDown={(event) => { if (onHandleKey(event.key)) event.preventDefault(); }}
        // Space would also "click" on key up and drop the card it just lifted.
        onKeyUp={(event) => { if (event.key === " ") event.preventDefault(); }}
        // Screen readers activate with a click (detail 0): the same lift as Space.
        onClick={(event) => { if (event.detail === 0) onHandleKey(" "); }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5.5" cy="3.5" r="1.2" /><circle cx="10.5" cy="3.5" r="1.2" /><circle cx="5.5" cy="8" r="1.2" /><circle cx="10.5" cy="8" r="1.2" /><circle cx="5.5" cy="12.5" r="1.2" /><circle cx="10.5" cy="12.5" r="1.2" /></svg>
      </button>
    </div>
    <TaskChips task={task} now={actions.now} milestoneTitle={actions.milestoneTitle} />
    <div className="taskCardFoot">
      <div className="taskCardPeople"><TaskAssignee task={task} actions={actions} /></div>
      <TaskStatusSelect task={task} actions={actions} onMove={(_, status) => onMoveTo(status)} />
    </div>
    <TaskItemError task={task} actions={actions} />
  </article>;
}
