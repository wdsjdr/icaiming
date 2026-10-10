import type { PagesFunction } from '@cloudflare/workers-types';
import { readPosts, cacheControl, errorResponse, type Env } from '../../src/server/r2';
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try { return Response.json({ posts: await readPosts(env) }, { headers: { 'Cache-Control': cacheControl(env) } }); }
  catch (error) { return errorResponse(error); }
};
