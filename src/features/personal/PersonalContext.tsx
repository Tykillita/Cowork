import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PanelUser, PersonalPreferences, ProgressSummary, SceneSelection, WalletSnapshot, WalletSummary } from "../../types";
import { nextUtcDayStart, pointsOn, streaks, utcDay } from "../progress/progressStore";
import { rewardNotices, type RewardState } from "../progress/rewardNotices";
import { cachedPreferences, DEFAULT_PREFERENCES, DEFAULT_SCENE } from "./personalStore";

import type { StreakSnapshot } from "../streaks/streakModel";
import { history } from "../streaks/streakModel";
import { streakCommand, streakError as describeStreakError, watchNudges, watchStreakState } from "../streaks/streakClient";
import type { NudgeView } from "../streaks/streakModel";

type PersonalState = {
  streak: StreakSnapshot | null;
  streakError: string;
  refreshStreak: () => Promise<void>;
  /** Received nudges (latest 20), shared by the pill, the bell and the live notice. */
  nudges: NudgeView[];
  /** Selected shared profile UID, or "" when signed out. */
  userId: string;
  sourceUids: readonly string[];
  preferences: PersonalPreferences;
  scene: SceneSelection;
  progress: ProgressSummary;
  progressReady: boolean;
  wallet: WalletSummary;
  /** The wallet (balance, points) has arrived from Firestore. */
  walletReady: boolean;
  /** Shop items bought by this account. */
  owned: ReadonlySet<string>;
  /** Current UTC day; changes at midnight UTC while the app is open. */
  today: number;
  /** Resolved from the personal preference, falling back to the system setting. */
  reducedMotion: boolean;
  savePreferences: (patch: Partial<PersonalPreferences>) => Promise<void>;
  saveScene: (selection: SceneSelection) => Promise<void>;
  purchase: (itemId: string) => Promise<void>;
};

const EMPTY_PROGRESS: ProgressSummary = { activeDays: 0, days: [], currentStreak: 0, bestStreak: 0 };
const EMPTY_WALLET: WalletSnapshot = { balance: 0, earned: 0, spent: 0, recentDays: [] };
const NOTHING_OWNED: ReadonlySet<string> = new Set();
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
/** Notices that arrive together (day marker, then point) are shown as one message. */
const NOTICE_DELAY_MS = 800;

const PersonalContext = createContext<PersonalState>({
  streak: null,
  streakError: "",
  refreshStreak: async () => undefined,
  nudges: [],
  userId: "",
  sourceUids: [],
  preferences: DEFAULT_PREFERENCES,
  scene: DEFAULT_SCENE,
  progress: EMPTY_PROGRESS,
  progressReady: false,
  wallet: { balance: 0, earned: 0, spent: 0, pointsToday: 0 },
  walletReady: false,
  owned: NOTHING_OWNED,
  today: utcDay(Date.now()),
  reducedMotion: false,
  savePreferences: async () => undefined,
  saveScene: async () => undefined,
  purchase: async () => undefined,
});

function useSystemReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(REDUCED_QUERY);
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** The current UTC day, refreshed when the next one starts. */
function useUtcDay() {
  const [today, setToday] = useState(() => utcDay(Date.now()));
  useEffect(() => {
    const refresh = () => setToday(utcDay(Date.now()));
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    const wait = Math.max(1000, nextUtcDayStart().getTime() - Date.now() + 500);
    const timer = window.setTimeout(() => setToday(utcDay(Date.now())), wait);
    return () => window.clearTimeout(timer);
  }, [today]);
  return today;
}

export function PersonalProvider({ user, onNotice, children }: { user: PanelUser | null; onNotice?: (message: string) => void; children: ReactNode }) {
  const authUid = user?.id ?? "";
  const uid = user?.profileUid || authUid;
  const sourceUids = useMemo(() => [...new Set(user?.mergedUids?.length ? user.mergedUids : [authUid])].filter(Boolean), [authUid, user?.mergedUids]);
  const accountKey = `${authUid}|${uid}|${sourceUids.slice().sort().join("|")}`;
  const [preferences, setPreferences] = useState<PersonalPreferences>(() => uid ? cachedPreferences(uid) : DEFAULT_PREFERENCES);
  const [scene, setScene] = useState<SceneSelection>(DEFAULT_SCENE);
  const [stored, setStored] = useState<{ activeDays: number; days: number[] }>({ activeDays: 0, days: [] });
  const [progressReady, setProgressReady] = useState(false);
  const [walletSnapshot, setWalletSnapshot] = useState<WalletSnapshot>(EMPTY_WALLET);
  const [walletReady, setWalletReady] = useState(false);
  const [owned, setOwned] = useState<ReadonlySet<string>>(NOTHING_OWNED);
  const systemReduced = useSystemReducedMotion();
  const today = useUtcDay();
  const [streak, setStreak] = useState<StreakSnapshot | null>(null);
  const [streakError, setStreakError] = useState("");
  const [nudges, setNudges] = useState<NudgeView[]>([]);
  const currentUid = useRef(accountKey);
  currentUid.current = accountKey;
  const inFlight = useRef<{ uid: string; task: Promise<void>; again: boolean } | null>(null);
  const refreshStreak = useCallback((): Promise<void> => {
    if (!uid) return Promise.resolve();
    if (inFlight.current?.uid === accountKey) {
      inFlight.current.again = true;
      return inFlight.current.task;
    }
    const entry = { uid: accountKey, again: false, task: Promise.resolve() };
    inFlight.current = entry;
    entry.task = (async () => {
      do {
        entry.again = false;
        try {
          const value = await streakCommand<StreakSnapshot>("summary");
          if (currentUid.current === accountKey) { setStreak(value); setStreakError(""); }
        } catch (error) {
          if (currentUid.current === accountKey) setStreakError(describeStreakError(error));
          break;
        }
      } while (entry.again && currentUid.current === accountKey);
    })().finally(() => { if (inFlight.current === entry) inFlight.current = null; });
    return entry.task;
  }, [accountKey]);

  useEffect(() => {
    setStreak(null); setStreakError("");
    if (!uid) return;
    let active = true;
    let stop: (() => void) | undefined;
    void watchStreakState(uid, () => { if (active) void refreshStreak(); }, () => {
      if (active) setStreakError("No se pudo conectar el historial de rachas.");
    }).then((unsubscribe) => { if (active) stop = unsubscribe; else unsubscribe(); }).catch(() => undefined);
    const refresh = () => { void refreshStreak(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => { active = false; stop?.(); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, [accountKey, uid, refreshStreak]);
  useEffect(() => { if (uid) void refreshStreak(); }, [uid, today, walletSnapshot.earned, refreshStreak]);
  useEffect(() => {
    setNudges([]);
    if (!uid) return;
    let active = true, stop: (() => void) | undefined;
    void watchNudges(sourceUids, (value) => { if (active) setNudges(value); }, () => undefined)
      .then((unsubscribe) => { if (active) stop = unsubscribe; else unsubscribe(); }).catch(() => undefined);
    return () => { active = false; stop?.(); };
  }, [accountKey]);

  useEffect(() => {
    setPreferences(uid ? cachedPreferences(uid) : DEFAULT_PREFERENCES);
    setScene(DEFAULT_SCENE);
    setStored({ activeDays: 0, days: [] });
    setProgressReady(false);
    setWalletSnapshot(EMPTY_WALLET);
    setWalletReady(false);
    setOwned(NOTHING_OWNED);
    if (!uid || !authUid) return;
    let active = true;
    const stops: (() => void)[] = [];
    const keep = (stop: () => void) => { if (active) stops.push(stop); else stop(); };
    void Promise.all([import("./personalStore"), import("../progress/progressStore")]).then(async ([store, progressStore]) => {
      keep(await store.watchPreferences(uid, (value) => { if (active) setPreferences(value); }, () => undefined));
      keep(await store.watchScene(uid, (value) => { if (active) setScene(value); }, () => undefined));
      keep(await progressStore.watchProgress(sourceUids, (value) => {
        if (!active) return;
        setStored({ activeDays: value.activeDays, days: value.days });
        setProgressReady(true);
      }, () => { if (active) setProgressReady(true); }));
      keep(await progressStore.watchWallet(uid, (value) => { if (active) { setWalletSnapshot(value); setWalletReady(true); } }, () => { if (active) setWalletReady(true); }, sourceUids, user?.mergeId ?? ""));
      keep(await progressStore.watchInventory(sourceUids, (value) => { if (active) setOwned(new Set(value)); }, () => undefined));
      // Retry any active day that could not be recorded in a previous session.
      void progressStore.flushProgressQueue(authUid);
    }).catch(() => {
      // A failed load is an answer too: never leave the streak views on placeholders.
      if (active) { setProgressReady(true); setWalletReady(true); }
    });

    const retry = () => { void import("../progress/progressStore").then(({ flushProgressQueue }) => flushProgressQueue(authUid)); };
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    return () => {
      active = false;
      stops.forEach((stop) => stop());
      window.removeEventListener("focus", retry);
      window.removeEventListener("online", retry);
    };
  }, [accountKey, uid, authUid, user?.mergeId]);

  // Streaks and today's points depend on the current UTC day, not only on the stored data:
  // a skipped day resets the current streak even before any new activity.
  const progress = useMemo<ProgressSummary>(() => {
    const protectedDays = streak?.calendar.filter((entry) => entry.kind === "protected").map((entry) => entry.day) ?? [];
    const { current, best } = protectedDays.length ? history(stored.days, protectedDays, today) : streaks(stored.days, today);
    return { activeDays: Math.max(stored.activeDays, stored.days.length), days: stored.days, currentStreak: current,
      bestStreak: Math.max(best, streak?.state.best ?? 0) };
  }, [stored, today, streak]);
  const wallet = useMemo<WalletSummary>(() => ({
    balance: walletSnapshot.balance,
    earned: walletSnapshot.earned,
    spent: walletSnapshot.spent,
    pointsToday: pointsOn(walletSnapshot.recentDays, today),
  }), [walletSnapshot, today]);

  // Short confirmations when this account earns points, registers today's activity or unlocks items.
  const previous = useRef<RewardState | null>(null);
  const pending = useRef<string[]>([]);
  const noticeTimer = useRef(0);
  useEffect(() => {
    previous.current = null;
    pending.current = [];
    window.clearTimeout(noticeTimer.current);
  }, [accountKey]);
  useEffect(() => {
    if (!progressReady || !walletReady) return;
    const state: RewardState = { activeDays: progress.activeDays, days: progress.days, earned: wallet.earned, pointsToday: wallet.pointsToday, currentStreak: progress.currentStreak };
    const notices = rewardNotices(previous.current, state, today);
    previous.current = state;
    if (!notices.length || !onNotice) return;
    pending.current.push(...notices.filter((notice) => !pending.current.includes(notice)));
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => {
      onNotice(pending.current.join(". "));
      pending.current = [];
    }, NOTICE_DELAY_MS);
  }, [progress, wallet, progressReady, walletReady, today, onNotice]);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const reducedMotion = preferences.motion === "reduced" || (preferences.motion === "system" && systemReduced);

  // CSS transitions follow the same resolved setting as GSAP and the canvas scenes.
  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? "reduced" : "full";
  }, [reducedMotion]);

  const savePreferences = useCallback(async (patch: Partial<PersonalPreferences>) => {
    if (!uid) return;
    setPreferences((current) => ({ ...current, ...patch }));
    const { savePreferences: save } = await import("./personalStore");
    await save(uid, patch);
  }, [uid]);

  const saveScene = useCallback(async (selection: SceneSelection) => {
    if (!uid) return;
    const { saveScene: save } = await import("./personalStore");
    await save(uid, selection);
  }, [uid]);

  const purchase = useCallback(async (itemId: string) => {
    if (!uid) return;
    const { purchaseItem } = await import("../progress/progressStore");
    await purchaseItem(uid, itemId, sourceUids);
  }, [uid, sourceUids]);

  const value = useMemo(() => ({ streak, streakError, refreshStreak, nudges, userId: uid, sourceUids, preferences, scene, progress, progressReady, wallet, walletReady, owned, today, reducedMotion, savePreferences, saveScene, purchase }),
    [streak, streakError, refreshStreak, nudges, uid, sourceUids, preferences, scene, progress, progressReady, wallet, walletReady, owned, today, reducedMotion, savePreferences, saveScene, purchase]);
  return <PersonalContext.Provider value={value}>{children}</PersonalContext.Provider>;
}

export function usePersonal() {
  return useContext(PersonalContext);
}
