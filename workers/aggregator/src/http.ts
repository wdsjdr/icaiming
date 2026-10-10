import type { Env } from './types';

const USER_AGENT = 'ic-aiming-aggregator/1.0 (+https://github.com/wdsjdr/icaiming)';

export async function uapi<T = unknown>(env: Env, path: string, timeout = 10000): Promise<T> {
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
  if (env.UAPI_KEY) headers.Authorization = `Bearer ${env.UAPI_KEY}`;
  const response = await fetch(`https://uapis.cn/api/v1${path}`, { headers, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`UAPI ${path} 返回 ${response.status}`);
  return response.json<T>();
}

export const jsonMeta = { contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=60' };

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function readExisting<T>(env: Env, key: string): Promise<T | null> {
  const object = await env.CONTENT_BUCKET.get(key);
  return object ? object.json<T>().catch(() => null) : null;
}