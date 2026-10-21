import { assets, autoIds, clickIds, type AssetId } from './assets';

// Stable across MPA navigations and deployments. These are request-accounting budgets,
// not a promise about bytes transferred on the wire (even HTTP cache hits reserve bytes).
export const SESSION_KEY = 'site-pet-session';
export const PREFERENCE_KEY = 'site-pet-visibility';
export const AUTO_LIMIT = 3 * 1048576;
export const TOTAL_LIMIT = 8 * 1048576;
export const FAILURE_LIMIT = 3;
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function guardStorage(storage: StorageLike): StorageLike {
  let failed = false;
  return {
    getItem(key) {
      if (failed) throw new Error('Pet session storage previously failed');
      try { return storage.getItem(key); } catch (error) { failed = true; throw error; }
    },
    setItem(key, value) {
      if (failed) throw new Error('Pet session storage previously failed');
      try { storage.setItem(key, value); } catch (error) { failed = true; throw error; }
    },
  };
}
export interface PetSession {
  version: 1; autoBytes: number; totalBytes: number; failures: number; cooldown: number;
  autoPool: AssetId[]; clickPool: AssetId[]; lastAuto: AssetId | null; lastClick: AssetId | null;
}
export function choose<T>(pool: readonly T[], previous: T | null, random = Math.random): T | undefined {
  const candidates = pool.filter((value) => value !== previous);
  const available = candidates.length ? candidates : pool;
  return available[Math.min(available.length - 1, Math.max(0, Math.floor(random() * available.length)))];
}
function newSession(random: () => number): PetSession {
  const first = choose(clickIds, null, random)!;
  return { version: 1, autoBytes: 0, totalBytes: 0, failures: 0, cooldown: 0,
    autoPool: [choose(autoIds, null, random)!], clickPool: [first, choose(clickIds, first, random)!], lastAuto: null, lastClick: null };
}
function validPool(value: unknown, allowed: readonly string[], length: number): value is AssetId[] {
  return Array.isArray(value) && value.length === length && new Set(value).size === length
    && value.every((id) => typeof id === 'string' && allowed.includes(id));
}
function valid(value: unknown): value is PetSession {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return s.version === 1 && Number.isSafeInteger(s.autoBytes) && Number(s.autoBytes) >= 0 && Number(s.autoBytes) <= AUTO_LIMIT
    && Number.isSafeInteger(s.totalBytes) && Number(s.totalBytes) >= Number(s.autoBytes) && Number(s.totalBytes) <= TOTAL_LIMIT
    && Number.isSafeInteger(s.failures) && Number(s.failures) >= 0 && Number(s.failures) <= FAILURE_LIMIT
    && Number.isSafeInteger(s.cooldown) && Number(s.cooldown) >= 0
    && validPool(s.autoPool, autoIds, 1) && validPool(s.clickPool, clickIds, 2)
    && (s.lastAuto === null || s.autoPool.includes(s.lastAuto as AssetId))
    && (s.lastClick === null || s.clickPool.includes(s.lastClick as AssetId));
}
export function readSession(storage: StorageLike, random = Math.random): PetSession | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (raw !== null) { const value: unknown = JSON.parse(raw); return valid(value) ? value : null; }
    const session = newSession(random);
    storage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  } catch { return null; }
}
export function candidate(storage: StorageLike, kind: 'auto' | 'click', random = Math.random): AssetId | undefined {
  const s = readSession(storage);
  if (!s) return;
  return choose(kind === 'auto' ? s.autoPool : s.clickPool, kind === 'auto' ? s.lastAuto : s.lastClick, random);
}
export function reserve(storage: StorageLike, id: AssetId, kind: 'auto' | 'click', now = Date.now()): boolean {
  // Always reread immediately before fetch; never flush an old in-memory BFCache snapshot.
  const s = readSession(storage);
  if (!s || s.failures >= FAILURE_LIMIT || now < s.cooldown || !(kind === 'auto' ? s.autoPool : s.clickPool).includes(id)) return false;
  const bytes = assets[id].bytes;
  if (s.totalBytes + bytes > TOTAL_LIMIT || (kind === 'auto' && s.autoBytes + bytes > AUTO_LIMIT)) return false;
  s.totalBytes += bytes;
  if (kind === 'auto') { s.autoBytes += bytes; s.lastAuto = id; } else s.lastClick = id;
  try { storage.setItem(SESSION_KEY, JSON.stringify(s)); return true; } catch { return false; }
}
export function markSelected(storage: StorageLike, id: AssetId, kind: 'auto' | 'click') {
  const s = readSession(storage);
  if (!s || !(kind === 'auto' ? s.autoPool : s.clickPool).includes(id)) return;
  if (kind === 'auto') s.lastAuto = id; else s.lastClick = id;
  try { storage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* The guarded adapter disables future optional requests. */ }
}
export function recordFailure(storage: StorageLike, now = Date.now()) {
  const s = readSession(storage);
  if (!s) return;
  s.failures = Math.min(FAILURE_LIMIT, s.failures + 1);
  s.cooldown = now + 60_000;
  try { storage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* Further reservations fail closed. */ }
}
