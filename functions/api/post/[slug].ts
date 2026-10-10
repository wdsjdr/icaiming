import type { PagesFunction } from '@cloudflare/workers-types';
import { readPost, cacheControl, errorResponse, type Env } from '../../../src/server/r2';
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  try {
    const post = await readPost(env, String(params.slug ?? ''));
    return new Response(post.raw, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': cacheControl(env), ETag: post.etag } });
  } catch (error) { return errorResponse(error); }
};
