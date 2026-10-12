import test from 'node:test';
import assert from 'node:assert/strict';
import { DRILL_DURATION_MS, drillProfile, isBetterRecord, parseRecord, pickSpot, summarize } from '../src/lib/focus-drill';

test('drill difficulty ramps from easy to hard across the round', () => {
  const start = drillProfile(0);
  const end = drillProfile(DRILL_DURATION_MS);
  assert.ok(start.size > end.size, 'targets shrink as the round goes on');
  assert.ok(start.life > end.life, 'targets expire sooner as the round goes on');
  assert.ok(end.size >= 20, 'targets stay large enough to click on touch screens');
  assert.deepEqual(drillProfile(-5000), start, 'elapsed time below zero clamps to the opening profile');
  assert.deepEqual(drillProfile(DRILL_DURATION_MS * 3), end, 'elapsed time past the round clamps to the final profile');
});

test('summary reports hits, mean and fastest reaction, and accuracy over spawned targets', () => {
  assert.deepEqual(summarize([], 0), { hits: 0, average: 0, fastest: 0, accuracy: 0 });
  assert.deepEqual(summarize([300, 500, 400], 1), { hits: 3, average: 400, fastest: 300, accuracy: 0.75 });
  assert.equal(summarize([], 4).accuracy, 0, 'pure misses score zero accuracy');
});

test('a better record needs more hits, or equal hits and a faster average', () => {
  const base = { hits: 20, average: 350, accuracy: 0.8 };
  assert.equal(isBetterRecord(base, null), true, 'the first round always becomes the record');
  assert.equal(isBetterRecord({ ...base, hits: 21, average: 500 }, base), true, 'more hits wins even when slower');
  assert.equal(isBetterRecord({ ...base, hits: 19, average: 200 }, base), false, 'fewer hits never wins');
  assert.equal(isBetterRecord({ ...base, average: 300 }, base), true, 'equal hits break ties on speed');
  assert.equal(isBetterRecord({ ...base, average: 400 }, base), false);
});

test('stored records survive a round trip and reject corrupt values', () => {
  const record = { hits: 12, average: 410, accuracy: 0.6 };
  assert.deepEqual(parseRecord(JSON.stringify(record)), record);
  assert.equal(parseRecord(null), null);
  assert.equal(parseRecord('{not json'), null);
  assert.equal(parseRecord(JSON.stringify({ hits: '12' })), null);
  assert.equal(parseRecord('null'), null);
});

test('target placement stays inside the stage and avoids repeating the last spot', () => {
  const width = 800, height = 500, size = 40;
  const margin = size / 2 + 12;
  const last = { x: 400, y: 250 };
  for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
    const spot = pickSpot(width, height, size, last, () => roll);
    assert.ok(spot.x >= margin && spot.x <= width - margin, `x inside bounds, got ${spot.x}`);
    assert.ok(spot.y >= margin && spot.y <= height - margin, `y inside bounds, got ${spot.y}`);
  }
  const far = pickSpot(width, height, size, last, () => 0.999);
  assert.ok(Math.hypot(far.x - last.x, far.y - last.y) >= Math.min(width, height) * 0.3, 'the next target flicks away');
  const tiny = pickSpot(40, 40, 60, null, () => 0.5);
  assert.ok(Number.isFinite(tiny.x) && Number.isFinite(tiny.y), 'a stage smaller than the target still yields a point');
});
