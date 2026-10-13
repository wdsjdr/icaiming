import { HttpError, type Env } from '../server/r2';

export type Handler = (request: Request, env: Env, params: string[]) => Promise<Response>;

// Pages decoded path parameters before they reached the function; keep that behaviour.
export function decodeParam(raw: string): string {
  try { return decodeURIComponent(raw); }
  catch { throw new HttpError(404, '页面不存在'); }
}

// Serves the built 404 page with a 404 status, as Pages did for unknown routes.
export async function notFoundPage(request: Request, env: Env): Promise<Response> {
  const page = await env.ASSETS.fetch(new URL('/404.html', request.url));
  return new Response(page.body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
