import test from 'node:test';
import assert from 'node:assert/strict';
import { assets, autoIds, clickIds } from '../src/lib/pet/assets';
import { AUTO_LIMIT, TOTAL_LIMIT, SESSION_KEY, FAILURE_LIMIT, candidate, readSession, reserve, markSelected, recordFailure, choose, guardStorage, type StorageLike } from '../src/lib/pet/session';
import { walkPosition } from '../src/lib/pet/geometry';

class Memory implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
function setup() { const storage = new Memory(); const s = readSession(storage, () => 0)!; return { storage, s, auto: s.autoPool[0], click: s.clickPool[0] }; }
test('fixed small pools persist across navigation/deployment, without rerolling', () => {
  const { storage, s } = setup();
  assert.equal(s.autoPool.length, 1); assert.equal(s.clickPool.length, 2);
  assert.ok(s.autoPool.every((id) => autoIds.includes(id as typeof autoIds[number])));
  assert.ok(s.clickPool.every((id) => clickIds.includes(id as typeof clickIds[number])));
  const nextPage = { getItem: storage.getItem.bind(storage), setItem: storage.setItem.bind(storage) };
  assert.deepEqual(readSession(nextPage, () => .999), s);
  assert.equal(new Set(s.clickPool).size, 2);
});
test('budgets retain original 3 MiB auto + 8 MiB total request accounting', () => {
  assert.equal(AUTO_LIMIT, 3 * 1048576); assert.equal(TOTAL_LIMIT, 8 * 1048576);
  const { storage, s, auto } = setup();
  s.autoBytes = AUTO_LIMIT - assets[auto].bytes; s.totalBytes = s.autoBytes;
  storage.setItem(SESSION_KEY, JSON.stringify(s));
  assert.equal(reserve(storage, auto, 'auto'), true);
  assert.equal(readSession(storage)!.autoBytes, AUTO_LIMIT);
  assert.equal(readSession(storage)!.totalBytes, AUTO_LIMIT);
  assert.equal(reserve(storage, auto, 'auto'), false);
});
test('click only debits total, and exact total boundary is allowed once', () => {
  const { storage, s, click } = setup();
  s.totalBytes = TOTAL_LIMIT - assets[click].bytes;
  storage.setItem(SESSION_KEY, JSON.stringify(s));
  assert.equal(reserve(storage, click, 'click'), true);
  assert.equal(readSession(storage)!.autoBytes, 0);
  assert.equal(readSession(storage)!.totalBytes, TOTAL_LIMIT);
  assert.equal(reserve(storage, click, 'click'), false);
});
test('failures and cancellations never refund reservations; cooldown and failure limit persist', () => {
  const { storage, click } = setup();
  assert.equal(reserve(storage, click, 'click', 1), true);
  recordFailure(storage, 1);
  assert.equal(readSession(storage)!.totalBytes, assets[click].bytes);
  assert.equal(reserve(storage, click, 'click', 60_000), false);
  assert.equal(reserve(storage, click, 'click', 60_001), true);
  recordFailure(storage, 60_001); recordFailure(storage, 120_001); recordFailure(storage, 180_001);
  assert.equal(readSession(storage)!.failures, FAILURE_LIMIT);
  assert.equal(reserve(storage, click, 'click', 300_000), false);
  assert.equal(readSession(storage)!.totalBytes, assets[click].bytes * 2);
});
test('navigation/BFCache never overwrites a newer ledger with stale memory', () => {
  const { storage, s, click } = setup();
  const stale = structuredClone(s);
  assert.equal(reserve(storage, click, 'click'), true);
  assert.equal(stale.totalBytes, 0);
  assert.equal(reserve(storage, click, 'click'), true);
  assert.equal(readSession(storage)!.totalBytes, assets[click].bytes * 2);
});
test('core/wrong-pool/unselected IDs cannot debit optional ledgers', () => {
  const { storage, auto, click } = setup();
  for (const id of ['idle', 'walk'] as const) assert.equal(reserve(storage, id, 'auto'), false);
  assert.equal(reserve(storage, click, 'auto'), false);
  assert.equal(reserve(storage, auto, 'click'), false);
  const unselected = clickIds.find((id) => !readSession(storage)!.clickPool.includes(id))!;
  assert.equal(reserve(storage, unselected, 'click'), false);
  assert.equal(readSession(storage)!.totalBytes, 0);
});
test('corrupt session data fails closed rather than resetting budgets or pool', () => {
  for (const raw of ['{', '{}', 'null', '[]', JSON.stringify({ ...setup().s, totalBytes: -1 }), JSON.stringify({ ...setup().s, autoPool: ['idle'] }), JSON.stringify({ ...setup().s, totalBytes: TOTAL_LIMIT + 1 })]) {
    const storage = new Memory(); storage.setItem(SESSION_KEY, raw);
    assert.equal(readSession(storage), null); assert.equal(candidate(storage, 'click'), undefined);
    assert.equal(reserve(storage, 'wave', 'click'), false); assert.equal(storage.getItem(SESSION_KEY), raw);
  }
});
test('storage read/write errors prevent optional requests, including transient failures', () => {
  const errors: StorageLike[] = [
    { getItem() { throw new Error('denied'); }, setItem() {} },
    { getItem() { return null; }, setItem() { throw new Error('quota'); } },
  ];
  for (const storage of errors) { assert.equal(readSession(storage), null); assert.equal(reserve(storage, 'wave', 'click'), false); }
  const { storage, click } = setup();
  let fail = true;
  const guarded = guardStorage({ getItem: storage.getItem.bind(storage), setItem(key, value) { if (fail) throw new Error('quota'); storage.setItem(key, value); } });
  assert.equal(reserve(guarded, click, 'click'), false);
  fail = false;
  assert.equal(reserve(guarded, click, 'click'), false);
  assert.equal(readSession(storage)!.totalBytes, 0);
});
test('random candidate avoids immediate repetition where possible, including random edges', () => {
  for (const random of [() => 0, () => .999999, () => 1]) {
    assert.equal(choose(['a', 'b'], 'a', random), 'b'); assert.equal(choose(['a'], 'a', random), 'a');
    assert.equal(choose([], null, random), undefined);
  }
  const { storage, click } = setup(); reserve(storage, click, 'click');
  assert.notEqual(candidate(storage, 'click', () => 0), click);
});
test('walking uses media time for seven seconds, holding its target during reset', () => {
  const right = { start: 100, target: 240, direction: 1 as const };
  const left = { start: 240, target: 100, direction: -1 as const };
  assert.equal(walkPosition(right, 2), 140);
  assert.equal(walkPosition(left, 2), 200);
  assert.equal(walkPosition(right, -1), 100);
  for (const time of [7, 8, 10.042, 100]) assert.equal(walkPosition(right, time), 240);
});
test('confirmed page-local blob selections update repetition history without reserving bytes', () => {
  const { storage, s } = setup();
  for (const id of s.clickPool) assert.equal(reserve(storage, id, 'click'), true);
  const before = readSession(storage)!.totalBytes;
  for (let i = 0; i < 5; i++) {
    const id = candidate(storage, 'click', () => 0)!;
    const previous = readSession(storage)!.lastClick;
    assert.notEqual(id, previous);
    markSelected(storage, id, 'click');
    assert.equal(readSession(storage)!.totalBytes, before);
  }
});
