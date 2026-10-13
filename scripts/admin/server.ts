import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { prepareContent, publishContent } from '../content';
import { renderMarkdown } from '../../src/server/markdown';
import * as store from './lib';
import * as aggregator from './aggregator';

// Node's fetch ignores the Windows system proxy. Outbound proxy comes from HTTPS_PROXY/HTTP_PROXY in the
// environment, or from HTTPS_PROXY in icaiming/.env (read at startup; restart the admin after editing).
// Local addresses always bypass the proxy so the site probe on 127.0.0.1 keeps working.
const icaimingDir = fileURLToPath(new URL('../../', import.meta.url));
const dotenvText = (() => {
  try {
    return readFileSync(join(icaimingDir, '.env'), 'utf8');
  } catch {
    return '';
  }
})();
let outboundProxy: aggregator.ProxySetting | null = null;
try {
  outboundProxy = aggregator.resolveProxy(process.env, aggregator.parseDotenv(dotenvText));
} catch (error) {
  console.error(`[admin] ${(error as Error).message}`);
  process.exit(1);
}
const proxyDisplay = outboundProxy ? aggregator.maskProxy(outboundProxy.url) : null;
if (outboundProxy) {
  process.env.HTTPS_PROXY = outboundProxy.url;
  if (!process.env.NO_PROXY && !process.env.no_proxy) process.env.NO_PROXY = '127.0.0.1,localhost,::1';
  setGlobalDispatcher(new EnvHttpProxyAgent());
  console.log(`[admin] 出站代理：${proxyDisplay}（来源：${outboundProxy.source}）`);
} else {
  console.log('[admin] 未配置出站代理，直连 Cloudflare（如不通，请在 icaiming/.env 设置 HTTPS_PROXY）');
}

const icaimingRoot = fileURLToPath(new URL('../../', import.meta.url));
const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const contentRoot = store.defaultContentRoot;
const port = Number(process.env.ADMIN_PORT ?? 4400);
const token = process.env.ADMIN_TOKEN ?? randomBytes(16).toString('hex');
const maxUpload = Math.max(1, Number(process.env.ADMIN_MAX_UPLOAD_MB ?? 50)) * 1024 * 1024;
const jsonLimit = 2 * 1024 * 1024;
const siteOrigin = process.env.SITE_ORIGIN ?? 'http://127.0.0.1:4321';
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
const wranglerBin = join(icaimingRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const aggregatorConfig = join(icaimingRoot, 'workers', 'aggregator', 'wrangler.toml');
// Cloudflare API token used only for Worker deployment. Held in memory for this server run:
// never written to disk, never returned to the page, cleared when the admin server stops.
let cloudflareApiToken = '';
let cloudflareBusy = false;
const wranglerTimeoutMs = 5 * 60 * 1000;
// Aggregator RUN_TOKEN: kept in memory only, set after a successful `secret put` or verified by the aggregator tab.
let aggregatorRunToken = '';
let aggregatorBusy = false;
// Throws at startup if AGGREGATOR_URL is malformed, so the misconfiguration is visible immediately.
const aggregatorBaseUrl = aggregator.aggregatorBase(process.env);
const staticFiles: Record<string, string> = {
  '/app.js': 'text/javascript; charset=utf-8',
  '/app.css': 'text/css; charset=utf-8',
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function fail(res: ServerResponse, error: unknown) {
  const status = error instanceof store.AdminError ? error.status
    : error instanceof HttpError ? error.status
    : (error as Error)?.name === 'ZodError' ? 400 : 500;
  if (status === 500) console.error('[admin]', error);
  sendJson(res, status, { error: store.describeError(error) });
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, `请求体超过限制（${Math.round(limit / 1024 / 1024)} MB）`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req, jsonLimit);
  if (!raw.length) return {};
  try {
    const value = JSON.parse(raw.toString('utf8')) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('需要 JSON 对象');
    return value as Record<string, unknown>;
  } catch (error) {
    throw new HttpError(400, `请求体解析失败：${(error as Error).message}`);
  }
}

async function probeSite() {
  try {
    await fetch(siteOrigin, { signal: AbortSignal.timeout(700) });
    return true;
  } catch {
    return false;
  }
}

let pipelineBusy = false;

async function runCaptured<T>(job: () => Promise<T>) {
  if (pipelineBusy || cloudflareBusy) throw new HttpError(409, '已有校验/发布/部署任务在运行，请稍候');
  pipelineBusy = true;
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWrite = process.stdout.write.bind(process.stdout);
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  console.error = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  process.stdout.write = ((chunk: unknown) => { logs.push(String(chunk).replace(/\r/g, '')); return true; }) as typeof process.stdout.write;
  try {
    const value = await job();
    return { ok: true as const, logs, value };
  } catch (error) {
    return { ok: false as const, logs, error: store.describeError(error) };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.stdout.write = originalWrite;
    pipelineBusy = false;
  }
}

async function credentialStatus() {
  const text = [
    await readFile(join(icaimingRoot, '.dev.vars'), 'utf8').catch(() => ''),
    await readFile(join(icaimingRoot, '.env'), 'utf8').catch(() => ''),
  ].join('\n');
  const has = (name: string) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`, 'm').test(text) || Boolean(process.env[name]);
  return { s3: has('R2_ACCESS_KEY_ID') && has('R2_SECRET_ACCESS_KEY'), wrangler: has('CLOUDFLARE_API_TOKEN') };
}

function requireCloudflareToken(): string {
  if (!cloudflareApiToken) throw new HttpError(400, '请先在本页配置 Cloudflare API 令牌');
  return cloudflareApiToken;
}

async function runCloudflareJob<T>(job: () => Promise<T>): Promise<T> {
  if (cloudflareBusy || pipelineBusy) throw new HttpError(409, '已有校验/发布/部署任务在运行，请稍候');
  cloudflareBusy = true;
  try {
    return await job();
  } finally {
    cloudflareBusy = false;
  }
}

// Runs the project-local wrangler with an explicit token. The inherited environment is stripped of
// CLOUDFLARE_API_TOKEN so only the token entered on this page is used (no OAuth browser prompt).
// `stdin` is piped to the command (used for `secret put`); both secrets are redacted from the output.
function runWrangler(args: string[], options: { token: string; stdin?: string }): Promise<{ ok: boolean; output: string }> {
  const secrets = [options.token, options.stdin ?? ''].filter(Boolean);
  const env: NodeJS.ProcessEnv = { ...process.env, CLOUDFLARE_API_TOKEN: options.token };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [wranglerBin, ...args], {
      cwd: icaimingRoot, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    let raw = '';
    const collect = (chunk: Buffer) => { raw += chunk.toString('utf8'); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.stdin.on('error', () => { /* 子进程提前退出时忽略 EPIPE */ });
    const timer = setTimeout(() => {
      raw += '\n[admin] 超过 5 分钟，已终止';
      child.kill();
    }, wranglerTimeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, output: store.sanitizeCommandOutput(`无法启动 wrangler：${error.message}`, secrets) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: store.sanitizeCommandOutput(raw, secrets) });
    });
    child.stdin.end(options.stdin ?? '');
  });
}

async function buildState() {
  const [siteRunning, credentials, posts, media, trash] = await Promise.all([
    probeSite(), credentialStatus(), store.listPosts(contentRoot), store.listMedia(contentRoot), store.listTrash(contentRoot),
  ]);
  const collectionStates: { id: string; label: string; valid: boolean; error?: string }[] = [];
  for (const [id, def] of Object.entries(store.collections)) {
    try {
      def.schema.parse(JSON.parse(await readFile(join(contentRoot, def.file), 'utf8')));
      collectionStates.push({ id, label: def.label, valid: true });
    } catch (error) {
      collectionStates.push({ id, label: def.label, valid: false, error: store.describeError(error) });
    }
  }
  return {
    contentRoot, siteOrigin, siteRunning, credentials,
    cloudflare: { apiToken: Boolean(cloudflareApiToken) },
    aggregator: { url: aggregatorBaseUrl, runToken: Boolean(aggregatorRunToken), proxy: proxyDisplay },
    collections: collectionStates,
    counts: {
      posts: posts.length,
      drafts: posts.filter((post) => post.valid && !post.published).length,
      invalidPosts: posts.filter((post) => !post.valid).length,
      assets: media.assets.length,
      downloads: media.downloads.length,
      trash: trash.length,
    },
  };
}

async function serveStatic(res: ServerResponse, pathname: string) {
  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return true;
  }
  if (pathname === '/' || pathname === '/index.html') {
    const html = await readFile(join(publicDir, 'index.html'), 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html.replace('__ADMIN_TOKEN__', token));
    return true;
  }
  const type = staticFiles[pathname];
  if (!type) return false;
  const body = await readFile(join(publicDir, pathname.slice(1)));
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
  return true;
}

function postSlug(path: string) {
  const match = /^\/api\/posts\/([^/]+)$/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}

function collectionId(path: string) {
  const match = /^\/api\/collections\/([^/]+)$/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}

async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const method = req.method ?? 'GET';
  const path = url.pathname;

  if (path.startsWith('/api/')) {
    if (req.headers['x-admin-token'] !== token) throw new HttpError(401, '会话令牌无效，请通过启动时打印的地址访问');
  }

  if (path === '/api/state' && method === 'GET') {
    sendJson(res, 200, await buildState());
    return true;
  }

  if (path === '/api/validate' && method === 'POST') {
    const result = await runCaptured(async () => (await prepareContent()).size);
    sendJson(res, 200, { ok: result.ok, count: result.value ?? 0, logs: result.logs, error: result.error });
    return true;
  }

  if (path === '/api/publish' && method === 'POST') {
    const result = await runCaptured(() => publishContent());
    sendJson(res, 200, { ok: result.ok, logs: result.logs, error: result.error, summary: result.value ?? null });
    return true;
  }

  if (path === '/api/credentials' && method === 'POST') {
    const body = await readJsonBody(req);
    const accessKeyId = store.normalizeCredential(body.accessKeyId, '令牌 ID（Access Key ID）');
    const secretAccessKey = store.normalizeCredential(body.secretAccessKey, '令牌密钥（Secret Access Key）');
    await store.updateEnvFile(join(icaimingRoot, '.dev.vars'), { R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey });
    process.env.R2_ACCESS_KEY_ID = accessKeyId;
    process.env.R2_SECRET_ACCESS_KEY = secretAccessKey;
    console.log(`[admin] R2 发布凭据已更新（Access Key ID 尾号 ${accessKeyId.slice(-4)}）`);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (path === '/api/cloudflare/token' && method === 'POST') {
    const body = await readJsonBody(req);
    const value = store.normalizeCredential(body.apiToken, 'Cloudflare API 令牌');
    const verified = await runCloudflareJob(() => runWrangler(['whoami'], { token: value }));
    if (!verified.ok) {
      sendJson(res, 200, { ok: false, error: '令牌验证失败，请确认权限与账户范围', logs: verified.output });
      return true;
    }
    cloudflareApiToken = value;
    console.log('[admin] Cloudflare API 令牌已验证并保存在内存中（未写入磁盘）');
    sendJson(res, 200, { ok: true, logs: verified.output });
    return true;
  }
  if (path === '/api/cloudflare/token' && method === 'DELETE') {
    cloudflareApiToken = '';
    console.log('[admin] Cloudflare API 令牌已从内存清除');
    sendJson(res, 200, { ok: true });
    return true;
  }
  if (path === '/api/cloudflare/deploy-aggregator' && method === 'POST') {
    const token = requireCloudflareToken();
    console.log('[admin] 开始部署聚合 Worker（ic-aiming-aggregator）');
    const result = await runCloudflareJob(() => runWrangler(['deploy', '--config', aggregatorConfig], { token }));
    console.log(`[admin] 聚合 Worker 部署${result.ok ? '完成' : '失败'}`);
    sendJson(res, 200, { ok: result.ok, logs: result.output, error: result.ok ? undefined : '部署失败，详见日志' });
    return true;
  }
  if (path === '/api/cloudflare/run-token' && method === 'POST') {
    const token = requireCloudflareToken();
    const body = await readJsonBody(req);
    const value = store.normalizeRunToken(body.value);
    const result = await runCloudflareJob(() => runWrangler(
      ['secret', 'put', 'RUN_TOKEN', '--config', aggregatorConfig],
      { token, stdin: value },
    ));
    if (result.ok) aggregatorRunToken = value;
    console.log(`[admin] 聚合 Worker RUN_TOKEN 设置${result.ok ? '完成（已保存到内存供聚合任务页使用）' : '失败'}（值未记录）`);
    sendJson(res, 200, { ok: result.ok, logs: result.output, error: result.ok ? undefined : '设置失败，详见日志' });
    return true;
  }

  if (path === '/api/aggregator/token' && method === 'POST') {
    const body = await readJsonBody(req);
    const value = store.normalizeRunToken(body.value);
    // Token check without a task: the Worker answers 400 for a valid token and runs nothing.
    const check = await aggregator.callAggregator({ base: aggregatorBaseUrl, token: value, timeoutMs: aggregator.VERIFY_TIMEOUT_MS })
      .then((response) => aggregator.describeVerifyStatus(response.status))
      .catch((error) => aggregator.describeNetworkError(error, proxyDisplay));
    if (check !== null) {
      sendJson(res, 200, { ok: false, error: check });
      return true;
    }
    aggregatorRunToken = value;
    console.log('[admin] 聚合 Worker RUN_TOKEN 已验证并保存到内存（值未记录）');
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (path === '/api/aggregator/run' && method === 'POST') {
    if (!aggregatorRunToken) throw new HttpError(400, '请先设置或验证 RUN_TOKEN');
    const body = await readJsonBody(req);
    // Whitelist only: the task name is forwarded to the Worker as a query value.
    if (!aggregator.isAggregatorTask(body.task)) throw new HttpError(400, '不支持的任务名称');
    if (aggregatorBusy) throw new HttpError(409, '已有聚合任务在运行，请稍候');
    aggregatorBusy = true;
    const task = body.task;
    console.log(`[admin] 手动执行聚合任务 ${task}`);
    try {
      const response = await aggregator.callAggregator({
        base: aggregatorBaseUrl, token: aggregatorRunToken, task, timeoutMs: aggregator.RUN_TIMEOUT_MS,
      });
      const message = aggregator.describeRunStatus(response.status);
      if (message !== null) {
        console.log(`[admin] 聚合任务 ${task} 未执行：${message}`);
        sendJson(res, 200, { ok: false, task, error: message });
        return true;
      }
      const results = await response.json();
      console.log(`[admin] 聚合任务 ${task} 完成：${JSON.stringify(results)}`);
      sendJson(res, 200, { ok: true, task, results });
    } catch (error) {
      const message = aggregator.describeNetworkError(error, proxyDisplay);
      console.log(`[admin] 聚合任务 ${task} 失败：${message}`);
      sendJson(res, 200, { ok: false, task, error: message });
    } finally {
      aggregatorBusy = false;
    }
    return true;
  }

  if (path === '/api/preview' && method === 'POST') {
    const body = await readJsonBody(req);
    const { html, headings } = await renderMarkdown(String(body.body ?? ''));
    sendJson(res, 200, { html, headings });
    return true;
  }

  if (path === '/api/posts' && method === 'GET') {
    sendJson(res, 200, { posts: await store.listPosts(contentRoot) });
    return true;
  }

  const slug = postSlug(path);
  if (slug && method === 'GET') {
    sendJson(res, 200, await store.readPostFile(contentRoot, slug));
    return true;
  }
  if (slug && method === 'PUT') {
    const body = await readJsonBody(req);
    const raw = typeof body.raw === 'string' ? body.raw
      : store.buildPostRaw(body.meta as store.PostMetaInput, String(body.body ?? ''));
    await store.writePost(contentRoot, slug, raw);
    sendJson(res, 200, { ok: true, slug });
    return true;
  }
  if (slug && method === 'DELETE') {
    const moved = await store.moveToTrash(contentRoot, `posts/${slug}.md`);
    sendJson(res, 200, { ok: true, trash: moved.path });
    return true;
  }
  if (path === '/api/posts' && method === 'POST') {
    const body = await readJsonBody(req);
    const postSlugValue = String(body.slug ?? '');
    const raw = typeof body.raw === 'string' ? body.raw
      : store.buildPostRaw(body.meta as store.PostMetaInput, String(body.body ?? ''));
    await store.createPost(contentRoot, postSlugValue, raw);
    sendJson(res, 200, { ok: true, slug: postSlugValue });
    return true;
  }

  const id = collectionId(path);
  if (id && method === 'GET') {
    sendJson(res, 200, await store.readCollection(contentRoot, id));
    return true;
  }
  if (id && method === 'PUT') {
    const body = await readJsonBody(req);
    if (typeof body.raw === 'string') await store.writeCollection(contentRoot, id, body.raw);
    else await store.writeCollectionValue(contentRoot, id, body.value);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (path === '/api/media' && method === 'GET') {
    const media = await store.listMedia(contentRoot);
    const corpus = await store.buildReferenceCorpus(contentRoot);
    for (const group of [media.assets, media.downloads, media.resume]) {
      for (const file of group) file.refs = store.referencesFor(corpus, file.path);
    }
    sendJson(res, 200, media);
    return true;
  }
  if (path === '/api/media/upload' && method === 'POST') {
    const folder = url.searchParams.get('folder') ?? '';
    const name = url.searchParams.get('name') ?? '';
    const buffer = await readBody(req, maxUpload);
    if (!buffer.length) throw new HttpError(400, '文件为空');
    const target = await store.resolveUploadTarget(contentRoot, folder, name);
    await store.atomicWrite(target.abs, buffer);
    sendJson(res, 200, { ok: true, path: target.rel, name: target.finalName, renamed: target.renamed, size: buffer.length });
    return true;
  }
  if (path === '/api/media' && method === 'DELETE') {
    const rel = url.searchParams.get('path') ?? '';
    store.assertMediaPath(rel);
    const moved = await store.moveToTrash(contentRoot, rel);
    sendJson(res, 200, { ok: true, trash: moved.path });
    return true;
  }

  if (path === '/api/trash' && method === 'GET') {
    sendJson(res, 200, { entries: await store.listTrash(contentRoot) });
    return true;
  }
  if (path === '/api/trash/restore' && method === 'POST') {
    const body = await readJsonBody(req);
    const restored = await store.restoreFromTrash(contentRoot, String(body.path ?? ''));
    sendJson(res, 200, { ok: true, path: restored.path });
    return true;
  }
  if (path === '/api/trash' && method === 'DELETE') {
    await store.purgeTrash(contentRoot, url.searchParams.get('path') ?? '');
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (method === 'GET' && !path.startsWith('/api/')) return serveStatic(res, path);
  throw new HttpError(404, '接口不存在');
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      const host = req.headers.host ?? '';
      if (!allowedHosts.has(host)) throw new HttpError(403, '仅允许通过本机地址访问');
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.has(origin)) throw new HttpError(403, '请求来源不受信任');
      if (!(await handle(req, res, url))) throw new HttpError(404, '页面不存在');
    } catch (error) {
      fail(res, error);
    }
  })();
});

server.requestTimeout = 0;
server.listen(port, '127.0.0.1', () => {
  const address = `http://127.0.0.1:${port}/`;
  console.log(`[admin] 本地管理页：${address}`);
  console.log(`[admin] 内容目录：${contentRoot}`);
  console.log(`[admin] 仅监听本机回环地址，会话令牌已注入页面。`);
  if (!process.argv.includes('--no-open') && !process.env.ADMIN_NO_OPEN) {
    const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', address] : [address];
    try {
      spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
    } catch {
      /* 浏览器自动打开失败时忽略 */
    }
  }
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') console.error(`[admin] 端口 ${port} 已被占用，可用 ADMIN_PORT 指定其他端口。`);
  else console.error('[admin]', error);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close();
    process.exit(0);
  });
}