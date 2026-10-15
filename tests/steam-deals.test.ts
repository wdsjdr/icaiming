import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSteamDeal, mergeSteamDeals, type SteamDeal } from '../workers/aggregator/src/sources/steam-deals';
import { runSteamDeals } from '../workers/aggregator/src/tasks';
import type { Env } from '../workers/aggregator/src/types';

const STORE = 'https://store.steampowered.com/app/';

const raw = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  appid: 447040, name_en: 'Watch_Dogs 2', name_zh: '', store_url: `${STORE}447040`,
  capsule_url: 'https://cdn.example/capsule.jpg', header_url: 'https://cdn.example/header.jpg',
  original_price: 29800, final_price: 1490, discount_percent: 95, review_text: 'Very Positive',
  review_percent: 81, review_count: 27986, deal_rating: 6.8,
  is_historical_low: 0, is_new_historical_low: 0, historical_low_price: 1490, discount_end: null,
  ...overrides,
});

test('cleanSteamDeal converts cents to yuan, 0/1 flags and unix seconds to an ISO instant', () => {
  const item = cleanSteamDeal(raw({ is_historical_low: 1, discount_end: 1793000000 }));
  assert.ok(item);
  assert.equal(item.original, 298);
  assert.equal(item.final, 14.9);
  assert.equal(item.discount, 95);
  assert.equal(item.isLow, true);
  assert.equal(item.isNewLow, false);
  assert.equal(item.lowPrice, 14.9);
  assert.equal(item.endsAt, new Date(1793000000 * 1000).toISOString());
});

test('cleanSteamDeal normalises unknown lows, missing end times and clamps the discount', () => {
  const item = cleanSteamDeal(raw({ historical_low_price: 0, discount_end: 0, discount_percent: 130, name_zh: '看门狗 2' }));
  assert.ok(item);
  assert.equal(item.lowPrice, null);
  assert.equal(item.endsAt, null);
  assert.equal(item.discount, 100);
  assert.equal(item.nameZh, '看门狗 2');
});

test('cleanSteamDeal drops entries without appid, names, a web store link or sane prices', () => {
  assert.equal(cleanSteamDeal(null), null);
  assert.equal(cleanSteamDeal('nope'), null);
  assert.equal(cleanSteamDeal(raw({ appid: 0 })), null);
  assert.equal(cleanSteamDeal(raw({ name_en: '', name_zh: '' })), null);
  assert.equal(cleanSteamDeal(raw({ store_url: 'ftp://example.com/app' })), null);
  assert.equal(cleanSteamDeal(raw({ final_price: -1 })), null);
});

function deal(appid: number, discount: number, reviewCount: number, extra: Partial<SteamDeal> = {}): SteamDeal {
  return {
    appid, nameEn: `Game ${appid}`, nameZh: '', url: `${STORE}${appid}`, capsule: '', header: '',
    original: 100, final: 10, discount, reviewText: '', reviewPercent: null, reviewCount,
    rating: null, isLow: false, isNewLow: false, lowPrice: null, endsAt: null, ...extra,
  };
}

test('mergeSteamDeals dedupes by appid, ORs low flags, keeps first-list prices and caps at 500', () => {
  const first = [deal(1, 90, 100), deal(2, 80, 20)];
  const second = [deal(1, 60, 5, { isLow: true, isNewLow: true, lowPrice: 3 }), deal(3, 95, 2)];
  const merged = mergeSteamDeals([first, second]);
  assert.deepEqual(merged.map((item) => item.appid), [3, 1, 2]);
  const one = merged.find((item) => item.appid === 1)!;
  assert.equal(one.discount, 90);
  assert.equal(one.isLow, true);
  assert.equal(one.isNewLow, true);
  assert.equal(one.lowPrice, 3);
  const many = Array.from({ length: 600 }, (_, index) => ({ ...deal(index + 1, 100 - (index % 50), 1) }));
  const capped = mergeSteamDeals([many]);
  assert.equal(capped.length, 500);
  assert.equal(capped[0].discount, 100);
});

function fakeBucket(calls: string[], written: string[] = []) {
  return {
    put: async (key: string, body: string) => { calls.push(`put:${key}`); written.push(body); return null; },
    get: async () => { calls.push('get'); throw new Error('unexpected R2 get'); },
    head: async () => { calls.push('head'); throw new Error('unexpected R2 head'); },
    list: async () => { calls.push('list'); throw new Error('unexpected R2 list'); },
    delete: async () => { calls.push('delete'); throw new Error('unexpected R2 delete'); },
  } as unknown as Env['CONTENT_BUCKET'];
}

const makeEnv = (overrides: Partial<Env> = {}, calls: string[] = [], written: string[] = []): Env =>
  ({ CONTENT_BUCKET: fakeBucket(calls, written), ...overrides } as Env);

async function withFetch<T>(stub: (url: string) => Response, body: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => stub(String(input))) as typeof fetch;
  try { return await body(); } finally { globalThis.fetch = original; }
}

test('runSteamDeals skips without STEAM_API_BASE and never touches R2', async () => {
  const calls: string[] = [];
  const result = await runSteamDeals(makeEnv({}, calls));
  assert.deepEqual(result, { task: 'steam-deals', ok: 0, failed: 0, skipped: true });
  assert.deepEqual(calls, []);
});

test('runSteamDeals reports a failure without writing when the API is down', async () => {
  const calls: string[] = [];
  const result = await withFetch(() => new Response('boom', { status: 500 }), () =>
    runSteamDeals(makeEnv({ STEAM_API_BASE: 'http://steam.test' }, calls)));
  assert.deepEqual(result, { task: 'steam-deals', ok: 0, failed: 1 });
  assert.deepEqual(calls, []);
});

test('runSteamDeals skips empty boards and keeps the last file', async () => {
  const calls: string[] = [];
  const result = await withFetch(() => Response.json({ deals: [] }), () =>
    runSteamDeals(makeEnv({ STEAM_API_BASE: 'http://steam.test' }, calls)));
  assert.deepEqual(result, { task: 'steam-deals', ok: 0, failed: 0, skipped: true });
  assert.deepEqual(calls, []);
});

test('runSteamDeals merges both boards and writes one JSON file', async () => {
  const calls: string[] = [];
  const written: string[] = [];
  const requested: string[] = [];
  const result = await withFetch((url) => {
    requested.push(url);
    if (url.includes('hist_low=1')) {
      return Response.json({ deals: [raw({
        appid: 632470, name_en: 'Disco Elysium', store_url: `${STORE}632470`,
        original_price: 11600, final_price: 2900, discount_percent: 75, is_new_historical_low: 1, historical_low_price: 2900,
      })] });
    }
    return Response.json({ meta: { last_updated: 1792002898 }, deals: [
      raw(),
      raw({ appid: 632470, name_en: 'Disco Elysium', store_url: `${STORE}632470`, original_price: 11600, final_price: 2900, discount_percent: 75 }),
    ] });
  }, () => runSteamDeals(makeEnv({ STEAM_API_BASE: 'http://steam.test' }, calls, written)));

  assert.equal(result.ok, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'put:misc/steam-deals.json');
  const file = JSON.parse(written[0]) as {
    updatedAt: string; sourceUpdatedAt: string | null;
    items: { appid: number; isNewLow: boolean }[];
  };
  assert.ok(!Number.isNaN(Date.parse(file.updatedAt)));
  assert.equal(file.sourceUpdatedAt, new Date(1792002898 * 1000).toISOString());
  assert.deepEqual(file.items.map((item) => item.appid).sort((a, b) => a - b), [447040, 632470]);
  assert.equal(file.items.find((item) => item.appid === 632470)!.isNewLow, true);
  assert.ok(requested.some((url) => url.includes('min_discount=60') && url.includes('min_reviews=20')));
  assert.ok(requested.some((url) => url.includes('hist_low=1')));
});

test('runSteamDeals still stores the top list when only the hist_low board fails', async () => {
  const calls: string[] = [];
  const written: string[] = [];
  const result = await withFetch((url) => (url.includes('hist_low=1')
    ? new Response('boom', { status: 500 })
    : Response.json({ deals: [raw()] })),
    () => runSteamDeals(makeEnv({ STEAM_API_BASE: 'http://steam.test' }, calls, written)));

  assert.equal(result.ok, 1);
  assert.deepEqual(calls, ['put:misc/steam-deals.json']);
  const file = JSON.parse(written[0]) as { items: { appid: number }[] };
  assert.deepEqual(file.items.map((item) => item.appid), [447040]);
});
