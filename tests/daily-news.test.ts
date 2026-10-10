import test from 'node:test';
import assert from 'node:assert/strict';
import { beijingDate, shiftDate, isOlderThan, dailyNewsKey, parseDailyNewsKey } from '../workers/aggregator/src/date';

test('beijingDate converts UTC to the Beijing calendar day', () => {
  assert.equal(beijingDate(new Date('2026-10-10T15:59:00Z')), '2026-10-10');
  assert.equal(beijingDate(new Date('2026-10-10T16:00:00Z')), '2026-10-11');
  assert.equal(beijingDate(new Date('2026-12-31T16:30:00Z')), '2027-01-01');
});

test('shiftDate handles month, year and leap boundaries', () => {
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDate('2026-10-11', -365), '2025-10-11');
});

test('isOlderThan compares ISO dates', () => {
  assert.equal(isOlderThan('2025-09-01', '2025-10-01'), true);
  assert.equal(isOlderThan('2025-10-01', '2025-10-01'), false);
  assert.equal(isOlderThan('2025-11-01', '2025-10-01'), false);
});

test('daily news keys round-trip and reject foreign keys', () => {
  assert.equal(dailyNewsKey('2026-10-11'), 'misc/daily-news/2026-10-11.jpg');
  assert.equal(parseDailyNewsKey('misc/daily-news/2026-10-11.jpg'), '2026-10-11');
  assert.equal(parseDailyNewsKey('misc/daily-news/index.json'), null);
  assert.equal(parseDailyNewsKey('misc/hotboard/weibo.json'), null);
});