import assert from 'node:assert/strict';
import { readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { root, contentRoot } from './content';

// Run against `pnpm dev`: verifies the real watcher, R2 binding and runtime route.
const origin = process.env.LOCAL_ORIGIN ?? 'http://127.0.0.1:4321';
const slug = `local-verification-${Date.now()}`;
const file = resolve(contentRoot, 'posts', `${slug}.md`);
const shell = resolve(root, 'dist/index.html');
const before = await stat(shell);
const originalIndex = await readFile(resolve(contentRoot, 'posts/index.json'), 'utf8');
const date = new Date().toISOString().slice(0, 10);
const content = (draft: boolean, title = '本地链路验收') => `---\ntitle: ${title}\ndescription: 本地自动验收，结束后删除\ndate: "${date}"\ntags: [验收]\ndraft: ${draft}\n---\n\n## 内容不经过构建\n\nlocal-content-probe-${slug}\n`;
async function get(path: string) { return fetch(`${origin}${path}`, { signal: AbortSignal.timeout(10000) }); }
async function waitFor(action: () => Promise<boolean>, message: string) {
  for (let attempt = 0; attempt < 50; attempt++) { if (await action()) return; await setTimeout(400); }
  throw new Error(`超时：${message}`);
}
async function listed() { const response = await get('/api/posts'); assert.equal(response.status, 200); const data = await response.json() as { posts: { slug: string; title: string }[] }; return data.posts.find((post) => post.slug === slug); }
let created = false;
try {
  await writeFile(file, content(false), { flag: 'wx' }); created = true;
  await waitFor(async () => Boolean(await listed()), '新文章进入索引');
  const article = await get(`/blog/${slug}`); assert.equal(article.status, 200);
  const html = await article.text();
  assert.ok(html.includes(`local-content-probe-${slug}`));
  assert.match(html, /<title>本地链路验收 — IC Aiming<\/title>/);
  assert.ok(html.includes(`rel="canonical" href="${origin}/blog/${slug}"`));
  assert.doesNotMatch(html, /name="robots" content="noindex"/);
  assert.ok((await (await get('/rss.xml')).text()).includes(slug));
  assert.ok((await (await get('/sitemap.xml')).text()).includes(slug));
  console.log('PASS 新文章自动同步、详情服务端 HTML、元信息、RSS 与 sitemap');

  await writeFile(file, content(false, '本地更新验收'));
  await waitFor(async () => (await listed())?.title === '本地更新验收', '修改文章立即生效');
  assert.ok((await (await get(`/blog/${slug}`)).text()).includes('<title>本地更新验收'));

  await writeFile(file, content(false).replace(date, '2026-02-31'));
  await setTimeout(1800);
  assert.equal((await listed())?.title, '本地更新验收');
  console.log('PASS 无效元数据不会覆盖已发布内容');

  await writeFile(file, content(true));
  await waitFor(async () => !(await listed()), '转为草稿');
  assert.equal((await get(`/blog/${slug}`)).status, 404);
  assert.equal((await get(`/api/post/${slug}`)).status, 404);
  const after = await stat(shell); assert.equal(after.mtimeMs, before.mtimeMs);
  console.log('PASS 修改与撤回可见、草稿不可直读，Astro 产物未重建');
} finally {
  if (created) {
    await unlink(file);
    await waitFor(async () => await readFile(resolve(contentRoot, 'posts/index.json'), 'utf8') === originalIndex, '恢复原始索引');
  }
}
