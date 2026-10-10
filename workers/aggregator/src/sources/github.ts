import type { RawItem, Source } from '../types';

const ENDPOINT = 'https://github.com/trending?since=daily';
const USER_AGENT = 'ic-aiming-aggregator/1.0 (+https://github.com/wdsjdr/icaiming)';

export async function fetchGithubTrending(): Promise<RawItem[]> {
  const response = await fetch(ENDPOINT, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`GitHub Trending 返回 ${response.status}`);
  return parseTrending(await response.text());
}

export function parseTrending(html: string): RawItem[] {
  const items: RawItem[] = [];
  for (const block of html.split('<article class="Box-row">').slice(1)) {
    const repo = /<h2[^>]*class="[^"]*lh-condensed[^"]*"[\s\S]*?<a[^>]*href="\/([^"?#]+)"/.exec(block);
    if (!repo) continue;
    const key = repo[1].replace(/\/+$/, '');
    const [vendor, name] = key.split('/');
    if (!vendor || !name) continue;
    const language = /itemprop="programmingLanguage">([^<]+)</.exec(block);
    const stars = /([\d,]+)\s*stars today/.exec(block);
    items.push({
      key, name, vendor, raw: stars ? Number(stars[1].replaceAll(',', '')) : 0,
      url: `https://github.com/${key}`, tags: language ? [language[1].trim()] : [],
    });
  }
  return items;
}

export const githubTrending: Source = { name: 'github', fetch: fetchGithubTrending };