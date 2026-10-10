import type { PagesFunction } from '@cloudflare/workers-types';
import { readPosts, cacheControl, errorResponse, type Env } from '../src/server/r2';
import { escapeHtml } from '../src/server/markdown';
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const origin = new URL(request.url).origin;
    const posts = await readPosts(env);
    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>IC Aiming · 记录</title><link>${escapeHtml(origin)}/blog</link><description>冷静观察，持续瞄准。</description><language>zh-CN</language>${posts.map((post) => `<item><title>${escapeHtml(post.title)}</title><link>${escapeHtml(origin)}/blog/${post.slug}</link><guid>${escapeHtml(origin)}/blog/${post.slug}</guid><description>${escapeHtml(post.description)}</description><pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
    return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': cacheControl(env) } });
  } catch (error) { return errorResponse(error); }
};
