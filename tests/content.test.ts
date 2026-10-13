import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePost, isPublished, resourcesSchema } from '../src/lib/content';
import { renderMarkdown } from '../src/server/markdown';
import { readPost, readPosts, clearPostsCache, HttpError, type Env } from '../src/server/r2';

const document = (extra = '', body = '这是正文。') => `---\ntitle: 测试文章\ndescription: 一段摘要\ndate: "2026-10-10"\n${extra}---\n${body}`;

test('frontmatter supports CRLF and preserves the body; invalid dates and paths are rejected', () => {
  const parsed = parsePost(document('tags: [开发]\n').replaceAll('\n', '\r\n'), 'valid-slug');
  assert.equal(parsed.meta.date, '2026-10-10');
  assert.deepEqual(parsed.meta.tags, ['开发']);
  assert.equal(parsed.body, '这是正文。');
  assert.throws(() => parsePost(document(), '../private'));
  assert.throws(() => parsePost(document().replace('2026-10-10', '2026-02-31'), 'bad-date'));
  assert.throws(() => parsePost(document('', ' '), 'empty'));
  assert.throws(() => parsePost('no frontmatter', 'missing-meta'));
});

test('drafts and future articles are not published; scheduled date is inclusive in UTC', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  assert.equal(isPublished({ draft: true, date: '2026-01-01' }, now), false);
  assert.equal(isPublished({ draft: false, date: '2026-10-11' }, now), false);
  assert.equal(isPublished({ draft: false, date: '2026-10-10' }, now), true);
});

test('resource links reject executable and non-web protocols', () => {
  const resource = { title: 'test', description: '', category: '工具', tags: [] };
  assert.throws(() => resourcesSchema.parse({ items: [{ ...resource, url: 'javascript:alert(1)' }] }));
  assert.throws(() => resourcesSchema.parse({ items: [{ ...resource, url: 'file:///etc/passwd' }] }));
  assert.equal(resourcesSchema.parse({ items: [{ ...resource, url: 'https://example.com/' }] }).items.length, 1);
});

test('Markdown strips active HTML and unsafe URLs while retaining code, GFM and unique TOC anchors', async () => {
  const result = await renderMarkdown('## 同名\n\n## 同名\n\n<script>alert(1)</script>\n\n[x](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>\n\n```js\nconst safe = "<tag>";\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |');
  assert.doesNotMatch(result.html, /<script|onerror=|href="javascript:/i);
  assert.match(result.html, /<table>/);
  assert.match(result.html, /(?:&lt;|&#x3[cC];)tag(?:&gt;|>)/);
  assert.doesNotMatch(result.html, /<tag>/);
  assert.equal(new Set(result.headings.map((heading) => heading.id)).size, 2);
  for (const heading of result.headings) assert.ok(result.html.includes(`id="${heading.id}"`));
});

// Minimal R2 bucket double: paginated list() over prefixes and get() returning text bodies.
function mockBucket(files: Record<string, string>, pageSize = 2) {
  const keys = Object.keys(files).sort();
  return {
    list: async ({ prefix, cursor }: { prefix: string; cursor?: string }) => {
      const matching = keys.filter((key) => key.startsWith(prefix));
      const start = cursor ? Number(cursor) : 0;
      const next = start + pageSize;
      const truncated = next < matching.length;
      return { objects: matching.slice(start, next).map((key) => ({ key })), truncated, cursor: truncated ? String(next) : undefined };
    },
    get: async (key: string) => (key in files ? { text: async () => files[key], httpEtag: `"${key}"` } : null),
  };
}
const articleDoc = (title: string, date: string, extra = '') => `---\ntitle: ${title}\ndescription: 摘要\ndate: "${date}"\n${extra}---\n正文内容。`;
const isNotFound = (error: unknown) => error instanceof HttpError && error.status === 404;

test('article list is built from R2 posts/ objects: drafts, future and malformed files excluded, newest first', async () => {
  clearPostsCache();
  const env = { CONTENT_BUCKET: mockBucket({
    'posts/older.md': articleDoc('旧文', '2020-01-01'),
    'posts/newer.md': articleDoc('新文', '2020-06-01'),
    'posts/draft.md': articleDoc('草稿', '2020-07-01', 'draft: true\n'),
    'posts/future.md': articleDoc('未来', '2999-01-01'),
    'posts/broken.md': 'no frontmatter',
    'posts/index.json': '{"posts":[]}',
    'rankings/combined.json': '{}',
  }) } as unknown as Env;
  const posts = await readPosts(env);
  assert.deepEqual(posts.map((post) => post.slug), ['newer', 'older']);
  clearPostsCache();
});

test('direct article reads go to R2 and enforce slug format and the body draft flag', async () => {
  const env = { CONTENT_BUCKET: mockBucket({
    'posts/visible.md': articleDoc('可见', '2020-01-01'),
    'posts/draft-post.md': articleDoc('草稿', '2020-01-01', 'draft: true\n'),
  }) } as unknown as Env;
  assert.equal((await readPost(env, 'visible')).meta.slug, 'visible');
  await assert.rejects(() => readPost(env, 'draft-post'), isNotFound);
  await assert.rejects(() => readPost(env, 'missing'), isNotFound);
  await assert.rejects(() => readPost(env, '../secret'), isNotFound);
});
