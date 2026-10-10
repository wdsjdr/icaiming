import type { PagesFunction } from '@cloudflare/workers-types';
import { cacheControl, errorResponse, HttpError, type Env } from '../../src/server/r2';

const keyPattern = /^misc\/daily-news\/(\d{4}-\d{2}-\d{2})\.jpg$/;

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    if (!env.CONTENT_BUCKET) throw new HttpError(503, '内容服务尚未配置');
    const dates: string[] = [];
    let updatedAt: string | null = null;
    let cursor: string | undefined;
    do {
      const listed = await env.CONTENT_BUCKET.list({ prefix: 'misc/daily-news/', cursor });
      for (const object of listed.objects) {
        const match = keyPattern.exec(object.key);
        if (!match) continue;
        dates.push(match[1]);
        const uploaded = object.uploaded.toISOString();
        if (!updatedAt || uploaded > updatedAt) updatedAt = uploaded;
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    dates.sort((a, b) => b.localeCompare(a));
    return Response.json({ updatedAt, dates }, { headers: { 'Cache-Control': cacheControl(env) } });
  } catch (error) { return errorResponse(error); }
};