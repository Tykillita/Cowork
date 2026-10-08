import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubBranchWrite, PanelUser, Project, ProjectAccessLink, ProjectAccessRequest, ProjectMember, ProjectSchedule } from "../../types";
import { projectEventId } from "../activity/activityEvents";
import type { ProjectDraft } from "./projectCatalog";

export function useProjectCatalog(user: PanelUser | null) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState("");
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const activeUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    if (!user) {
      activeUserId.current = null;
      setProjects([]);
      setLoading(false);
      setError("");
      setReadyUserId(null);
      return;
    }
    const userKey = [...new Set(user.mergedUids?.length ? user.mergedUids : [user.id])].sort().join("|");
    if (activeUserId.current !== userKey) {
      activeUserId.current = userKey;
      setProjects([]);
    }
    setLoading(true);
    setError("");
    setReadyUserId(null);
    void import("./projectCatalog").then(async ({ watchProjects }) => {
      const stop = await watchProjects(user.mergedUids?.length ? user.mergedUids : [user.id], (nextProjects, unavailableCount) => {
        if (!active) return;
        setProjects(nextProjects);
        setLoading(false);
        setError(unavailableCount > 0
          ? `No se pudieron abrir ${unavailableCount === 1 ? "uno de tus proyectos" : `${unavailableCount} proyectos`}. Los demás espacios siguen disponibles; vuelve a intentar para actualizar la lista.`
          : "");
        setReadyUserId(user.id);
      }, () => {
        if (!active) return;
        setLoading(false);
        setError("No se pudo actualizar la lista de proyectos. Conservamos los proyectos que ya se habían cargado; revisa tu conexión y vuelve a intentarlo.");
        setReadyUserId(user.id);
      });
      if (active) unsubscribe = stop;
      else stop();
    }).catch(() => {
      if (!active) return;
      setLoading(false);
      setError("No se pudieron cargar tus proyectos. Revisa la configuración de Firebase.");
      setReadyUserId(user.id);
    });
    return () => { active = false; unsubscribe?.(); };
  }, [retryVersion, user]);

  const retry = useCallback(() => setRetryVersion((version) => version + 1), []);

  const addProject = useCallback(async (draft: ProjectDraft) => {
    if (!user) throw new Error("Inicia sesión para crear un proyecto.");
    const { createProject } = await import("./projectCatalog");
    const project = await createProject(draft, user);
    // Crediting the streak day never blocks or undoes the creation; failures are retried later.
    void import("../progress/progressStore")
      .then(({ recordWork }) => recordWork(user.id, { projectId: project.id, eventId: projectEventId(project.id), countsAsWork: true }))
      .catch(() => undefined);
    return project;
  }, [user]);

  const updatePreviewUrl = useCallback(async (projectId: string, previewUrl: string, iconUrl = "") => {
    if (!user) throw new Error("Inicia sesión para editar un proyecto.");
    const { updateProjectPreviewUrl } = await import("./projectCatalog");
    return updateProjectPreviewUrl(projectId, previewUrl, iconUrl);
  }, [user]);

  const updateSchedule = useCallback(async (projectId: string, schedule: ProjectSchedule | null) => {
    if (!user) throw new Error("Inicia sesión para editar el plazo.");
    const { updateProjectSchedule } = await import("./projectCatalog");
    return updateProjectSchedule(projectId, schedule);
  }, [user]);

  const updateChangelogUrl = useCallback(async (projectId: string, changelogUrl: string) => {
    if (!user) throw new Error("Inicia sesión para editar el proyecto.");
    const { updateProjectChangelogUrl } = await import("./projectCatalog");
    return updateProjectChangelogUrl(projectId, changelogUrl);
  }, [user]);

  const updateRepositoryUrl = useCallback(async (projectId: string, repositoryUrl: string) => {
    if (!user) throw new Error("Inicia sesión para editar el proyecto.");
    const { updateProjectRepository } = await import("./projectCatalog");
    return updateProjectRepository(projectId, repositoryUrl);
  }, [user]);

  const updateGitHubPolicy = useCallback(async (projectId: string, branchWrite: GitHubBranchWrite) => {
    if (!user) throw new Error("Inicia sesión para editar el proyecto.");
    const { updateProjectGitHubPolicy } = await import("./projectCatalog");
    return updateProjectGitHubPolicy(projectId, branchWrite);
  }, [user]);

  const watchMembers = useCallback(async (projectId: string, onValue: (members: ProjectMember[]) => void, onError: (error: Error) => void) => {
    if (!user) throw new Error("Inicia sesión para ver los miembros.");
    const { watchProjectMembers } = await import("./projectAccess");
    return watchProjectMembers(projectId, onValue, onError);
  }, [user]);

  const watchLinks = useCallback(async (projectId: string, onValue: (links: ProjectAccessLink[]) => void, onError: (error: Error) => void) => {
    if (!user) throw new Error("Inicia sesión para ver los enlaces de acceso.");
    const { watchAccessLinks } = await import("./projectAccess");
    return watchAccessLinks(projectId, onValue, onError);
  }, [user]);

  const watchRequests = useCallback(async (projectId: string, onValue: (requests: ProjectAccessRequest[]) => void, onError: (error: Error) => void) => {
    if (!user) throw new Error("Inicia sesión para ver las solicitudes.");
    const { watchAccessRequests } = await import("./projectAccess");
    return watchAccessRequests(projectId, onValue, onError);
  }, [user]);

  const createLink = useCallback(async (project: Pick<Project, "id" | "name">) => {
    if (!user) throw new Error("Inicia sesión para generar un enlace.");
    const { createAccessLink } = await import("./projectAccess");
    return createAccessLink(project.id, project.name, user);
  }, [user]);

  const revokeLink = useCallback(async (projectId: string, linkId: string) => {
    if (!user) throw new Error("Inicia sesión para revocar el enlace.");
    const { revokeAccessLink } = await import("./projectAccess");
    return revokeAccessLink(projectId, linkId);
  }, [user]);

  const approveRequest = useCallback(async (projectId: string, request: ProjectAccessRequest) => {
    if (!user) throw new Error("Inicia sesión para aprobar solicitudes.");
    const { approveAccessRequest } = await import("./projectAccess");
    return approveAccessRequest(projectId, request, user);
  }, [user]);

  const rejectRequest = useCallback(async (projectId: string, request: ProjectAccessRequest) => {
    if (!user) throw new Error("Inicia sesión para rechazar solicitudes.");
    const { rejectAccessRequest } = await import("./projectAccess");
    return rejectAccessRequest(projectId, request, user);
  }, [user]);

  const setRetryAllowed = useCallback(async (projectId: string, request: ProjectAccessRequest, allowed: boolean) => {
    if (!user) throw new Error("Inicia sesión para administrar solicitudes.");
    const access = await import("./projectAccess");
    return access.setRetryAllowed(projectId, request, allowed, user);
  }, [user]);

  const loadHistory = useCallback(async (projectId: string, pageSize: number, cursor: unknown) => {
    const access = await import("./projectAccess");
    return access.loadAccessHistory(projectId, pageSize, cursor);
  }, []);

  const removeMember = useCallback(async (projectId: string, uid: string, ownerUid: string) => {
    if (!user) throw new Error("Inicia sesión para quitar a un miembro.");
    const { removeProjectMember } = await import("./projectAccess");
    return removeProjectMember(projectId, uid, ownerUid);
  }, [user]);

  const transferOwnership = useCallback(async (projectId: string, targetUid: string) => {
    if (!user) throw new Error("Inicia sesión para transferir la propiedad.");
    const { transferProjectOwnership } = await import("./projectAccess");
    await transferProjectOwnership(projectId, targetUid, user);
  }, [user]);

  return { projects, loading, ready: !user || readyUserId === user.id, error, retry, addProject, updatePreviewUrl, updateSchedule, updateGitHubPolicy, updateChangelogUrl, updateRepositoryUrl, watchMembers, watchLinks, watchRequests, createLink, revokeLink, approveRequest, rejectRequest, setRetryAllowed, loadHistory, removeMember, transferOwnership };
}
