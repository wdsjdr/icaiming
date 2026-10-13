import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { isAuthorized, schedule, tasksByName } from '../workers/aggregator/src/index';
import { runEpic } from '../workers/aggregator/src/tasks';
import type { Env } from '../workers/aggregator/src/types';

const TOKEN = 'test-run-token';

// R2 stand-in that records writes and fails loudly on reads we did not expect.
function fakeBucket(calls: string[] = []) {
  const unexpected = async (op: string) => { calls.push(op); throw new Error(`unexpected R2 ${op}`); };
  return {
    put: async (key: string) => { calls.push(`put:${key}`); return null; },
    get: () => unexpected('get'),
    head: () => unexpected('head'),
    list: () => unexpected('list'),
    delete: () => unexpected('delete'),
  };
}

function makeEnv(overrides: Partial<Env> = {}, calls?: string[]): Env {
  return { CONTENT_BUCKET: fakeBucket(calls) as unknown as Env['CONTENT_BUCKET'], RUN_TOKEN: TOKEN, ...overrides };
}

function makeCtx() {
  const pending: Promise<unknown>[] = [];
  return { pending, ctx: { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext };
}

async function withFetch<T>(stub: (url: string) => Response, body: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => stub(String(input))) as typeof fetch;
  try { return await body(); } finally { globalThis.fetch = original; }
}

const runRequest = (query: string, init: RequestInit = {}) =>
  new Request(`https://agg.example/run${query}`, init);

const bearer = { Authorization: `Bearer ${TOKEN}` };

test('wrangler.toml cron triggers match the schedule map exactly', () => {
  const toml = readFileSync(new URL('../workers/aggregator/wrangler.toml', import.meta.url), 'utf8');
  const block = /crons\s*=\s*\[([^\]]*)\]/.exec(toml);
  assert.ok(block, 'crons not found in wrangler.toml');
  const crons = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...schedule.keys()].sort(), crons.sort());
  assert.equal(crons.length, 4);
});

test('each cron runs the intended tasks and every task is reachable by name', () => {
  const names = (cron: string) => schedule.get(cron)!.map((task) => task.name);
  assert.deepEqual(names('0 */6 * * *'), ['runRankings', 'runHotboard']);
  assert.deepEqual(names('0 1 * * *'), ['runDailyNews', 'runEpic']);
  assert.deepEqual(names('30 1 * * *'), ['runSaying']);
  assert.deepEqual(names('0 5 * * *'), ['runDailyNews']);
  assert.deepEqual([...tasksByName.keys()].sort(), ['daily-news', 'epic', 'hotboard', 'rankings', 'saying']);
});

test('unknown cron expression runs nothing and touches no storage', async () => {
  const calls: string[] = [];
  const { pending, ctx } = makeCtx();
  await worker.scheduled({ cron: '15 3 * * *', scheduledTime: Date.now(), noRetry() {} } as unknown as ScheduledController, makeEnv({}, calls), ctx);
  await Promise.all(pending);
  assert.equal(pending.length, 0);
  assert.deepEqual(calls, []);
});

test('known cron schedules its tasks through waitUntil', async () => {
  const { pending, ctx } = makeCtx();
  await withFetch(() => new Response('nope', { status: 500 }), async () => {
    await worker.scheduled({ cron: '0 5 * * *', scheduledTime: Date.now(), noRetry() {} } as unknown as ScheduledController, makeEnv(), ctx);
    await Promise.all(pending);
  });
  assert.equal(pending.length, 1);
});

test('/run returns 503 when RUN_TOKEN is not configured, even with a bearer header', async () => {
  const calls: string[] = [];
  const res = await worker.fetch(runRequest('?task=epic', { headers: bearer }), makeEnv({ RUN_TOKEN: undefined }, calls));
  assert.equal(res.status, 503);
  assert.deepEqual(calls, []);
});

test('/run rejects missing, wrong and query-string tokens with 401', async () => {
  const env = makeEnv();
  assert.equal((await worker.fetch(runRequest('?task=epic'), env)).status, 401);
  assert.equal((await worker.fetch(runRequest('?task=epic', { headers: { Authorization: 'Bearer wrong' } }), env)).status, 401);
  assert.equal((await worker.fetch(runRequest(`?task=epic&token=${TOKEN}`), env)).status, 401);
  assert.equal((await worker.fetch(runRequest('?task=epic', { headers: { Authorization: TOKEN } }), env)).status, 401);
});

test('/run requires a task parameter and an allowed name', async () => {
  const env = makeEnv();
  const missing = await worker.fetch(runRequest('', { headers: bearer }), env);
  assert.equal(missing.status, 400);
  assert.match(await missing.text(), /rankings, hotboard, daily-news, epic, saying/);
  assert.equal((await worker.fetch(runRequest('?task=all', { headers: bearer }), env)).status, 400);
  assert.equal((await worker.fetch(runRequest('?task=constructor', { headers: bearer }), env)).status, 400);
  assert.equal((await worker.fetch(runRequest('?task=', { headers: bearer }), env)).status, 400);
});

test('/run rejects non-GET methods', async () => {
  const res = await worker.fetch(runRequest('?task=epic', { method: 'POST', headers: bearer }), makeEnv());
  assert.equal(res.status, 405);
});

test('/run with a valid token executes only the requested task', async () => {
  const calls: string[] = [];
  const requested: string[] = [];
  const res = await withFetch(
    (url) => { requested.push(url); return Response.json({ data: [] }); },
    () => worker.fetch(runRequest('?task=epic', { headers: bearer }), makeEnv({}, calls)),
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { task: string }[];
  assert.deepEqual(body.map((r) => r.task), ['epic']);
  assert.ok(requested.every((url) => url.includes('/game/epic-free')));
  assert.deepEqual(calls, []); // empty epic list must not write R2
});

test('isAuthorized accepts only an exact Bearer token', async () => {
  const req = (value?: string) => new Request('https://x/run', value === undefined ? {} : { headers: { Authorization: value } });
  assert.equal(await isAuthorized(req(`Bearer ${TOKEN}`), TOKEN), true);
  assert.equal(await isAuthorized(req(`bearer ${TOKEN}`), TOKEN), true);
  assert.equal(await isAuthorized(req(`Bearer ${TOKEN}x`), TOKEN), false);
  assert.equal(await isAuthorized(req(`Bearer ${TOKEN.slice(1)}`), TOKEN), false);
  assert.equal(await isAuthorized(req(`Basic ${TOKEN}`), TOKEN), false);
  assert.equal(await isAuthorized(req(`Bearer  ${TOKEN} extra`), TOKEN), false);
  assert.equal(await isAuthorized(req(undefined), TOKEN), false);
});

test('runEpic keeps the existing file when UAPI returns an empty list', async () => {
  const calls: string[] = [];
  const result = await withFetch(() => Response.json({ data: [] }), () => runEpic(makeEnv({}, calls)));
  assert.deepEqual(result, { task: 'epic', ok: 0, failed: 0, skipped: true });
  assert.deepEqual(calls, []);
});
