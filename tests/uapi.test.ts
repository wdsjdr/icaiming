import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlatforms, mapHotboard } from '../workers/aggregator/src/sources/hotboard';
import { mapEpic } from '../workers/aggregator/src/sources/epic';
import { mergePool } from '../workers/aggregator/src/sources/saying';

test('platform config parses type:label pairs and tolerates bare types', () => {
  assert.deepEqual(parsePlatforms('bilibili:B站, weibo:微博'), [
    { type: 'bilibili', label: 'B站' },
    { type: 'weibo', label: '微博' },
  ]);
  assert.deepEqual(parsePlatforms('douyin'), [{ type: 'douyin', label: 'douyin' }]);
  assert.deepEqual(parsePlatforms('weibo:,toutiao:头条,douyin:抖音'), [
    { type: 'weibo', label: 'weibo' },
    { type: 'toutiao', label: '头条' },
    { type: 'douyin', label: '抖音' },
  ]);
  assert.deepEqual(parsePlatforms(''), []);
  assert.deepEqual(parsePlatforms(undefined), []);
});

test('hotboard rows are mapped, cleaned and non-http entries dropped', () => {
  const file = mapHotboard('weibo', {
    update_time: '2026-03-20T21:39:16.000Z',
    list: [
      { index: 1, title: '天气真好', hot_value: 123456, url: 'https://s.weibo.com/x' },
      { title: '第二名', hot_value: '99', url: 'https://s.weibo.com/y', cover: 'https://img/x.jpg' },
      { index: 3, title: '坏链接', url: '/relative' },
      { index: 4, title: '', url: 'https://s.weibo.com/z' },
    ],
  });
  assert.equal(file.type, 'weibo');
  assert.equal(file.updateAt, '2026-03-20T21:39:16.000Z');
  assert.equal(file.items.length, 2);
  assert.deepEqual(file.items[0], { index: 1, title: '天气真好', hotValue: '123456', url: 'https://s.weibo.com/x' });
  assert.equal(file.items[1].index, 2);
  assert.equal(file.items[1].cover, 'https://img/x.jpg');
});

test('hotboard falls back to now when update_time is missing', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const file = mapHotboard('douyin', { list: [] }, now);
  assert.equal(file.updateAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(file.items, []);
});

test('hotboard caps item count to the configured limit', () => {
  const list = Array.from({ length: 10 }, (_, index) => ({ index: index + 1, title: `条目 ${index + 1}`, url: `https://example.com/${index + 1}` }));
  const file = mapHotboard('bilibili', { list }, new Date('2026-01-01T00:00:00.000Z'), 3);
  assert.equal(file.items.length, 3);
  assert.equal(file.items[0].title, '条目 1');
});

test('saying pool merges, deduplicates and caps to newest entries', () => {
  assert.deepEqual(mergePool(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(mergePool(undefined, ['  x  ', '', 'y']), ['x', 'y']);
  assert.deepEqual(mergePool(['1', '2', '3'], ['4'], 3), ['2', '3', '4']);
});

test('epic free games map fields and drop entries without a valid link', () => {
  const items = mapEpic({
    data: [
      { id: 'epic-1', title: 'Control', cover: 'https://cdn/epic.jpg', original_price: 40, original_price_desc: '¥40.00', description: 'desc', seller: 'Remedy', is_free_now: true, free_start_at: 1736438400000, free_end_at: 1737043200000, free_start: '2025/01/10 00:00:00', free_end: '2025/01/17 00:00:00', link: 'https://store.epicgames.com/zh-CN/p/control' },
      { id: 'epic-2', title: 'Bad', link: 'not-a-url' },
      { title: 'NoId', link: 'https://store.epicgames.com/p/x' },
    ],
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].id, 'epic-1');
  assert.equal(items[0].originalPrice, 40);
  assert.equal(items[0].freeEndAt, 1737043200000);
  assert.equal(items[0].isFreeNow, true);
  assert.equal(items[1].id, 'NoId');
});