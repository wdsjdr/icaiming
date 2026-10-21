import { clamp } from './geometry';
import { PREFERENCE_KEY, type StorageLike } from './session';
export const LAYOUT_KEY = 'site-pet-layout-v1';
export type PetMode = 'hidden' | 'collapsed' | 'expanded';
export interface LayoutPreferences { version: 1; mode: PetMode; height: number; autoWalk: boolean; x: number; y: number }
export function defaults(desktop: boolean): LayoutPreferences {
  return { version: 1, mode: 'collapsed', height: desktop ? 120 : 96, autoWalk: true, x: .12, y: .92 };
}
export function parseLayout(raw: string | null, desktop: boolean): LayoutPreferences | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const p = value as Record<string, unknown>;
    if (p.version !== 1 || !['hidden', 'collapsed', 'expanded'].includes(String(p.mode)) || typeof p.autoWalk !== 'boolean'
      || ![p.height, p.x, p.y].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
    return { ...defaults(desktop), mode: p.mode as PetMode, autoWalk: p.autoWalk, height: clamp(Number(p.height), 80, 180), x: clamp(Number(p.x), 0, 1), y: clamp(Number(p.y), 0, 1) };
  } catch { return null; }
}
export function readLayout(storage: StorageLike, desktop: boolean) {
  try {
    const preference = storage.getItem(PREFERENCE_KEY);
    const raw = storage.getItem(LAYOUT_KEY);
    const parsed = parseLayout(raw, desktop);
    const prefs = parsed ?? defaults(desktop);
    if (preference === 'off') prefs.mode = 'hidden';
    return { prefs, remembered: raw !== null || preference === 'off', storageOK: true };
  } catch { return { prefs: defaults(desktop), remembered: true, storageOK: false }; }
}
export function writeLayout(storage: StorageLike, prefs: LayoutPreferences) {
  try { storage.setItem(LAYOUT_KEY, JSON.stringify(prefs)); storage.setItem(PREFERENCE_KEY, prefs.mode === 'hidden' ? 'off' : 'on'); } catch { /* Page-local controls still work. */ }
}
