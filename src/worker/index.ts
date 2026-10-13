import type { Env } from '../server/r2';
import type { Handler } from './shared';
import { answerbook, collection, dailyNews, hotboard, postBySlug, postList } from './handlers/api';
import { articleShellBlocked, blogPost } from './handlers/blog';
import { dailyImage, media } from './handlers/media';
import { rss, sitemap } from './handlers/feeds';

// Order matters: fixed /api paths must come before the generic /api/:collection route.
// Captured groups are passed to handlers still percent-encoded; each handler decodes what it needs.
const routes: { pattern: RegExp; handler: Handler }[] = [
  { pattern: /^\/api\/posts$/, handler: postList },
  { pattern: /^\/api\/post\/([^/]+)$/, handler: postBySlug },
  { pattern: /^\/api\/answerbook$/, handler: answerbook },
  { pattern: /^\/api\/hotboard$/, handler: hotboard },
  { pattern: /^\/api\/daily-news$/, handler: dailyNews },
  { pattern: /^\/api\/([^/]+)$/, handler: collection },
  { pattern: /^\/blog\/([^/]+)$/, handler: blogPost },
  { pattern: /^\/daily-image\/([^/]+)$/, handler: dailyImage },
  { pattern: /^\/media\/(.+)$/, handler: media },
  { pattern: /^\/rss\.xml$/, handler: rss },
  { pattern: /^\/sitemap\.xml$/, handler: sitemap },
  { pattern: /^\/article-shell(?:\/.*)?$/, handler: articleShellBlocked },
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    for (const { pattern, handler } of routes) {
      const match = pattern.exec(pathname);
      if (!match) continue;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      return handler(request, env, match.slice(1));
    }
    // Everything else (pages, built assets, robots.txt) is served from the static assets binding.
    // Unknown paths resolve to the 404 page through not_found_handling in wrangler.toml.
    return env.ASSETS.fetch(request);
  },
};
