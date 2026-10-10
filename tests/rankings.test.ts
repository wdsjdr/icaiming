import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrending } from '../workers/aggregator/src/sources/github';
import { combine } from '../workers/aggregator/src/combine';
import type { SourcedItem } from '../workers/aggregator/src/types';

const block = (owner: string, name: string, language: string, stars: string) => `<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a href="/${owner}/${name}"><span class="text-normal"> ${owner} /</span> ${name}</a>
  </h2>
  <p class="col-9 color-fg-muted my-1 tmp-pr-4">Some description.</p>
  <span class="tmp-mr-3 d-inline-block ml-0 tmp-ml-0"><span itemprop="programmingLanguage">${language}</span></span>
  <span class="d-inline-block float-sm-right">${stars} stars today</span>
</article>`;

test('GitHub Trending HTML is parsed into repos with stars and language', () => {
  const html = `<div>${block('vercel', 'next.js', 'JavaScript', '1,234')}${block('rust-lang', 'rust', 'Rust', '980')}</div>`;
  const items = parseTrending(html);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { key: 'vercel/next.js', name: 'next.js', vendor: 'vercel', raw: 1234, url: 'https://github.com/vercel/next.js', tags: ['JavaScript'] });
  assert.equal(items[1].raw, 980);
});

test('malformed blocks and personal repos are rejected', () => {
  const html = '<article class="Box-row"><h2 class="h3 lh-condensed">no link</h2></article>' + block('onlyowner', '', 'Go', '10');
  assert.deepEqual(parseTrending(html), []);
});

test('combine normalizes per source, weights, and ranks', () => {
  const items: SourcedItem[] = [
    { key: 'a/one', name: 'one', vendor: 'a', raw: 100, url: 'https://github.com/a/one', tags: [], source: 'github' },
    { key: 'b/two', name: 'two', vendor: 'b', raw: 50, url: 'https://github.com/b/two', tags: [], source: 'github' },
  ];
  const result = combine(items, { github: 1 });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].rank, 1);
  assert.equal(result.items[0].score, 1);
  assert.equal(result.items[1].score, 0.5);
  assert.equal(result.items[0].sources.github, 1);
  assert.ok(result.updatedAt);
});

test('combine merges the same key across sources with weighted average', () => {
  const items: SourcedItem[] = [
    { key: 'x/shared', name: 'shared', raw: 10, tags: [], source: 'github' },
    { key: 'x/shared', name: 'shared', raw: 20, tags: [], source: 'other' },
    { key: 'y/only', name: 'only', raw: 10, tags: [], source: 'github' },
  ];
  const result = combine(items, { github: 1, other: 1 });
  const shared = result.items.find((item) => item.name === 'shared')!;
  assert.deepEqual(shared.sources, { github: 1, other: 1 });
  assert.equal(shared.score, 1);
});