import test from 'node:test';
import assert from 'node:assert/strict';
import { experiments, matchesQuery, searchText } from '../src/lib/experiments';

test('experiment index entries are unique, link into /fun and carry index tags', () => {
  const ids = experiments.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const item of experiments) {
    assert.ok(item.title.trim(), `${item.id} has a title`);
    assert.ok(item.href.startsWith('/fun/'), `${item.id} links inside the playground`);
    assert.ok(item.tags.length > 0, `${item.id} has at least one tag`);
  }
});

test('search text includes title, description and every tag', () => {
  const focus = experiments.find((item) => item.id === 'focus')!;
  const text = searchText(focus);
  assert.ok(text.includes(focus.title));
  assert.ok(text.includes(focus.description));
  for (const tag of focus.tags) assert.ok(text.includes(tag), `tag ${tag} is searchable`);
});

test('a blank query matches every entry', () => {
  for (const item of experiments) {
    assert.equal(matchesQuery(searchText(item), ''), true);
    assert.equal(matchesQuery(searchText(item), '   '), true);
  }
});

test('matching is case-insensitive and works for Chinese and English terms', () => {
  assert.equal(matchesQuery('Reaction TIME 限时', 'time'), true);
  assert.equal(matchesQuery('Reaction TIME 限时', 'Limited'), false);
  assert.equal(matchesQuery('答案之书 UAPI 实时接口', 'uapi'), true);
  assert.equal(matchesQuery('答案之书 UAPI 实时接口', '实时'), true);
});

test('a tag hit finds the right entry and nothing else', () => {
  const hits = experiments.filter((item) => matchesQuery(searchText(item), 'UAPI'));
  assert.deepEqual(hits.map((item) => item.id), ['answerbook']);
});

test('multiple tokens must all match', () => {
  const focus = experiments.find((item) => item.id === 'focus')!;
  const text = searchText(focus);
  assert.equal(matchesQuery(text, '限时 统计'), true);
  assert.equal(matchesQuery(text, '限时 UAPI'), false);
  assert.equal(matchesQuery(text, '  限时   统计  '), true, 'extra whitespace is ignored');
});

test('a query that matches nothing returns no entries', () => {
  const hits = experiments.filter((item) => matchesQuery(searchText(item), '不存在的关键词zzz'));
  assert.equal(hits.length, 0);
});
