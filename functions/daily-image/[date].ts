import type { PagesFunction } from '@cloudflare/workers-types';
import { errorResponse, HttpError, type Env } from '../../src/server/r2';

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  try {
    const date = String(params.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(404, '图片不存在');
    const object = await env.CONTENT_BUCKET.get(`misc/daily-news/${date}.jpg`);
    if (!object) throw new HttpError(404, '图片不存在');
    const headers = new Headers({ 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    object.writeHttpMetadata(headers);
    if (!headers.get('Content-Type')) headers.set('Content-Type', 'image/jpeg');
    return new Response(object.body, { headers });
  } catch (error) { return errorResponse(error); }
};