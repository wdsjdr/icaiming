import { combine } from './combine';
import { beijingDate, dailyNewsKey, isOlderThan, parseDailyNewsKey, shiftDate } from './date';
import { jsonMeta, readExisting, sleep } from './http';
import { githubTrending } from './sources/github';
import { fetchHotboard, parsePlatforms, type HotboardFile } from './sources/hotboard';
import { fetchEpic } from './sources/epic';
import { fetchSayings, mergePool } from './sources/saying';
import { fetchDailyNewsImage } from './sources/daily-news';
import type { Env, Source, SourcedItem, TaskResult } from './types';

const sources: Source[] = [githubTrending];
const weights: Record<string, number> = { github: 1 };

export async function runRankings(env: Env): Promise<TaskResult> {
  const collected: SourcedItem[] = [];
  let failed = 0;
  for (const source of sources) {
    try {
      const items = await source.fetch();
      collected.push(...items.map((item) => ({ ...item, source: source.name })));
    } catch (error) { failed++; console.error(`[rankings:${source.name}]`, error); }
  }
  if (!collected.length) return { task: 'rankings', ok: 0, failed, skipped: true };
  const combined = combine(collected, weights);
  await env.CONTENT_BUCKET.put('rankings/combined.json', JSON.stringify(combined, null, 2), { httpMetadata: jsonMeta });
  return { task: 'rankings', ok: combined.items.length, failed };
}

export async function runHotboard(env: Env): Promise<TaskResult> {
  const platforms = parsePlatforms(env.HOTBOARD_PLATFORMS);
  if (!platforms.length) return { task: 'hotboard', ok: 0, failed: 0, skipped: true };
  const entries: { type: string; label: string; updateAt: string | null; count: number }[] = [];
  let ok = 0; let failed = 0;
  for (const [position, { type, label }] of platforms.entries()) {
    if (position > 0) await sleep(250);
    try {
      const file = await fetchHotboard(env, type);
      await env.CONTENT_BUCKET.put(`misc/hotboard/${type}.json`, JSON.stringify(file, null, 2), { httpMetadata: jsonMeta });
      entries.push({ type, label, updateAt: file.updateAt, count: file.items.length });
      ok++;
    } catch (error) {
      console.error(`[hotboard:${type}]`, error); failed++;
      const existing = await readExisting<HotboardFile>(env, `misc/hotboard/${type}.json`);
      entries.push({ type, label, updateAt: existing?.updateAt ?? null, count: existing?.items.length ?? 0 });
    }
  }
  if (ok === 0) return { task: 'hotboard', ok: 0, failed, skipped: true };
  const index = { updatedAt: new Date().toISOString(), platforms: entries };
  await env.CONTENT_BUCKET.put('misc/hotboard/index.json', JSON.stringify(index, null, 2), { httpMetadata: jsonMeta });
  return { task: 'hotboard', ok, failed };
}

export async function runEpic(env: Env): Promise<TaskResult> {
  const items = await fetchEpic(env);
  // An empty list is treated as a bad response: keep the last good file instead of overwriting it.
  if (!items.length) return { task: 'epic', ok: 0, failed: 0, skipped: true };
  const file = { updatedAt: new Date().toISOString(), items };
  await env.CONTENT_BUCKET.put('misc/epic-free.json', JSON.stringify(file, null, 2), { httpMetadata: jsonMeta });
  return { task: 'epic', ok: items.length, failed: 0 };
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// The newest archived image strictly before `before`, used to spot an upstream response that has not changed.
async function latestNewsDateBefore(env: Env, before: string): Promise<string | null> {
  let latest: string | null = null;
  let cursor: string | undefined;
  do {
    const listed = await env.CONTENT_BUCKET.list({ prefix: 'misc/daily-news/', cursor });
    for (const object of listed.objects) {
      const date = parseDailyNewsKey(object.key);
      if (date && date < before && (!latest || date > latest)) latest = date;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return latest;
}

async function hasSameImage(env: Env, date: string, bytes: ArrayBuffer): Promise<boolean> {
  const object = await env.CONTENT_BUCKET.get(dailyNewsKey(date));
  if (!object || object.size !== bytes.byteLength) return false;
  return (await sha256(await object.arrayBuffer())) === (await sha256(bytes));
}

export async function runDailyNews(env: Env): Promise<TaskResult> {
  const today = beijingDate();
  const key = dailyNewsKey(today);
  let available = Boolean(await env.CONTENT_BUCKET.head(key));
  let stale = false;
  if (!available) {
    // When its live render fails, UAPI keeps serving the last successful image. A fresh response
    // identical to the newest archived image means "not updated yet": skip storing it instead of
    // mislabeling a stale image with today's date. The compensation cron retries later.
    const previous = await latestNewsDateBefore(env, today);
    for (let attempt = 0; attempt < 3 && !available; attempt++) {
      if (attempt > 0) await sleep(1500 * attempt);
      try {
        const image = await fetchDailyNewsImage(env);
        if (previous && await hasSameImage(env, previous, image.bytes)) { stale = true; break; }
        await env.CONTENT_BUCKET.put(key, image.bytes, { httpMetadata: { contentType: image.contentType, cacheControl: 'public, max-age=31536000, immutable' } });
        available = true;
      } catch (error) { console.error('[daily-news]', error); }
    }
  }
  if (!available) return { task: 'daily-news', ok: 0, failed: stale ? 0 : 1, skipped: true };
  // Prune snapshots older than the retention window.
  const retention = Math.max(1, Number(env.NEWS_RETENTION_DAYS) || 365);
  const cutoff = shiftDate(today, -retention);
  let cursor: string | undefined;
  do {
    const listed = await env.CONTENT_BUCKET.list({ prefix: 'misc/daily-news/', cursor });
    for (const object of listed.objects) {
      const date = parseDailyNewsKey(object.key);
      if (date && isOlderThan(date, cutoff)) await env.CONTENT_BUCKET.delete(object.key);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return { task: 'daily-news', ok: 1, failed: 0 };
}

export async function runSaying(env: Env): Promise<TaskResult> {
  const count = Math.max(1, Math.min(50, Number(env.SAYING_COUNT) || 15));
  const cap = Math.max(1, Math.min(200, Number(env.SAYING_POOL) || 60));
  const incoming = await fetchSayings(env, count);
  const existing = await readExisting<{ items?: string[] }>(env, 'misc/saying.json');
  const items = mergePool(existing?.items, incoming, cap);
  if (!items.length) return { task: 'saying', ok: 0, failed: incoming.length ? 0 : 1, skipped: true };
  const file = { updatedAt: new Date().toISOString(), items };
  await env.CONTENT_BUCKET.put('misc/saying.json', JSON.stringify(file, null, 2), { httpMetadata: jsonMeta });
  return { task: 'saying', ok: incoming.length, failed: 0 };
}