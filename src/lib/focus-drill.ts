// Pure logic for the dot drill (聚焦练习). Kept free of DOM access so it can be unit-tested.

export const DRILL_DURATION_MS = 60_000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Difficulty ramps linearly over the round: targets shrink and expire sooner. */
export function drillProfile(elapsedMs: number) {
  const t = clamp(elapsedMs / DRILL_DURATION_MS, 0, 1);
  return { size: Math.round(60 - 28 * t), life: Math.round(1800 - 1000 * t) };
}

export interface DrillResult {
  hits: number;
  /** Mean reaction time in ms, 0 when there were no hits. */
  average: number;
  /** Fastest reaction in ms, 0 when there were no hits. */
  fastest: number;
  /** hits / (hits + misses), 0 when nothing has spawned yet. */
  accuracy: number;
}

export function summarize(reactions: number[], misses: number): DrillResult {
  const hits = reactions.length;
  const total = hits + misses;
  const sum = reactions.reduce((acc, value) => acc + value, 0);
  return {
    hits,
    average: hits ? Math.round(sum / hits) : 0,
    fastest: hits ? Math.round(Math.min(...reactions)) : 0,
    accuracy: total ? hits / total : 0,
  };
}

export type DrillRecord = Pick<DrillResult, 'hits' | 'average' | 'accuracy'>;

/** More hits wins; on equal hits, the lower average reaction time wins. */
export function isBetterRecord(next: DrillRecord, previous: DrillRecord | null): boolean {
  if (!previous) return true;
  if (next.hits !== previous.hits) return next.hits > previous.hits;
  return next.average < previous.average;
}

export function parseRecord(raw: string | null): DrillRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<DrillRecord> | null;
    if (value && typeof value.hits === 'number' && typeof value.average === 'number' && typeof value.accuracy === 'number') {
      return { hits: value.hits, average: value.average, accuracy: value.accuracy };
    }
  } catch { /* Corrupt storage is treated as "no record". */ }
  return null;
}

/**
 * Chooses the next target centre inside a stage of the given size. Each pick tries to land at
 * least 30% of the short side away from the previous one, so consecutive targets force a flick.
 */
export function pickSpot(width: number, height: number, size: number, last: { x: number; y: number } | null, random: () => number = Math.random) {
  const margin = size / 2 + 12;
  const maxX = Math.max(margin, width - margin);
  const maxY = Math.max(margin, height - margin);
  const minDistance = Math.min(width, height) * 0.3;
  let spot = { x: margin, y: margin };
  for (let attempt = 0; attempt < 12; attempt++) {
    spot = { x: margin + random() * (maxX - margin), y: margin + random() * (maxY - margin) };
    if (!last || Math.hypot(spot.x - last.x, spot.y - last.y) >= minDistance) break;
  }
  return spot;
}
