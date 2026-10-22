import test from 'node:test';
import assert from 'node:assert/strict';
import { geometry, clampAnchor, normalize, restore, planWalk, walkPosition, type Viewport } from '../src/lib/pet/geometry';
import { defaults, parseLayout, readLayout, writeLayout, LAYOUT_KEY } from '../src/lib/pet/preferences';
import { PREFERENCE_KEY } from '../src/lib/pet/session';
const viewport: Viewport = { width: 1200, height: 800, left: 0, top: 0, safeTop: 0, safeBottom: 0, safeLeft: 0, safeRight: 0 };
test('regression: tiny viewport bounds fit the actual ball or actor plus 92px toolbar', () => {
  for (const [width, height] of [[390, 120], [72, 240], [48, 80], [24, 40], [390, 844], [1200, 800]]) {
    const v = { ...viewport, width, height };
    const g = geometry(180, true, v);
    const anchor = clampAnchor({ x: 9999, y: -9999 }, g.bounds);
    if (g.expanded) {
      const toolbar = { x: anchor.x + 120 * g.scale, y: anchor.y - 280 * g.scale };
      assert.ok(toolbar.x + 44 <= width); assert.ok(toolbar.y >= 0); assert.ok(toolbar.y + 92 <= height);
    } else {
      assert.ok(anchor.x - g.ballSize / 2 >= 0); assert.ok(anchor.x + g.ballSize / 2 <= width);
      assert.ok(anchor.y - g.ballSize >= 0); assert.ok(anchor.y <= height);
    }
  }
});
test('compact fallback and normal expanded layout respect feasible safe areas', () => {
  for (const height of [120, 844]) {
    const v = { ...viewport, width: 390, height, safeTop: 24, safeBottom: 20, safeLeft: 12, safeRight: 12 };
    const g = geometry(120, true, v);
    for (const point of [{ x: -999, y: -999 }, { x: 9999, y: 9999 }]) {
      const p = clampAnchor(point, g.bounds);
      if (g.expanded) {
        assert.ok(p.x - 120 * g.scale >= v.safeLeft);
        assert.ok(p.x + 120 * g.scale + 44 <= v.width - v.safeRight);
        assert.ok(p.y - 280 * g.scale >= v.safeTop);
        assert.ok(p.y + Math.max(5 * g.scale, 92 - 280 * g.scale) <= v.height - v.safeBottom);
      } else {
        assert.ok(p.x - g.ballSize / 2 >= v.safeLeft); assert.ok(p.x + g.ballSize / 2 <= v.width - v.safeRight);
        assert.ok(p.y - g.ballSize >= v.safeTop); assert.ok(p.y <= v.height - v.safeBottom);
      }
    }
  }
});
for (const actorHeight of [80, 180]) {
  test(`controls: ${actorHeight}px actor and separated 44px tools fit every safe-area corner`, () => {
    for (const width of [100, 240, 390, 1200]) for (const height of [120, 199, 200, 220, 844]) {
      const v = { ...viewport, width, height, left: 17, top: 23, safeLeft: 12, safeRight: 18, safeTop: 30, safeBottom: 20 };
      const g = geometry(actorHeight, true, v);
      for (const x of [-9999, 9999]) for (const y of [-9999, 9999]) {
        const p = clampAnchor({ x, y }, g.bounds);
        if (!g.expanded) {
          assert.ok(p.x - g.ballSize / 2 >= v.left + v.safeLeft); assert.ok(p.x + g.ballSize / 2 <= v.left + width - v.safeRight);
          assert.ok(p.y - g.ballSize >= v.top + v.safeTop); assert.ok(p.y <= v.top + height - v.safeBottom);
          continue;
        }
        const tools = { x: p.x + 120 * g.scale, y: p.y - 280 * g.scale };
        const collapseTop = tools.y + 48;
        assert.ok(tools.y + 44 < collapseTop, '44px targets do not overlap');
        assert.ok(p.x - 120 * g.scale >= v.left + v.safeLeft + 12 - 1e-9);
        assert.ok(tools.x + 44 <= v.left + width - v.safeRight - 12);
        assert.ok(tools.y >= v.top + Math.max(96, v.safeTop + 12) - 1e-9);
        assert.ok(collapseTop + 44 <= v.top + height - v.safeBottom - 12 + 1e-9);
        assert.ok(p.y + 5 * g.scale <= v.top + height - v.safeBottom - 12 + 1e-9);
      }
    }
  });
}
test('controls: short viewport fallback accounts for full 92px tool column', () => {
  for (const actorHeight of [80, 180]) {
    assert.equal(geometry(actorHeight, true, { ...viewport, width: 390, height: 199 }).expanded, false);
    assert.equal(geometry(actorHeight, true, { ...viewport, width: 390, height: 200 }).expanded, true);
    assert.equal(geometry(actorHeight, true, { ...viewport, width: 390, height: 219, safeBottom: 20 }).expanded, false);
  }
});
test('shared feet anchor, reference actor height, canvas and toolbar bounds', () => {
  const g = geometry(120, true, viewport);
  assert.equal(g.actorHeight, 120); assert.equal(g.canvasWidth, 640 * 120 / 285);
  const anchor = clampAnchor({ x: -500, y: 9999 }, g.bounds);
  assert.equal(anchor.x, g.bounds.minX); assert.equal(anchor.y, g.bounds.maxY);
  assert.deepEqual(restore(normalize(anchor, viewport), viewport), anchor);
  assert.equal(geometry(80, false, viewport).bounds.minX, geometry(180, false, viewport).bounds.minX);
  for (const width of [240, 390, 800]) {
    const v = { ...viewport, width, height: 500, safeBottom: 34, safeTop: 24 };
    const small = geometry(180, true, v);
    assert.ok(small.bounds.minX <= small.bounds.maxX); assert.ok(small.bounds.minY <= small.bounds.maxY);
    assert.ok(small.bounds.maxY + small.scale * 5 <= 500 - 34 - 12);
  }
});
test('collapsed bounds reserve the info button space while the ball stays reachable', () => {
  for (const [width, height] of [[390, 120], [390, 844], [1200, 800], [72, 240], [24, 40]]) {
    const v = { ...viewport, width, height };
    const g = geometry(120, false, v);
    const anchor = clampAnchor({ x: 9999, y: 9999 }, g.bounds);
    assert.equal(g.expanded, false);
    assert.ok(anchor.y - g.ballSize >= v.top + v.safeTop, `ball top stays visible at ${width}x${height}`);
    assert.ok(anchor.y <= v.top + height - v.safeBottom);
    if (v.height - v.safeTop - v.safeBottom - g.ballSize >= 30) assert.ok(anchor.y + 30 <= v.top + height - v.safeBottom, `info button fits under the ball at ${width}x${height}`);
  }
});
test('walk plan prefers room, scales upstream distance, never runs against a wall', () => {
  const bounds = { minX: 50, maxX: 1000, minY: 100, maxY: 700 };
  const right = planWalk(60, bounds, 462, () => 1)!;
  assert.deepEqual(right, { start: 60, target: 300, direction: 1 });
  assert.equal(planWalk(990, bounds, 462, () => 0)!.direction, -1);
  assert.equal(planWalk(60, { ...bounds, maxX: 70 }, 462), null);
  assert.equal(walkPosition(right, 3.5), 180);
  assert.equal(walkPosition(right, 10.042), 300);
});
test('versioned layout validation, legacy off wins, legacy on allows delayed desktop default', () => {
  for (const raw of ['{', '{}', 'null', JSON.stringify({ ...defaults(true), version: 2 }), JSON.stringify({ ...defaults(true), x: '1' }), JSON.stringify({ ...defaults(true), height: null })]) assert.equal(parseLayout(raw, true), null);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  values.set(PREFERENCE_KEY, 'on'); assert.equal(readLayout(storage, true).remembered, false);
  const prefs = { ...defaults(true), mode: 'expanded' as const, height: 180, x: .8, y: .6, autoWalk: false };
  writeLayout(storage, prefs); assert.deepEqual(readLayout(storage, false).prefs, prefs);
  values.set(PREFERENCE_KEY, 'off'); assert.equal(readLayout(storage, true).prefs.mode, 'hidden');
  values.set(LAYOUT_KEY, JSON.stringify({ ...prefs, height: 900, x: -2, y: 2 }));
  const clamped = readLayout(storage, true).prefs;
  assert.equal(clamped.height, 180); assert.equal(clamped.x, 0); assert.equal(clamped.y, 1);
  const denied = readLayout({ getItem() { throw new Error('denied'); }, setItem() {} }, true);
  assert.equal(denied.storageOK, false); assert.equal(denied.remembered, true); assert.equal(denied.prefs.mode, 'collapsed');
});
