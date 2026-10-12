import { readFile, readdir, writeFile, stat, mkdir } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { AwsClient } from 'aws4fetch';
import { z } from 'zod';
import { parsePost, isPublished, profileSchema, homeSchema, projectsSchema, resourcesSchema, resumeSchema, downloadsSchema, type Post } from '../src/lib/content';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const contentRoot = resolve(root, '../icaiming-content');
// Wrangler appends /v3 to --persist-to; Miniflare needs the complete R2 path.
export const persist = resolve(root, '.wrangler/state');
const r2Path = resolve(persist, 'v3/r2');
const contentTypes: Record<string, string> = { '.json': 'application/json', '.md': 'text/markdown', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon', '.zip': 'application/zip', '.7z': 'application/x-7z-compressed', '.txt': 'text/plain; charset=utf-8' };
// Aggregator-owned key prefixes: written by the Worker directly to R2, never touched by this importer.
const protectedPrefixes = ['rankings/', 'misc/'];
// Known production R2 target; override via env if needed.
const DEFAULT_R2_ACCOUNT_ID = '4ec23877c096c538dd8b7356e8c172f6';
const DEFAULT_R2_BUCKET = 'icaiming-content';

export async function prepareContent() {
  const objects = new Map<string, string | Buffer>();
  // Aggregator-managed keys (rankings/, misc/) are written by the Worker directly to R2
  // and must never be seeded or pruned here, or they would clobber live data.
  const schemas = {
    'site/profile.json': profileSchema, 'site/home.json': homeSchema,
    'projects/index.json': projectsSchema, 'resources/index.json': resourcesSchema,
    'resume/resume.json': resumeSchema,
  };
  for (const [key, schema] of Object.entries(schemas)) {
    const data = schema.parse(JSON.parse(await readFile(resolve(contentRoot, key), 'utf8')));
    objects.set(key, JSON.stringify(data));
  }
  const posts: Post[] = [];
  for (const name of (await readdir(resolve(contentRoot, 'posts'))).sort()) {
    if (!name.endsWith('.md')) continue;
    const raw = await readFile(resolve(contentRoot, 'posts', name), 'utf8');
    const { meta } = parsePost(raw, name.slice(0, -3));
    if (!isPublished(meta)) continue;
    posts.push(meta);
    objects.set(`posts/${name}`, raw);
  }
  posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  async function assets(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await assets(path);
      else objects.set(relative(contentRoot, path).replaceAll('\\', '/'), await readFile(path));
    }
  }
  await assets(resolve(contentRoot, 'assets'));
  const downloadsDir = resolve(contentRoot, 'downloads');
  if (await stat(downloadsDir).then(() => true).catch(() => false)) await assets(downloadsDir);
  const downloads = downloadsSchema.parse(JSON.parse(await readFile(resolve(contentRoot, 'downloads/index.json'), 'utf8')));
  for (const item of downloads.items) if (!objects.has(item.file)) throw new Error(`下载文件不存在：${item.file}`);
  objects.set('downloads/index.json', JSON.stringify(downloads));
  const resume = resumeSchema.parse(JSON.parse(String(objects.get('resume/resume.json'))));
  if (resume.pdf) {
    await stat(resolve(contentRoot, resume.pdf));
    objects.set(resume.pdf, await readFile(resolve(contentRoot, resume.pdf)));
  }
  objects.set('posts/index.json', JSON.stringify({ posts }, null, 2) + '\n');
  return objects;
}

export async function syncContent() {
  const objects = await prepareContent(); // Validate everything before changing the bucket.
  await mkdir(r2Path, { recursive: true });
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("local content"); } }',
    r2Buckets: { CONTENT_BUCKET: 'icaiming-content' }, r2Persist: r2Path,
  });
  try {
    const bucket = await mf.getR2Bucket('CONTENT_BUCKET');
    const previous = await bucket.get('_local/manifest.json');
    const oldKeys = previous ? z.array(z.string()).parse(await previous.json()) : [];
    for (const [key, body] of objects) {
      // Miniflare's cross-runtime bridge accepts Web typed arrays, not Node Buffer.
      await bucket.put(key, typeof body === 'string' ? body : new Uint8Array(body), { httpMetadata: { contentType: `${contentTypes[extname(key)] ?? 'application/octet-stream'}` } });
    }
    // Only remove objects previously managed by this local content importer.
    // Never touch aggregator-owned prefixes, even if a stale manifest listed them.
    for (const key of oldKeys) {
      if (objects.has(key) || protectedPrefixes.some((prefix) => key.startsWith(prefix))) continue;
      console.log(`[content] 清理旧对象 ${key}`);
      await bucket.delete(key);
    }
    await bucket.put('_local/manifest.json', JSON.stringify([...objects.keys()]));
    const index = String(objects.get('posts/index.json'));
    const indexPath = resolve(contentRoot, 'posts/index.json');
    if (await readFile(indexPath, 'utf8').catch(() => '') !== index) await writeFile(indexPath, index);
    console.log(`[content] 已同步 ${objects.size} 个对象到本地 R2（无需重建页面）`);
  } finally { await mf.dispose(); }
}

// Load KEY=VALUE pairs from a dotenv-style file into process.env (existing values win).
async function loadEnvFile(path: string) {
  const text = await readFile(path, 'utf8').catch(() => null);
  if (!text) return;
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

export interface PublishSummary {
  mode: 's3' | 'wrangler';
  added: number;
  updated: number;
  skipped: number;
  removed: number;
}

export function md5Hex(body: string | Buffer) {
  return createHash('md5').update(body).digest('hex');
}

// R2/S3 objects uploaded with a single PUT expose their MD5 as the ETag, so an
// unchanged object can be detected without downloading it. Multipart ETags
// (with a "-N" suffix) and any mismatch always require a fresh upload.
export function remoteAction(localMd5: string, remote: { status: number; etag: string | null }): 'add' | 'update' | 'skip' {
  if (remote.status === 404) return 'add';
  const etag = (remote.etag ?? '').trim().replace(/^"+|"+$/g, '').toLowerCase();
  return etag === localMd5 ? 'skip' : 'update';
}

// Publish importer-managed content to the production R2 bucket.
// Prefers the S3 API (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY), falls back to wrangler
// with a Cloudflare API token (CLOUDFLARE_API_TOKEN). Aggregator-owned prefixes
// (rankings/, misc/) are never uploaded or pruned here.
export async function publishContent(): Promise<PublishSummary> {
  await loadEnvFile(resolve(root, '.dev.vars'));
  await loadEnvFile(resolve(root, '.env'));
  if (process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) return publishViaS3();
  if (process.env.CLOUDFLARE_API_TOKEN) return publishViaWrangler();
  throw new Error('缺少 R2 凭据：设置 R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY（S3），或 CLOUDFLARE_API_TOKEN（wrangler）');
}

async function publishViaS3(): Promise<PublishSummary> {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  const accountId = process.env.R2_ACCOUNT_ID || DEFAULT_R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET || DEFAULT_R2_BUCKET;
  const objects = await prepareContent(); // Validate everything before changing the bucket.
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
  const base = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
  const objectUrl = (key: string) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const summary: PublishSummary = { mode: 's3', added: 0, updated: 0, skipped: 0, removed: 0 };
  const syncObject = async (key: string, body: string | Buffer, contentType: string) => {
    const localMd5 = md5Hex(body);
    const head = await client.fetch(objectUrl(key), { method: 'HEAD' });
    const action = remoteAction(localMd5, { status: head.status, etag: head.headers.get('etag') });
    if (action === 'skip') { summary.skipped++; return; }
    // aws4fetch uses the Web Fetch BodyInit type; copy the exact Buffer slice into an ArrayBuffer
    // so Node's generic Buffer type does not leak into the browser-oriented declaration.
    const payload: BodyInit = typeof body === 'string'
      ? body
      : body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as unknown as ArrayBuffer;
    const response = await client.fetch(objectUrl(key), { method: 'PUT', headers: { 'content-type': contentType }, body: payload });
    if (!response.ok) throw new Error(`上传失败 ${key}：${response.status} ${await response.text()}`);
    if (action === 'add') summary.added += 1;
    else summary.updated += 1;
    console.log(action === 'add' ? `[publish] 新增 ${key}` : `[publish] 更新 ${key}`);
  };
  const manifest = await client.fetch(objectUrl('_local/manifest.json'));
  const manifestText = await manifest.text();
  const oldKeys = manifest.ok ? z.array(z.string()).parse(JSON.parse(manifestText || '[]')) : [];
  for (const [key, body] of objects) await syncObject(key, body, contentTypes[extname(key)] ?? 'application/octet-stream');
  for (const key of oldKeys) {
    if (objects.has(key) || protectedPrefixes.some((prefix) => key.startsWith(prefix))) continue;
    const response = await client.fetch(objectUrl(key), { method: 'DELETE' });
    if (response.ok || response.status === 404) { console.log(`[publish] 清理旧对象 ${key}`); summary.removed++; }
  }
  const manifestBody = JSON.stringify([...objects.keys()]);
  if (remoteAction(md5Hex(manifestBody), { status: manifest.status, etag: manifest.headers.get('etag') }) !== 'skip') {
    const response = await client.fetch(objectUrl('_local/manifest.json'), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: manifestBody });
    if (!response.ok) throw new Error(`上传失败 _local/manifest.json：${response.status} ${await response.text()}`);
  }
  const changed = summary.added + summary.updated + summary.removed;
  console.log(changed
    ? `[publish] 已发布到 R2 桶 ${bucket}：新增 ${summary.added}、更新 ${summary.updated}、跳过 ${summary.skipped}、删除 ${summary.removed}`
    : `[publish] 无变更：${summary.skipped} 个对象已是最新，未写入 R2 桶 ${bucket}`);
  return summary;
}

async function publishViaWrangler(): Promise<PublishSummary> {
  const token = process.env.CLOUDFLARE_API_TOKEN!;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || DEFAULT_R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET || DEFAULT_R2_BUCKET;
  const objects = await prepareContent();
  const wranglerBin = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
  const run = (args: string[], body: string | Buffer) => new Promise<void>((done, fail) => {
    const child = spawn(process.execPath, [wranglerBin, ...args], { env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId }, stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', fail);
    child.on('close', (code) => { if (code === 0) done(); else fail(new Error(stderr.trim() || `wrangler 退出码 ${code}`)); });
    child.stdin.end(body);
  });
  let uploaded = 0;
  for (const [key, body] of objects) {
    const contentType = contentTypes[extname(key)] ?? 'application/octet-stream';
    try {
      await run(['r2', 'object', 'put', `${bucket}/${key}`, '--remote', `--content-type=${contentType}`, '--pipe'], body);
    } catch (error) {
      throw new Error(`上传失败 ${key}：${(error as Error).message}`, { cause: error });
    }
    process.stdout.write(`\r[publish] 已上传 ${++uploaded}/${objects.size}…`);
  }
  await run(['r2', 'object', 'put', `${bucket}/_local/manifest.json`, '--remote', '--content-type=application/json', '--pipe'], JSON.stringify([...objects.keys()]));
  process.stdout.write('\n');
  console.log(`[publish] 已通过 wrangler 上传 ${uploaded} 个对象到 R2 桶 ${bucket}（回退路径，无变更检测）`);
  return { mode: 'wrangler', added: uploaded, updated: 0, skipped: 0, removed: 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const objects = await prepareContent();
    console.log(`[content] 校验通过：${objects.size} 个对象`);
  } else if (process.argv.includes('--publish')) await publishContent();
  else await syncContent();
}
