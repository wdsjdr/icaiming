import type { CombinedRanking, RankingItem, SourcedItem } from './types';

const round = (value: number) => Math.round(value * 100) / 100;

export function combine(items: SourcedItem[], weights: Record<string, number>, limit = 30): CombinedRanking {
  const bySource = new Map<string, SourcedItem[]>();
  for (const item of items) {
    const list = bySource.get(item.source) ?? [];
    list.push(item);
    bySource.set(item.source, list);
  }
  const merged = new Map<string, { base: SourcedItem; scores: Record<string, number>; weighted: number; totalWeight: number }>();
  for (const [source, list] of bySource) {
    const weight = weights[source] ?? 1;
    const max = list.reduce((value, item) => Math.max(value, item.raw), 0) || 1;
    for (const item of list) {
      const score = Math.min(1, Math.max(0, item.raw / max));
      const entry = merged.get(item.key) ?? { base: item, scores: {}, weighted: 0, totalWeight: 0 };
      entry.scores[source] = round(score);
      entry.weighted += score * weight;
      entry.totalWeight += weight;
      if (!entry.base.url && item.url) entry.base = item;
      merged.set(item.key, entry);
    }
  }
  const ranked: RankingItem[] = [...merged.values()]
    .map((entry) => ({
      rank: 0,
      name: entry.base.name,
      vendor: entry.base.vendor,
      score: round(entry.totalWeight ? entry.weighted / entry.totalWeight : 0),
      raw: entry.base.raw,
      sources: entry.scores,
      url: entry.base.url,
      tags: entry.base.tags,
    }))
    .sort((a, b) => b.score - a.score || (b.raw ?? 0) - (a.raw ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  return { updatedAt: new Date().toISOString(), weights, items: ranked };
}