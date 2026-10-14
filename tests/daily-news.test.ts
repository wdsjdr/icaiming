import test from 'node:test';
import assert from 'node:assert/strict';
import { encode as encodeJpeg } from 'jpeg-js';
import { beijingDate, shiftDate, isOlderThan, dailyNewsKey, parseDailyNewsKey } from '../workers/aggregator/src/date';
import { hashDistance, imageHash } from '../workers/aggregator/src/image-hash';

// A width×height JPEG built from a per-pixel colour function, encoded at the given quality.
function jpeg(pattern: (x: number, y: number) => [number, number, number], quality = 80): Uint8Array {
  const width = 32;
  const height = 32;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pattern(x, y);
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return encodeJpeg({ width, height, data }, quality).data as unknown as Uint8Array;
}

const ramp = (x: number): [number, number, number] => { const v = Math.round((x * 255) / 31); return [v, v, v]; };
const inverseRamp = (x: number): [number, number, number] => { const v = Math.round(((31 - x) * 255) / 31); return [v, v, v]; };

test('imageHash is stable across re-encoding and separates different pictures', () => {
  const bright = imageHash(jpeg((x) => ramp(x), 90));
  const recompressed = imageHash(jpeg((x) => ramp(x), 30));
  const dark = imageHash(jpeg((x) => inverseRamp(x), 90));
  assert.ok(bright && recompressed && dark);
  assert.equal(hashDistance(bright!, bright!), 0);
  assert.ok(hashDistance(bright!, recompressed!) <= 6, `re-encode distance ${hashDistance(bright!, recompressed!)}`);
  assert.ok(hashDistance(bright!, dark!) > 6, `different pictures distance ${hashDistance(bright!, dark!)}`);
});

test('imageHash returns null for bytes that are not a decodable image', () => {
  assert.equal(imageHash(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), null);
});

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