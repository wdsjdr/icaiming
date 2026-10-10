import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../src/server/r2';
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const page = await env.ASSETS.fetch(new URL('/404.html', request.url));
  return new Response(page.body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
