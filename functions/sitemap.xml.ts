import type { PagesFunction } from '@cloudflare/workers-types';
import { readPosts, cacheControl, errorResponse, type Env } from '../src/server/r2';
import { escapeHtml } from '../src/server/markdown';
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const origin = new URL(request.url).origin; const posts = await readPosts(env);
    const paths = ['/', '/blog', '/resources', '/fun', '/fun/focus', '/about', '/resume', '/legal', '/legal/terms', '/legal/privacy', '/legal/disclaimer', '/legal/notices'];
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${escapeHtml(origin + path)}</loc></url>`).join('')}${posts.map((post) => `<url><loc>${escapeHtml(`${origin}/blog/${post.slug}`)}</loc><lastmod>${post.date}</lastmod></url>`).join('')}</urlset>`;
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': cacheControl(env) } });
  } catch (error) { return errorResponse(error); }
};
