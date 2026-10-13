import type { R2Bucket, Fetcher } from '@cloudflare/workers-types';
import { isPublished, parsePost, slugPattern, type Post } from '../lib/content';

export interface Env { CONTENT_BUCKET: R2Bucket; ASSETS: Fetcher; LOCAL_DEV?: string; UAPI_KEY?: string }
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function readJson<T>(env: Env, key: string): Promise<T> {
  if (!env.CONTENT_BUCKET) throw new HttpError(503, '内容服务尚未配置');
  const object = await env.CONTENT_BUCKET.get(key);
  if (!object) throw new HttpError(404, '内容尚未发布');
  return object.json<T>();
}
const postKeyPattern = /^posts\/([^/]+)\.md$/;
const postsCacheMs = 60_000;
let postsCache: { expires: number; load: Promise<Post[]> } | null = null;

// Published articles, newest first, built from the posts/ objects in R2 (R2 is the source of truth).
// Shared per isolate for the same 60s as cacheControl; LOCAL_DEV bypasses the cache.
export function readPosts(env: Env): Promise<Post[]> {
  if (env.LOCAL_DEV === 'true') return loadPosts(env);
  const now = Date.now();
  const cached = postsCache;
  if (cached && cached.expires > now) return cached.load;
  const load = loadPosts(env);
  const entry = { expires: now + postsCacheMs, load };
  postsCache = entry;
  // Failures are not cached, so the next request retries.
  load.catch(() => { if (postsCache === entry) postsCache = null; });
  return load;
}
export function clearPostsCache() { postsCache = null; }
async function loadPosts(env: Env): Promise<Post[]> {
  const bucket = env.CONTENT_BUCKET;
  if (!bucket) throw new HttpError(503, '内容服务尚未配置');
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix: 'posts/', cursor });
    for (const object of listed.objects) if (postKeyPattern.test(object.key)) keys.push(object.key);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  const loaded = await Promise.all(keys.map((key) => readPostMeta(bucket, key)));
  return loaded
    .filter((post): post is Post => post !== null && isPublished(post))
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}
// A malformed article is logged and skipped so it cannot take the whole list down.
async function readPostMeta(bucket: R2Bucket, key: string): Promise<Post | null> {
  const slug = postKeyPattern.exec(key)?.[1] ?? '';
  try {
    const object = await bucket.get(key);
    if (!object) return null;
    return parsePost(await object.text(), slug).meta;
  } catch (error) {
    console.error('[posts] skipped', key, error);
    return null;
  }
}
export async function readPost(env: Env, slug: string) {
  if (!slugPattern.test(slug)) throw new HttpError(404, '文章不存在');
  if (!env.CONTENT_BUCKET) throw new HttpError(503, '内容服务尚未配置');
  const object = await env.CONTENT_BUCKET.get(`posts/${slug}.md`);
  if (!object) throw new HttpError(404, '文章不存在');
  const raw = await object.text();
  const result = parsePost(raw, slug);
  if (!isPublished(result.meta)) throw new HttpError(404, '文章不存在');
  return { ...result, raw, etag: object.httpEtag };
}
export function cacheControl(env: Env) {
  return env.LOCAL_DEV === 'true' ? 'no-store' : 'public, max-age=60, must-revalidate';
}
export function errorResponse(error: unknown) {
  const status = error instanceof HttpError ? error.status : 503;
  if (!(error instanceof HttpError)) console.error('[content]', error);
  return Response.json({ error: error instanceof HttpError ? error.message : '内容暂时无法读取，请稍后重试' }, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
}
