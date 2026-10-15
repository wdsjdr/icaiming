import type { Env } from '../types';

// Kept in sync with the UA in ../http.ts (not exported there): the friend's server sees who is calling.
const USER_AGENT = 'ic-aiming-aggregator/1.0 (+https://github.com/wdsjdr/icaiming)';

export interface SteamDeal {
  appid: number; nameEn: string; nameZh: string; url: string;
  capsule: string; header: string; original: number; final: number;
  discount: number; reviewText: string; reviewPercent: number | null;
  reviewCount: number; rating: number | null; isLow: boolean; isNewLow: boolean;
  lowPrice: number | null; endsAt: string | null;
}

const number = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const text = (value: unknown) => (value == null ? '' : String(value).trim());
// Prices arrive in 分 (cents); the site works in 元.
const yuan = (cents: number) => Math.round(cents) / 100;

// The Steam API mixes cents, 0/1 flags and unix seconds; clean once so everything downstream
// (merge, JSON, zod schema on the site) sees stable types. Invalid entries return null.
export function cleanSteamDeal(raw: unknown): SteamDeal | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const appid = number(row.appid);
  if (appid === null || !Number.isInteger(appid) || appid <= 0) return null;
  const nameEn = text(row.name_en);
  const nameZh = text(row.name_zh);
  if (!nameEn && !nameZh) return null;
  const url = text(row.store_url);
  if (!/^https?:\/\//.test(url)) return null;
  const original = number(row.original_price);
  const final = number(row.final_price);
  if (original === null || final === null || original < 0 || final < 0) return null;
  const reviewPercent = number(row.review_percent);
  const reviewCount = number(row.review_count);
  const lowCents = number(row.historical_low_price);
  const endSeconds = number(row.discount_end);
  return {
    appid, nameEn, nameZh, url,
    capsule: text(row.capsule_url), header: text(row.header_url),
    original: yuan(original), final: yuan(final),
    discount: Math.min(100, Math.max(0, Math.round(number(row.discount_percent) ?? 0))),
    reviewText: text(row.review_text),
    reviewPercent: reviewPercent !== null && reviewPercent >= 0 && reviewPercent <= 100 ? Math.round(reviewPercent) : null,
    reviewCount: reviewCount !== null && reviewCount > 0 ? Math.round(reviewCount) : 0,
    rating: number(row.deal_rating),
    isLow: number(row.is_historical_low) === 1,
    isNewLow: number(row.is_new_historical_low) === 1,
    lowPrice: lowCents !== null && lowCents > 0 ? yuan(lowCents) : null,
    endsAt: endSeconds !== null && endSeconds > 0 ? new Date(endSeconds * 1000).toISOString() : null,
  };
}

// Dedupe by appid: keep the first list's prices, keep whichever list knows an all-time low,
// then take the top 500 by discount and review count.
export function mergeSteamDeals(lists: SteamDeal[][]): SteamDeal[] {
  const merged = new Map<number, SteamDeal>();
  for (const list of lists) {
    for (const item of list) {
      const known = merged.get(item.appid);
      if (!known) { merged.set(item.appid, item); continue; }
      known.isLow ||= item.isLow;
      known.isNewLow ||= item.isNewLow;
      const lows = [known.lowPrice, item.lowPrice].filter((value): value is number => value !== null);
      known.lowPrice = lows.length ? Math.min(...lows) : null;
    }
  }
  return [...merged.values()]
    .sort((a, b) => b.discount - a.discount || b.reviewCount - a.reviewCount)
    .slice(0, 500);
}

interface DealsPayload { deals?: unknown[]; meta?: { last_updated?: number } }

async function getDeals(base: string, query: string): Promise<DealsPayload> {
  const response = await fetch(`${base}/api/deals?${query}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Steam API ${query} 返回 ${response.status}`);
  return response.json<DealsPayload>();
}

// Exactly two GETs a day: the current high-discount board, plus every all-time low. The friend's
// server also exposes POST /api/sync* — never call those, and never poll harder than this.
export async function fetchSteamDeals(env: Env): Promise<{ items: SteamDeal[]; sourceUpdatedAt: string | null }> {
  const base = (env.STEAM_API_BASE ?? '').replace(/\/+$/, '');
  const top = await getDeals(base, 'sort=discount&min_discount=60&min_reviews=20&limit=500');
  let lows: DealsPayload = {};
  try {
    lows = await getDeals(base, 'hist_low=1&sort=discount&limit=500');
  } catch (error) {
    console.warn('[steam-deals] hist_low 榜单获取失败，仅使用高折扣榜单', error);
  }
  const topItems = (top.deals ?? []).map(cleanSteamDeal).filter((item): item is SteamDeal => item !== null);
  const lowItems = (lows.deals ?? []).map(cleanSteamDeal).filter((item): item is SteamDeal => item !== null);
  const updated = number(top.meta?.last_updated);
  return {
    items: mergeSteamDeals([topItems, lowItems]),
    sourceUpdatedAt: updated !== null && updated > 0 ? new Date(updated * 1000).toISOString() : null,
  };
}
