import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/skeleton.css";
import "./styles/shell.css";
import "./styles/surfaces.css";
import "./styles/tasks.css";
import "./styles/branch-log.css";
import "./styles/utilities.css";
import "./styles/responsive.css";
import "./styles/pages.css";
import "./styles/auth.css";
import "./styles/components.css";
import "./styles/projects.css";
import "./styles/card-nav.css";
import "./styles/project-card-nav.css";
import "./styles/access.css";
import "./styles/collab.css";
import "./styles/home.css";
import "./styles/task-board.css";
import "./styles/branches.css";
import "./styles/code.css";
import "./styles/project-actions.css";

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el elemento raíz del panel.");

// The public changelog (/novedades) needs neither the app nor Firebase.
if (/^\/novedades\/?$/.test(window.location.pathname)) {
  void import("./pages/ChangelogPage").then(({ ChangelogPage }) => createRoot(root).render(<ChangelogPage />));
} else {
  createRoot(root).render(<App />);
}
