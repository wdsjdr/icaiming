import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { LEGAL, articleHeading, internalLinks, legalDocuments, legalHighlights, legalPaths, renderInline, zhNumber } from '../src/lib/legal';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const texts = () => legalDocuments.flatMap((doc) => doc.articles.flatMap((article) => [
  { doc, where: article.id, ...article.title },
  ...article.clauses.flatMap((clause) => [{ doc, where: clause.id, zh: clause.zh, en: clause.en }, ...clause.items.map((item) => ({ doc, where: `${clause.id} ${item.label}`, zh: item.zh, en: item.en }))]),
]));

test('the four legal documents have unique slugs and letters', () => {
  assert.deepEqual(legalDocuments.map((doc) => doc.slug), ['terms', 'privacy', 'disclaimer', 'notices']);
  assert.deepEqual(legalDocuments.map((doc) => doc.code), ['A', 'B', 'C', 'D']);
  for (const doc of legalDocuments) {
    assert.ok(doc.title.zh && doc.title.en && doc.summary.zh && doc.summary.en, `${doc.slug} has bilingual title and summary`);
    assert.ok(doc.articles.length > 0, `${doc.slug} has articles`);
  }
});

test('every heading, clause and item is bilingual and free of draft placeholders', () => {
  for (const { doc, where, zh, en } of texts()) {
    assert.ok(zh.trim(), `${doc.slug} ${where} has Chinese text`);
    assert.ok(en.trim(), `${doc.slug} ${where} has English text`);
    for (const value of [zh, en]) assert.doesNotMatch(value, /待填写|TODO|TBD|【|】/, `${doc.slug} ${where} has no placeholder`);
    assert.doesNotMatch(en, /[\u4e00-\u9fff]/, `${doc.slug} ${where} English text contains no Chinese characters`);
  }
});

test('clause numbers and anchors are sequential and unique within each document', () => {
  for (const doc of legalDocuments) {
    const ids = new Set<string>();
    doc.articles.forEach((article, a) => {
      assert.equal(article.no, a + 1);
      assert.equal(article.id, `article-${a + 1}`);
      ids.add(article.id);
      article.clauses.forEach((clause, c) => {
        assert.equal(clause.no, `${a + 1}.${c + 1}`);
        assert.ok(!ids.has(clause.id), `${doc.slug} ${clause.id} is unique`);
        ids.add(clause.id);
        clause.items.forEach((item, i) => assert.equal(item.label, `(${'abcdefghij'[i]})`));
      });
    });
  }
});

test('internal links in clause texts point at existing documents and anchors', () => {
  const anchors = new Map(legalDocuments.map((doc) => [`/legal/${doc.slug}`, new Set(doc.articles.flatMap((article) => [article.id, ...article.clauses.map((clause) => clause.id)]))]));
  for (const { doc, where, zh, en } of texts()) {
    for (const href of [...internalLinks(zh), ...internalLinks(en)]) {
      if (href === '/robots.txt') continue;
      const [path, hash] = href.startsWith('#') ? [`/legal/${doc.slug}`, href.slice(1)] : href.split('#');
      assert.ok(anchors.has(path), `${doc.slug} ${where} links to an existing document (${href})`);
      if (hash) assert.ok(anchors.get(path)!.has(hash), `${doc.slug} ${where} links to an existing anchor (${href})`);
    }
  }
  for (const item of legalHighlights) {
    const [path, hash] = item.href.split('#');
    assert.ok(anchors.get(path)?.has(hash), `highlight links to an existing anchor (${item.href})`);
  }
});

const profilePath = new URL('../../icaiming-content/site/profile.json', import.meta.url);
test('the contact email is the one published in the site profile', { skip: !existsSync(profilePath) && 'content repo not checked out' }, () => {
  const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as { email: string };
  assert.equal(LEGAL.email, profile.email);
});

test('sitemap, footer and robots.txt expose the legal pages', () => {
  const sitemap = read('../functions/sitemap.xml.ts');
  for (const path of legalPaths) assert.ok(sitemap.includes(`'${path}'`), `sitemap lists ${path}`);
  assert.ok(read('../src/components/layout/Footer.astro').includes('href="/legal"'), 'footer links to /legal');
  assert.ok(read('../public/robots.txt').includes('/legal/notices#article-2'), 'robots.txt points to the crawler policy');
});

test('renderInline escapes HTML and only renders safe links', () => {
  assert.equal(renderInline('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(renderInline('**粗体** 与 `code`'), '<strong>粗体</strong> 与 <code>code</code>');
  assert.equal(renderInline('[条款](/legal/terms#article-3)'), '<a href="/legal/terms#article-3">条款</a>');
  assert.equal(renderInline('[mail](mailto:a@b.cn)'), '<a href="mailto:a@b.cn">mail</a>');
  assert.equal(renderInline('[ext](https://example.com)'), '<a href="https://example.com" target="_blank" rel="noopener noreferrer">ext</a>');
  assert.doesNotMatch(renderInline('[bad](javascript:alert)'), /<a /);
  assert.doesNotMatch(renderInline('[proto](//evil.example)'), /<a /);
  assert.doesNotMatch(renderInline('[x](/a" onclick="y)'), /onclick="/);
});

test('Chinese article numerals and headings', () => {
  assert.deepEqual([1, 9, 10, 11, 12, 20, 21, 99].map(zhNumber), ['一', '九', '十', '十一', '十二', '二十', '二十一', '九十九']);
  assert.throws(() => zhNumber(0));
  const first = legalDocuments[0].articles[0];
  assert.deepEqual(articleHeading(first), { zh: `第一条　${first.title.zh}`, en: `Article 1 · ${first.title.en}` });
});
