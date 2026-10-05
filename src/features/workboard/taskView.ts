/** Board or list: remembered per browser, so the skeleton takes the same shape. */
export type TaskView = "board" | "list";

const KEY = "cowork.task-view";

export function readTaskView(): TaskView {
  try { return window.localStorage.getItem(KEY) === "list" ? "list" : "board"; } catch { return "board"; }
}

export function writeTaskView(view: TaskView) {
  try { window.localStorage.setItem(KEY, view); } catch { /* Private mode: the choice lasts this visit. */ }
}
