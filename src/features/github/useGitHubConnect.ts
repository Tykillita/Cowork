import { useState } from "react";
import type { PanelUser } from "../../types";
import { linkGitHubProvider, reconnectGitHub } from "../auth/panelAuth";
import { syncGitHubSession, type GitHubSessionState } from "./githubSession";

/** "Conectar GitHub" / "Reconectar GitHub" for pages that read the repository. */
export function useGitHubConnect(user: PanelUser, github: GitHubSessionState) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    if (connecting) return;
    setConnecting(true);
    setError("");
    try {
      if (await (github.linked ? reconnectGitHub() : linkGitHubProvider())) syncGitHubSession(user.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo conectar GitHub.");
    } finally { setConnecting(false); }
  }

  return { connect, connecting, error, label: github.linked ? "Reconectar GitHub" : "Conectar GitHub" };
}
