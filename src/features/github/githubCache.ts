/**
 * In-memory cache of GitHub answers for this tab. Mutable resources (branches,
 * commits, pull requests) stay fresh for a short while and are then revalidated
 * with `If-None-Match`; GitHub answers 304 without a body when nothing changed.
 * Trees and blobs are addressed by SHA, never change, and are never refetched.
 * Keys use a fingerprint of the token, never the token itself.
 */

export interface CacheEntry {
  path: string;
  etag: string;
  data: unknown;
  link: Record<string, string>;
  at: number;
  bytes: number;
  immutable: boolean;
}

export const FRESH_MS = 30_000;
const MAX_ENTRIES = 300;
const MAX_BYTES = 25 * 1024 * 1024;

const entries = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
let totalBytes = 0;
const resetHandlers = new Set<() => void>();

/** FNV-1a: enough to tell accounts apart without keeping the token. */
export function tokenFingerprint(token: string) {
  if (!token) return "anon";
  let hash = 0x811c9dc5;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function cacheKey(fingerprint: string, accept: string, path: string) {
  return `${fingerprint}|${accept}|${path}`;
}

export function readEntry(key: string) {
  const entry = entries.get(key);
  if (!entry) return undefined;
  // Least recently used goes first: re-insert on every read.
  entries.delete(key);
  entries.set(key, entry);
  return entry;
}

export function writeEntry(key: string, entry: CacheEntry) {
  const previous = entries.get(key);
  if (previous) { totalBytes -= previous.bytes; entries.delete(key); }
  entries.set(key, entry);
  totalBytes += entry.bytes;
  for (const [oldest, value] of entries) {
    if (entries.size <= MAX_ENTRIES && totalBytes <= MAX_BYTES) break;
    if (oldest === key) continue;
    entries.delete(oldest);
    totalBytes -= value.bytes;
  }
}

export function isFresh(entry: CacheEntry, now = Date.now()) {
  return entry.immutable || now - entry.at < FRESH_MS;
}

/** Concurrent identical requests share one network call. */
export function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const promise = run().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/** Forgets the mutable answers of one repository, after creating or deleting a branch. */
export function invalidateRepo(repo: string) {
  const prefix = `/repos/${repo}`;
  for (const [key, entry] of entries) {
    if (entry.immutable || !(entry.path === prefix || entry.path.startsWith(`${prefix}/`) || entry.path.startsWith(`${prefix}?`))) continue;
    entries.delete(key);
    totalBytes -= entry.bytes;
  }
}

/** Runs when the token goes away (sign-out, unlink, 401): other stores drop what they showed. */
export function onGitHubReset(handler: () => void) {
  resetHandlers.add(handler);
  return () => { resetHandlers.delete(handler); };
}

export function clearGitHubCache() {
  entries.clear();
  inflight.clear();
  totalBytes = 0;
  limits.clear();
  resetHandlers.forEach((handler) => handler());
}

// ─── Rate limit ─────────────────────────────────────────────────────────────

export interface RateLimit { remaining: number; limit: number; reset: number }
const limits = new Map<string, RateLimit>();

export function recordRateLimit(fingerprint: string, headers: Pick<Headers, "get">) {
  const remaining = Number(headers.get("x-ratelimit-remaining"));
  const limit = Number(headers.get("x-ratelimit-limit"));
  const reset = Number(headers.get("x-ratelimit-reset"));
  if (!headers.get("x-ratelimit-remaining") || !Number.isFinite(remaining) || !Number.isFinite(reset)) return;
  limits.set(fingerprint, { remaining, limit: Number.isFinite(limit) ? limit : 0, reset });
}

export function rateLimitFor(fingerprint: string): RateLimit | null {
  return limits.get(fingerprint) ?? null;
}

/** While GitHub says no requests are left, new ones are not sent until the reset time. */
export function blockedRateLimit(fingerprint: string, now = Date.now()): RateLimit | null {
  const limit = limits.get(fingerprint);
  if (!limit || limit.remaining > 0) return null;
  if (limit.reset * 1000 <= now) { limits.delete(fingerprint); return null; }
  return limit;
}
