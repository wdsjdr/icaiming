import { uapi } from '../http';
import type { Env } from '../types';

export interface HotboardEntry { index: number; title: string; hotValue: string; url: string; cover?: string }
export interface HotboardFile { type: string; updateAt: string | null; items: HotboardEntry[] }
export interface Platform { type: string; label: string }

export function parsePlatforms(value?: string): Platform[] {
  return (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const split = entry.indexOf(':');
    const type = (split === -1 ? entry : entry.slice(0, split)).trim();
    const label = (split === -1 ? entry : entry.slice(split + 1)).trim();
    return { type, label: label || type };
  }).filter((platform) => Boolean(platform.type));
}

export interface HotboardPayload { update_time?: string; list?: Record<string, unknown>[] }

export const DEFAULT_HOTBOARD_LIMIT = 50;

export function mapHotboard(type: string, data: HotboardPayload, now = new Date(), limit = DEFAULT_HOTBOARD_LIMIT): HotboardFile {
  const items: HotboardEntry[] = [];
  (data.list ?? []).forEach((row, position) => {
    const title = String(row.title ?? '').trim();
    const url = String(row.url ?? '');
    if (!title || !/^https?:\/\//.test(url)) return;
    const cover = typeof row.cover === 'string' && /^https?:\/\//.test(row.cover) ? row.cover : undefined;
    const entry: HotboardEntry = { index: Number(row.index) > 0 ? Number(row.index) : position + 1, title, hotValue: row.hot_value == null ? '' : String(row.hot_value), url };
    if (cover) entry.cover = cover;
    items.push(entry);
  });
  return { type, updateAt: data.update_time ?? now.toISOString(), items: items.slice(0, Math.max(1, limit)) };
}

export async function fetchHotboard(env: Env, type: string): Promise<HotboardFile> {
  const limit = Number(env.HOTBOARD_LIMIT) || DEFAULT_HOTBOARD_LIMIT;
  const data = await uapi<HotboardPayload>(env, `/misc/hotboard?type=${encodeURIComponent(type)}`);
  return mapHotboard(type, data, new Date(), limit);
}