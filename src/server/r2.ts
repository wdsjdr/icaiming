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
export async function readPosts(env: Env) {
  const index = await readJson<{ posts: Post[] }>(env, 'posts/index.json');
  return index.posts.filter((post) => isPublished(post));
}
export async function readPost(env: Env, slug: string) {
  if (!slugPattern.test(slug)) throw new HttpError(404, '文章不存在');
  const posts = await readPosts(env);
  if (!posts.some((post) => post.slug === slug)) throw new HttpError(404, '文章不存在');
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
