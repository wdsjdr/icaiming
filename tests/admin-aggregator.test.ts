import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import {
  AGGREGATOR_TASKS, AggregatorConfigError, DEFAULT_AGGREGATOR_URL, aggregatorBase, buildRunUrl, callAggregator,
  describeNetworkError, describeRunStatus, describeVerifyStatus, isAggregatorTask, maskProxy, normalizeProxyUrl,
  parseDotenv, resolveProxy,
} from '../scripts/admin/aggregator';
import { contentRoot, prepareContent } from '../scripts/content';

test('only the six manual tasks are accepted', () => {
  assert.deepEqual([...AGGREGATOR_TASKS], ['rankings', 'hotboard', 'daily-news', 'epic', 'saying', 'steam-deals']);
  for (const task of AGGREGATOR_TASKS) assert.equal(isAggregatorTask(task), true);
  for (const bad of ['all', '', 'epic ', 'EPIC', 'constructor', '__proto__', undefined, null, 1, ['epic']]) {
    assert.equal(isAggregatorTask(bad), false, String(bad));
  }
});

test('aggregator base defaults to the deployed Worker and honours AGGREGATOR_URL', () => {
  assert.equal(aggregatorBase({}), DEFAULT_AGGREGATOR_URL);
  assert.equal(aggregatorBase({ AGGREGATOR_URL: ' https://agg.example.dev/ ' }), 'https://agg.example.dev');
  assert.equal(aggregatorBase({ AGGREGATOR_URL: 'http://127.0.0.1:8787' }), 'http://127.0.0.1:8787');
  assert.throws(() => aggregatorBase({ AGGREGATOR_URL: 'ftp://x.example' }), AggregatorConfigError);
  assert.throws(() => aggregatorBase({ AGGREGATOR_URL: 'https://agg.example.dev/run' }), AggregatorConfigError);
  assert.throws(() => aggregatorBase({ AGGREGATOR_URL: 'not a url' }), AggregatorConfigError);
});

test('run URL carries the task name and never a token', () => {
  assert.equal(buildRunUrl('https://agg.example.dev', 'epic'), 'https://agg.example.dev/run?task=epic');
  assert.equal(buildRunUrl('https://agg.example.dev'), 'https://agg.example.dev/run');
  assert.ok(!buildRunUrl('https://agg.example.dev', 'epic').includes('token'));
});

test('Worker status codes map to actionable Chinese messages', () => {
  assert.equal(describeRunStatus(200), null);
  assert.match(describeRunStatus(401) ?? '', /RUN_TOKEN 不匹配/);
  assert.match(describeRunStatus(503) ?? '', /尚未设置 RUN_TOKEN/);
  assert.match(describeRunStatus(400) ?? '', /拒绝/);
  assert.match(describeRunStatus(500) ?? '', /500/);
  // Verify: 400 without a task means the token was accepted.
  assert.equal(describeVerifyStatus(400), null);
  assert.match(describeVerifyStatus(401) ?? '', /不正确/);
  assert.match(describeVerifyStatus(503) ?? '', /尚未设置/);
  assert.match(describeVerifyStatus(502) ?? '', /502/);
});

test('timeouts and connection failures are reported without throwing', () => {
  assert.match(describeNetworkError(Object.assign(new Error('x'), { name: 'TimeoutError' }), null), /超过 2 分钟/);
  assert.match(describeNetworkError(new TypeError('fetch failed'), null), /无法连接聚合 Worker/);
  // Connect timeouts without a proxy: point to .env.
  const timeout = new TypeError('fetch failed', { cause: Object.assign(new Error('connect'), { code: 'UND_ERR_CONNECT_TIMEOUT' }) });
  const direct = describeNetworkError(timeout, null);
  assert.match(direct, /UND_ERR_CONNECT_TIMEOUT/);
  assert.match(direct, /icaiming\/\.env/);
  // With a proxy configured, the message names it instead.
  const proxied = describeNetworkError(timeout, 'http://127.0.0.1:7897');
  assert.match(proxied, /127\.0\.0\.1:7897/);
  assert.doesNotMatch(proxied, /\.env/);
});

test('dotenv values are read with optional quotes and export prefix', () => {
  const values = parseDotenv('# comment\nR2_BUCKET=abc\nexport HTTPS_PROXY="http://127.0.0.1:7897"\n  HTTP_PROXY = \'http://x:1\' \n');
  assert.equal(values.R2_BUCKET, 'abc');
  assert.equal(values.HTTPS_PROXY, 'http://127.0.0.1:7897');
  assert.equal(values.HTTP_PROXY, 'http://x:1');
});

test('proxy is normalised, masked for display and resolved by precedence', () => {
  assert.equal(normalizeProxyUrl('127.0.0.1:7897'), 'http://127.0.0.1:7897');
  assert.equal(normalizeProxyUrl(' https://proxy.example:8443/ '), 'https://proxy.example:8443');
  assert.throws(() => normalizeProxyUrl('socks5://127.0.0.1:1080'), AggregatorConfigError);
  assert.throws(() => normalizeProxyUrl('http://'), AggregatorConfigError);
  assert.equal(maskProxy('http://user:secret@127.0.0.1:7897'), 'http://127.0.0.1:7897');
  assert.deepEqual(resolveProxy({ HTTPS_PROXY: 'http://env:1' } as NodeJS.ProcessEnv, { HTTPS_PROXY: 'http://file:2' }),
    { url: 'http://env:1', source: '环境变量' });
  assert.deepEqual(resolveProxy({} as NodeJS.ProcessEnv, { HTTPS_PROXY: '127.0.0.1:7897' }),
    { url: 'http://127.0.0.1:7897', source: 'icaiming/.env' });
  assert.equal(resolveProxy({} as NodeJS.ProcessEnv, {}), null);
});

test('callAggregator sends the token only in the Authorization header', async () => {
  const original = globalThis.fetch;
  const seen: { url: string; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), headers: init?.headers as Record<string, string> });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const response = await callAggregator({ base: 'https://agg.example.dev', token: 'tok-abcdefghijklmnop', task: 'saying', timeoutMs: 1000 });
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(seen[0].url, 'https://agg.example.dev/run?task=saying');
  assert.equal(seen[0].headers.Authorization, 'Bearer tok-abcdefghijklmnop');
  assert.ok(!seen[0].url.includes('tok-'));
});

test('publish never includes aggregator-owned keys (rankings/, misc/)', async (t) => {
  if (!(await stat(contentRoot).then(() => true, () => false))) {
    t.skip(`内容仓库不存在：${contentRoot}`);
    return;
  }
  const keys = [...(await prepareContent()).keys()];
  assert.ok(keys.length > 0);
  assert.deepEqual(keys.filter((key) => key.startsWith('rankings/') || key.startsWith('misc/')), []);
});
