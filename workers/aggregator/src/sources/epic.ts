import { uapi } from '../http';
import type { Env } from '../types';

export interface EpicEntry {
  id: string; title: string; cover?: string;
  originalPrice?: number; originalPriceDesc: string; description: string; seller: string;
  isFreeNow: boolean; freeStartAt?: number; freeEndAt?: number;
  freeStart?: string; freeEnd?: string; link: string;
}

const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const text = (value: unknown) => (value == null ? '' : String(value).trim());

export interface EpicPayload { data?: Record<string, unknown>[] }

export function mapEpic(data: EpicPayload): EpicEntry[] {
  return (data.data ?? []).map((row): EpicEntry => {
    const cover = typeof row.cover === 'string' && /^https?:\/\//.test(row.cover) ? row.cover : undefined;
    const entry: EpicEntry = {
      id: text(row.id) || text(row.title), title: text(row.title),
      originalPriceDesc: text(row.original_price_desc), description: text(row.description),
      seller: text(row.seller), isFreeNow: row.is_free_now !== false, link: text(row.link),
    };
    if (cover) entry.cover = cover;
    const price = number(row.original_price); if (price !== undefined) entry.originalPrice = price;
    const startAt = number(row.free_start_at); if (startAt !== undefined) entry.freeStartAt = startAt;
    const endAt = number(row.free_end_at); if (endAt !== undefined) entry.freeEndAt = endAt;
    const start = text(row.free_start); if (start) entry.freeStart = start;
    const end = text(row.free_end); if (end) entry.freeEnd = end;
    return entry;
  }).filter((item) => item.id && item.title && /^https?:\/\//.test(item.link));
}

export async function fetchEpic(env: Env): Promise<EpicEntry[]> {
  return mapEpic(await uapi<EpicPayload>(env, '/game/epic-free'));
}