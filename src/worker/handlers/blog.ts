import { HttpError, readPost, cacheControl, type Env } from '../../server/r2';
import { renderMarkdown, escapeHtml } from '../../server/markdown';
import { decodeParam, notFoundPage, type Handler } from '../shared';

export const blogPost: Handler = async (request, env, params) => {
  try {
    const post = await readPost(env, decodeParam(params[0]));
    const { html, headings } = await renderMarkdown(post.body);
    const url = new URL(request.url); url.pathname = `/blog/${post.meta.slug}`; url.search = '';
    // No trailing slash: with drop-trailing-slash, a slashed path is answered with a redirect, not the template.
    const templateUrl = new URL('/article-shell', request.url);
    const template = await env.ASSETS.fetch(new Request(templateUrl));
    if (!template.ok) throw new Error('Article template unavailable');
    const title = `${post.meta.title} — IC Aiming`;
    const transformed = new HTMLRewriter()
      .on('title', { element(el) { el.setInnerContent(title); } })
      .on('meta[name="robots"]', { element(el) { el.remove(); } })
      .on('meta[name="description"], meta[property="og:description"]', { element(el) { el.setAttribute('content', post.meta.description); } })
      .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', title); } })
      .on('meta[property="og:type"]', { element(el) { el.setAttribute('content', 'article'); } })
      .on('head', { element(el) { el.append(`<link rel="canonical" href="${escapeHtml(url.href)}"><meta property="og:url" content="${escapeHtml(url.href)}"><meta property="article:published_time" content="${post.meta.date}">`, { html: true }); } })
      .on('[data-article-title]', { element(el) { el.setInnerContent(post.meta.title); } })
      .on('[data-article-description]', { element(el) { el.setInnerContent(post.meta.description); } })
      .on('[data-article-meta]', { element(el) { el.setInnerContent(`${post.meta.date} / ${post.meta.readingMinutes} MIN READ / IC AIMING`); } })
      .on('[data-article-tags]', { element(el) { el.setInnerContent(post.meta.tags.map((tag) => `<a class="tag" href="/blog?tag=${encodeURIComponent(tag)}">${escapeHtml(tag)}</a>`).join(''), { html: true }); } })
      .on('[data-article-body]', { element(el) { el.setInnerContent(html, { html: true }); } })
      .on('[data-article-toc]', { element(el) { el.setInnerContent(headings.map((heading) => `<a class="depth-${heading.depth}" href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a>`).join(''), { html: true }); } })
      .transform(template);
    const headers = new Headers(transformed.headers);
    headers.set('Cache-Control', cacheControl(env)); headers.set('Content-Type', 'text/html; charset=utf-8');
    // The static shell's entity tag must not be reused for different articles.
    headers.delete('ETag'); headers.delete('Last-Modified'); headers.delete('Content-Length');
    return new Response(transformed.body, { headers });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 503;
    if (status === 404) return notFoundPage(request, env);
    console.error('[article]', error);
    return new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>暂时无法读取 — IC Aiming</title><h1>文章暂时无法读取</h1><p>请稍后刷新重试。</p><a href="/blog">返回博客</a></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
};

// The article shell is a template, not a page: direct requests get the 404 page.
export const articleShellBlocked: Handler = (request, env) => notFoundPage(request, env);
