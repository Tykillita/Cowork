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

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el elemento raíz del panel.");

createRoot(root).render(<App />);
