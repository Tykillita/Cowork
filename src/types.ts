export interface PanelUser {
  id: string;
  name: string;
  email: string;
  photoURL: string;
  emailVerified: boolean;
  authProviders: string[];
}

export type ProjectKind = "general";

/**
 * Delivery window chosen as whole calendar days in `timeZone`. The UTC
 * instants are derived once when saving so every member sees the same deadline.
 */
export interface ProjectSchedule {
  startDate: string;
  endDate: string;
  timeZone: string;
  startsAt: string;
  endsAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  repositoryUrl: string;
  previewUrl: string;
  kind: ProjectKind;
  createdAt: string;
  ownerUid: string;
  schedule?: ProjectSchedule;
  /** Optional icon chosen by the owner; otherwise the preview site's own icon is detected. */
  iconUrl?: string;
  /** Who may create and delete GitHub branches from Cowork. Missing means "owner". */
  githubPolicy?: ProjectGitHubPolicy;
}

export type GitHubBranchWrite = "owner" | "members";

export interface ProjectGitHubPolicy {
  branchWrite: GitHubBranchWrite;
}

export type ProjectRole = "owner" | "member";

export interface ProjectMember {
  uid: string;
  name: string;
  email: string;
  role: ProjectRole;
  joinedAt: string;
}

export type AccessLinkStatus = "active" | "revoked";

export interface ProjectAccessLink {
  id: string;
  projectId: string;
  projectName: string;
  status: AccessLinkStatus;
  createdAt: string;
  expiresAt: string;
}

export type AccessRequestStatus = "pending" | "approved" | "rejected";

/** Current state of one person's request; the history keeps every attempt. */
export interface ProjectAccessRequest {
  uid: string;
  projectId: string;
  name: string;
  email: string;
  linkId: string;
  status: AccessRequestStatus;
  createdAt: string;
  decidedAt?: string;
  /** 1 for the first request, +1 for every new attempt. */
  attempt: number;
  /** Set by the owner on a rejected request; consumed by the next attempt. */
  retryAllowed: boolean;
  grantVersion: number;
}

export type AccessHistoryAction = "requested" | "approved" | "rejected" | "retry-allowed" | "retry-withdrawn";

export interface AccessHistoryEntry {
  id: string;
  requesterUid: string;
  requesterName: string;
  attempt: number;
  action: AccessHistoryAction;
  actorUid: string;
  actorName: string;
  at: string;
}

/** Index kept under the requester's account so the picker can follow each request. */
export interface OwnAccessRequest {
  projectId: string;
  projectName: string;
  status: AccessRequestStatus | "unknown";
  createdAt: string;
  retryAllowed: boolean;
  /** Link used for the last attempt; a retry reuses it while it is still valid. */
  linkId: string;
}

/**
 * Context carried by a shared URL through authentication. Email invitations
 * from earlier versions are recognised only to explain they must be replaced.
 */
export type AccessContext =
  | { kind: "link"; projectId: string; linkId: string }
  | { kind: "legacy" };

export type EntryIntent = "create" | "join" | null;

export type TaskStatus = "Pendiente" | "En curso" | "Hecha";
export const TASK_STATUSES: TaskStatus[] = ["Pendiente", "En curso", "Hecha"];
export const DEFAULT_TASK_PHASE = "General";

export interface Task {
  id: string;
  order: number;
  phase: string;
  title: string;
  status: TaskStatus;
  /**
   * Name label kept for history. Tasks created before accounts were linked only
   * have this label; with an empty `assigneeUid` it reads "por revisar".
   */
  assignee: string;
  assigneeUid: string;
  milestoneId: string;
  /** Incremented on every write; each revision has exactly one activity event. */
  revision: number;
}

export interface TeamDirectoryEntry {
  uid: string;
  name: string;
  photoURL: string;
  active: boolean;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  /** Last included calendar day in `timeZone`; it is due when that day ends. */
  dueDate: string;
  timeZone: string;
  dueAt: string;
  archived: boolean;
  createdAt: string;
  revision: number;
}

export type ActivityTarget = "task" | "milestone" | "branch" | "project";
export type ActivityKind = "created" | "updated" | "deleted";

export interface ActivityChanges {
  status?: { from: string; to: string };
  assignee?: { fromUid: string; toUid: string; fromName: string; toName: string };
  milestone?: { from: string; to: string };
  title?: { from: string; to: string };
  dueAt?: { from: string; to: string };
  archived?: { from: boolean; to: boolean };
  migration?: boolean;
}

export interface ActivityEvent {
  id: string;
  projectId: string;
  kind: ActivityKind;
  targetType: ActivityTarget;
  targetId: string;
  targetTitle: string;
  revision: number;
  actorUid: string;
  actorName: string;
  createdAt: string;
  changes: ActivityChanges;
}

export type ProjectSort = "recent" | "name" | "custom";
export type MotionPreference = "system" | "full" | "reduced";

export interface PersonalPreferences {
  favorites: string[];
  order: string[];
  sort: ProjectSort;
  filter: "all" | "favorites";
  motion: MotionPreference;
}

export interface SceneSelection {
  characterId: string;
  landscapeId: string;
}

export interface ProgressSummary {
  activeDays: number;
  /** Days since the Unix epoch in UTC. */
  days: number[];
  currentStreak: number;
  bestStreak: number;
}

/** Points earned by work (at most a few per UTC day) and spent in the shop. */
export interface WalletSummary {
  balance: number;
  earned: number;
  spent: number;
  /** Points earned during the current UTC day. */
  pointsToday: number;
}

/** Points per UTC day for the latest days with points, as stored. */
export interface WalletSnapshot {
  balance: number;
  earned: number;
  spent: number;
  recentDays: { day: number; points: number }[];
}

/** One line of the points history: a point earned by work or an item bought. */
export interface PointMovement {
  id: string;
  kind: "earn" | "spend";
  points: number;
  /** Milliseconds since the epoch; 0 while the server time is pending. */
  at: number;
  label: string;
}

export interface BranchEntry {
  id: string;
  name: string;
  reason: string;
  by?: string;
  createdByUid?: string;
  createdAt: string;
  /** The branch was also created in the GitHub repository from Cowork. */
  githubCreated?: boolean;
}

export type WorkboardMode = "connecting" | "remote" | "offline";
export type PageId = "home" | "work" | "branches-page" | "settings-page";
export type WallpaperId = "silver-wave" | "silver-rings";

export interface GitHubBranch {
  name: string;
  commit?: { sha?: string };
  protected?: boolean;
}

/** Repository metadata; `permissions` only comes back on authenticated requests. */
export interface GitHubRepo {
  full_name: string;
  default_branch: string;
  private: boolean;
  html_url: string;
  permissions?: { admin?: boolean; maintain?: boolean; push?: boolean; triage?: boolean; pull?: boolean };
}

export interface GitHubCommit {
  sha: string;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string };
    committer?: { date?: string };
  };
  author?: { login?: string } | null;
}
