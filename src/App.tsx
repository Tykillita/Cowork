import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppShell } from "./components/AppShell";
import { Toast } from "./components/Toast";
import { BootSkeleton, readBootSurface, rememberBootSurface } from "./components/BootSkeleton";
import { BranchesPageSkeleton, HomePageSkeleton, ProjectSettingsSkeleton, TaskBoardSkeleton } from "./components/PageSkeletons";
import { LazyDialogSkeleton } from "./components/LazyDialogSkeleton";
import { LoginScreen } from "./features/auth/LoginScreen";
import { endSession, getAuthRedirectResult, isEmailLinkSignIn, linkGoogleProvider, observePanelAuth } from "./features/auth/panelAuth";
import { LEGACY_INVITE_MESSAGE } from "./features/access/AccessRequestDialog";
import { useProjectCatalog } from "./features/projects/useProjectCatalog";
import { useWorkboard } from "./features/workboard/useWorkboard";
import type { SavedEvent } from "./features/workboard/firestoreWorkboard";
import { PersonalProvider } from "./features/personal/PersonalContext";
import { ActivityCenter } from "./features/activity/ActivityCenter";
import { useActivityCenter } from "./features/activity/useActivityCenter";
import { StreakLayer } from "./features/streaks/StreakLayer";
import { readRetiredStreakNotice, readStreakInvite } from "./features/streaks/streakClient";
import { useHashRoute } from "./lib/useHashRoute";
import { firebaseConfigured } from "./lib/firebase";
import { clearAuthActionUrl, readAccessContext, readEntryIntent } from "./features/auth/accessContext";
import type { AccessContext, EntryIntent, GitHubBranchWrite, PageId, PanelUser, Project, ProjectSchedule } from "./types";

const loadCollectionDialog = () => import("./features/collection/CollectionDialog");
const CollectionDialog = lazy(() => loadCollectionDialog().then(({ CollectionDialog }) => ({ default: CollectionDialog })));
const ProjectPicker = lazy(() => import("./features/projects/ProjectPicker").then(({ ProjectPicker }) => ({ default: ProjectPicker })));
const HomePage = lazy(() => import("./pages/HomePage").then(({ HomePage }) => ({ default: HomePage })));
const TaskBoard = lazy(() => import("./features/workboard/TaskBoard").then(({ TaskBoard }) => ({ default: TaskBoard })));
const BranchesPage = lazy(() => import("./pages/BranchesPage").then(({ BranchesPage }) => ({ default: BranchesPage })));
const ProjectSettingsPage = lazy(() => import("./pages/ProjectSettingsPage").then(({ ProjectSettingsPage }) => ({ default: ProjectSettingsPage })));
const EntryPortal = lazy(() => import("./features/auth/EntryPortal").then(({ EntryPortal }) => ({ default: EntryPortal })));

function activeProjectStorageKey(userId: string) {
  return `cowork.active-project.${userId}`;
}

/** Stored when the picker itself is the destination, e.g. after "Cambiar proyecto". */
const PROJECT_PICKER_SENTINEL = "__project-picker__";

function readActiveProjectId(userId: string) {
  try { return window.localStorage.getItem(activeProjectStorageKey(userId)) || ""; } catch { return ""; }
}

function writeActiveProjectId(userId: string, projectId: string) {
  try { window.localStorage.setItem(activeProjectStorageKey(userId), projectId); }
  catch { /* Project navigation still works when browser storage is unavailable. */ }
}

type LoadState = {
  emailLink: boolean;
  legacyStreakInvite: boolean;
  access: AccessContext | null;
  intent: EntryIntent;
};

function readLoadState(): LoadState {
  const access = readAccessContext(window.location.href);
  return { legacyStreakInvite: !!readStreakInvite() || readRetiredStreakNotice(), emailLink: isEmailLinkSignIn(), access, intent: readEntryIntent(window.location.href) };
}

export default function App() {
  const page = useHashRoute();
  const [load] = useState(readLoadState);
  const [user, setUser] = useState<PanelUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authLinkPending, setAuthLinkPending] = useState(load.emailLink);
  // Old email invitations are only recognised to explain they must be replaced.
  const [accessContext, setAccessContext] = useState<AccessContext | null>(load.access?.kind === "link" ? load.access : null);
  const [entryIntent, setEntryIntent] = useState<EntryIntent>(load.intent);
  const [showLogin, setShowLogin] = useState(load.emailLink || load.access?.kind === "link" || load.intent === "create" || load.legacyStreakInvite);
  const [openCreate, setOpenCreate] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [fallbackProject, setFallbackProject] = useState<Project | null>(null);
  const [restoredUserId, setRestoredUserId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState(load.legacyStreakInvite ? "Las invitaciones ahora funcionan con códigos de amigo. Inicia sesión para ir a Amigos." : load.access?.kind === "legacy" ? LEGACY_INVITE_MESSAGE : "");
  // UID of the session that already existed when the page loaded. Only that
  // session may resume its last project; any later sign-in is a fresh login.
  const resumableUidRef = useRef<string | null>(null);
  const authSettledRef = useRef(false);
  const redirectHandledRef = useRef(false);
  const seenInCatalogRef = useRef(new Set<string>());
  const notify = useCallback((message: string) => setToastMessage(message), []);
  const dismissToast = useCallback(() => setToastMessage(""), []);
  const catalog = useProjectCatalog(user);

  const selectedProject = selectedProjectId
    ? catalog.projects.find((project) => project.id === selectedProjectId) ?? (fallbackProject?.id === selectedProjectId ? fallbackProject : null)
    : null;

  const showPicker = useCallback((userId: string | null) => {
    setSelectedProjectId(null);
    setFallbackProject(null);
    if (userId) writeActiveProjectId(userId, PROJECT_PICKER_SENTINEL);
  }, []);

  const clearSelectedProject = useCallback(() => showPicker(user?.id ?? null), [showPicker, user?.id]);
  // Saved work counts towards the personal collection; recording never blocks the save.
  const recordWork = useCallback((saved: SavedEvent | null) => {
    if (!user || !saved?.countsAsWork) return;
    void import("./features/progress/progressStore").then(({ recordWork: record }) => record(user.id, saved)).catch(() => undefined);
  }, [user]);
  const workboard = useWorkboard(user, selectedProject, notify, clearSelectedProject, recordWork);
  const activity = useActivityCenter(user, catalog.projects, selectedProject ? { projectId: selectedProject.id, tasks: workboard.tasks } : null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    if (load.access?.kind === "legacy") clearAuthActionUrl(null, null, true);
  }, [load.access]);

  // Decide once per signed-in account where it lands: a resumed session reopens
  // its project and section; a fresh login (or a shared link) shows the picker.
  useEffect(() => {
    if (!user || !catalog.ready || restoredUserId === user.id) return;
    const resumed = resumableUidRef.current === user.id;
    resumableUidRef.current = null;
    const storedId = resumed && !accessContext ? readActiveProjectId(user.id) : "";
    const project = storedId ? catalog.projects.find((entry) => entry.id === storedId) ?? null : null;
    if (project) {
      setSelectedProjectId(project.id);
      setFallbackProject(project);
    } else {
      showPicker(user.id);
      if (storedId && storedId !== PROJECT_PICKER_SENTINEL) notify("Ese proyecto ya no está disponible para tu cuenta.");
    }
    setRestoredUserId(user.id);
  }, [accessContext, catalog.projects, catalog.ready, notify, restoredUserId, showPicker, user]);

  // Leave the project when the account loses access to it while it is open.
  useEffect(() => {
    if (!user || !selectedProjectId || !catalog.ready || catalog.loading) return;
    if (catalog.projects.some((project) => project.id === selectedProjectId)) {
      seenInCatalogRef.current.add(selectedProjectId);
      return;
    }
    if (!seenInCatalogRef.current.has(selectedProjectId)) return;
    seenInCatalogRef.current.delete(selectedProjectId);
    showPicker(user.id);
    notify("Este proyecto ya no está disponible para tu cuenta. El acceso se limita a sus miembros activos.");
  }, [catalog.loading, catalog.projects, catalog.ready, notify, selectedProjectId, showPicker, user]);

  // Remember the settled screen, so the next boot shows placeholders with its shape.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { rememberBootSurface("portal"); return; }
    if (!catalog.ready || restoredUserId !== user.id) return;
    rememberBootSurface(selectedProject ? "project" : "picker");
  }, [authLoading, catalog.ready, restoredUserId, selectedProject, user]);

  useEffect(() => {
    // Same colour as the top strip of each surface (tokens.css), so Safari's
    // status bar continues the page. Desktop keeps the original tones.
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const styles = getComputedStyle(document.documentElement);
    const mobile = styles.getPropertyValue(selectedProject ? "--status-bar-app" : "--status-bar-projects").trim();
    if (themeColor) themeColor.content = mobile || (selectedProject ? "#08090b" : "#101315");
  }, [selectedProject]);

  const handleAuthenticated = useCallback((nextUser: PanelUser) => {
    resumableUidRef.current = null;
    setRestoredUserId(null);
    setUser(nextUser);
    setAuthLinkPending(false);
    setShowLogin(false);
    if (entryIntent === "create") setOpenCreate(true);
    setEntryIntent(null);
    // The pending action now lives in React state only, so a reload cannot replay it.
    clearAuthActionUrl(accessContext, null);
  }, [accessContext, entryIntent]);

  useEffect(() => {
    if (!firebaseConfigured) { setAuthLoading(false); return; }
    let active = true;
    let unsubscribe: () => void = () => {};
    void (async () => {
      try {
        const redirect = await getAuthRedirectResult();
        if (!active) return;
        if (redirect && !redirectHandledRef.current) {
          redirectHandledRef.current = true;
          const providerName = redirect.provider === "github" ? "GitHub" : "Google";
          if (redirect.operationType === "signIn") {
            // A provider redirect is a fresh login, not a session to resume from storage.
            authSettledRef.current = true;
            resumableUidRef.current = null;
            handleAuthenticated(redirect.profile);
          } else if (redirect.operationType === "link") {
            setUser(redirect.profile);
            setToastMessage(`${providerName} quedó vinculado a esta cuenta.`);
          } else if (redirect.operationType === "reauthenticate") {
            setToastMessage("GitHub volvió a conectarse.");
          }
        }
      } catch (error) {
        if (active) {
          const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
          setToastMessage(code === "auth/unauthorized-domain"
            ? "Este dominio todavía no está autorizado en Firebase Authentication."
            : ["auth/credential-already-in-use", "auth/account-exists-with-different-credential"].includes(code)
              ? "Esa cuenta ya está vinculada a otra identidad de Cowork. Entra con tu método habitual; Cowork no fusiona cuentas automáticamente."
              : "No se pudo completar el acceso. Vuelve a intentarlo o usa el acceso por correo.");
        }
      }
      if (active) unsubscribe = observePanelAuth((nextUser) => {
        if (!authSettledRef.current) {
          authSettledRef.current = true;
          // Opening an email sign-in link starts a new login even if another session was active.
          resumableUidRef.current = load.emailLink ? null : nextUser?.id ?? null;
          // A create action is only honoured after the login it started, never on a plain reload.
          if (nextUser && !load.emailLink && load.intent === "create") {
            setEntryIntent(null);
            setShowLogin(false);
            clearAuthActionUrl(load.access?.kind === "link" ? load.access : null, null, true);
          }
        }
        setUser(nextUser);
        setAuthLoading(false);
      });
    })();
    return () => { active = false; unsubscribe(); };
  }, [handleAuthenticated, load]);

  const openCreateFlow = useCallback(() => {
    setEntryIntent("create");
    clearAuthActionUrl(null, "create");
    setShowLogin(true);
  }, []);

  const openJoinFlow = useCallback((context: AccessContext) => {
    setAccessContext(context);
    setEntryIntent("join");
    clearAuthActionUrl(context, "join");
    if (!user) setShowLogin(true);
  }, [user]);

  const joinFromPicker = useCallback((context: AccessContext) => {
    setAccessContext(context);
    clearAuthActionUrl(context, null);
  }, []);

  const closeAccessDialog = useCallback(() => {
    setAccessContext(null);
    clearAuthActionUrl(null);
  }, []);

  const returnToPortal = useCallback(() => {
    setShowLogin(false);
    setAuthLinkPending(false);
    setEntryIntent(null);
    setAccessContext(null);
    clearAuthActionUrl(null);
  }, []);

  const logout = useCallback(async () => {
    if (user) writeActiveProjectId(user.id, PROJECT_PICKER_SENTINEL);
    try { await endSession(); } catch { /* Hide private project views even if sign-out is temporarily offline. */ }
    setUser(null);
    setSelectedProjectId(null);
    setFallbackProject(null);
    setRestoredUserId(null);
    setOpenCreate(false);
    setAccessContext(null);
    setCollectionOpen(false);
    resumableUidRef.current = null;
    seenInCatalogRef.current.clear();
    clearAuthActionUrl(null);
  }, [user]);

  const linkGoogle = useCallback(async () => {
    const linkedUser = await linkGoogleProvider();
    if (linkedUser) setUser(linkedUser);
    return linkedUser;
  }, []);

  const selectProject = useCallback((project: Project) => {
    setSelectedProjectId(project.id);
    setFallbackProject(project);
    setAccessContext(null);
    setOpenCreate(false);
    if (user) writeActiveProjectId(user.id, project.id);
    clearAuthActionUrl(null);
  }, [user]);

  const consumeCreateIntent = useCallback(() => setOpenCreate(false), []);

  /** Opens a project section from the activity center. */
  const openFromActivity = useCallback((projectId: string, hash: string) => {
    const project = catalog.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    selectProject(project);
    window.setTimeout(() => { window.location.hash = hash; }, 0);
  }, [catalog.projects, selectProject]);

  const backToProjects = useCallback(() => {
    showPicker(user?.id ?? null);
    clearAuthActionUrl(null);
  }, [showPicker, user?.id]);

  const saveProjectPreview = useCallback(async (previewUrl: string, iconUrl: string) => {
    if (!selectedProjectId) return;
    await catalog.updatePreviewUrl(selectedProjectId, previewUrl, iconUrl);
  }, [catalog.updatePreviewUrl, selectedProjectId]);

  const saveProjectSchedule = useCallback(async (schedule: ProjectSchedule | null) => {
    if (!selectedProjectId) return;
    await catalog.updateSchedule(selectedProjectId, schedule);
  }, [catalog.updateSchedule, selectedProjectId]);

  const saveGitHubPolicy = useCallback(async (branchWrite: GitHubBranchWrite) => {
    if (!selectedProjectId) return;
    await catalog.updateGitHubPolicy(selectedProjectId, branchWrite);
  }, [catalog.updateGitHubPolicy, selectedProjectId]);

  return <PersonalProvider user={user} onNotice={notify}><StreakLayer user={user} legacyInvite={load.legacyStreakInvite} />{renderContent()}</PersonalProvider>;

  function renderContent() {
  if (authLoading) return <BootSkeleton surface={readBootSurface()} page={page} label="Cargando Cowork" />;

  if (authLinkPending || (!user && showLogin)) {
    return <><LoginScreen invite={accessContext} intent={entryIntent} onBack={returnToPortal} onAuthenticated={handleAuthenticated} /><Toast message={toastMessage} onDismiss={dismissToast} /></>;
  }

  if (!user) return <>
    <Suspense fallback={<BootSkeleton surface="portal" label="Cargando Cowork" />}><EntryPortal onCreate={openCreateFlow} onJoin={openJoinFlow} /></Suspense>
    <Toast message={toastMessage} onDismiss={dismissToast} />
  </>;

  if (!catalog.ready || restoredUserId !== user.id) {
    const activeId = readActiveProjectId(user.id);
    return <BootSkeleton surface={activeId && activeId !== PROJECT_PICKER_SENTINEL ? "project" : "picker"} page={page} label="Cargando tus espacios de trabajo" />;
  }

  const activityButton = <ActivityCenter state={activity} projectIds={catalog.projects.map((entry) => entry.id)} onOpen={openFromActivity} />;
  const profileMenu = <button className="accountAccessMenuItem" type="button" onPointerEnter={() => { void loadCollectionDialog(); }} onFocus={() => { void loadCollectionDialog(); }} onClick={() => setCollectionOpen(true)}>Mi colección</button>;
  const collection = collectionOpen ? <Suspense fallback={<LazyDialogSkeleton kind="collection" onClose={() => setCollectionOpen(false)} />}><CollectionDialog onClose={() => setCollectionOpen(false)} /></Suspense> : null;

  if (!selectedProject) return <>
    <Suspense fallback={<BootSkeleton surface="picker" page={page} label="Cargando tus espacios de trabajo" />}><ProjectPicker
      projects={catalog.projects}
      loading={catalog.loading}
      error={catalog.error}
      user={user}
      openCreate={openCreate}
      onCreateIntentConsumed={consumeCreateIntent}
      accessContext={accessContext}
      onRetry={catalog.retry}
      onSelect={selectProject}
      onCreate={catalog.addProject}
      onCreateLink={catalog.createLink}
      onJoinAccess={joinFromPicker}
      onCloseAccess={closeAccessDialog}
      onUserUpdated={setUser}
      onLinkGoogle={linkGoogle}
      onSignOut={() => void logout()}
      headerActions={activityButton}
      profileMenu={profileMenu}
    /></Suspense>
    {collection}
    <Toast message={toastMessage} onDismiss={dismissToast} />
  </>;

  const project = selectedProject;
  const isOwner = project.ownerUid === user.id;
  const pages: Record<PageId, ReactNode> = {
    home: <HomePage project={project} tasks={workboard.tasks} branchesCount={workboard.branches.length} milestones={workboard.milestones} now={now} ready={workboard.ready} />,
    work: <TaskBoard
      project={project}
      user={user}
      tasks={workboard.tasks}
      milestones={workboard.milestones}
      directory={workboard.directory}
      mode={workboard.mode}
      ready={workboard.ready}
      isOwner={isOwner}
      now={now}
      onCreate={workboard.createTask}
      onUpdate={workboard.updateTask}
      onRemove={workboard.removeTask}
      onCreateMilestone={workboard.createMilestone}
      onUpdateMilestone={workboard.updateMilestone}
    />,
    "branches-page": <BranchesPage project={project} branches={workboard.branches} ready={workboard.ready.branches} user={user} isOwner={isOwner} onSave={workboard.createBranch} onRemove={workboard.removeBranch} />,
    "settings-page": <ProjectSettingsPage project={project} user={user} isOwner={isOwner} actions={catalog} onSavePreview={saveProjectPreview} onSaveSchedule={saveProjectSchedule} onSaveGitHubPolicy={saveGitHubPolicy} />,
  };
  const pageSkeletons: Record<PageId, ReactNode> = {
    home: <HomePageSkeleton />,
    work: <TaskBoardSkeleton />,
    "branches-page": <BranchesPageSkeleton />,
    "settings-page": <ProjectSettingsSkeleton />,
  };

  return <>
    <AppShell page={page} project={project} user={user} mode={workboard.mode} onLock={() => void logout()} onSwitchProject={backToProjects} onLinkGoogle={linkGoogle} headerActions={activityButton} profileMenu={profileMenu}>
      <Suspense fallback={pageSkeletons[page]}>{pages[page]}</Suspense>
    </AppShell>
    {collection}
    <Toast message={toastMessage} onDismiss={dismissToast} />
  </>;
  }
}
