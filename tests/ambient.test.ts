import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStreamTuning, resolveTrailSampleStep, streamDirection } from '../src/lib/hero-streams';
import { resolveLifeGrid } from '../src/lib/life-grid';
import { flatten, luminance, parseColor, rgba, shade } from '../src/lib/ambient';

test('stream density follows panel area and stays inside its budget', () => {
  const small = resolveStreamTuning(360, 620, 1);
  const wide = resolveStreamTuning(900, 620, 1);
  const desktop = resolveStreamTuning(1180, 760, 1);
  const retina = resolveStreamTuning(1180, 760, 2);
  const ultra = resolveStreamTuning(3840, 2160, 2);
  assert.ok(small.count >= 64 && small.count < wide.count, `small panel keeps a visible flock, got ${small.count}`);
  assert.ok(wide.count < desktop.count, `a larger field carries more agents (${wide.count} vs ${desktop.count})`);
  assert.ok(retina.count < desktop.count, `a retina canvas trades agents for fill rate (${retina.count} vs ${desktop.count})`);
  assert.ok(ultra.count <= 230, `count stays capped on very large fields, got ${ultra.count}`);
  // The throttle is a pixel-budget guard, not a retina tax: an ordinary display is never eased back.
  assert.equal(resolveStreamTuning(1440, 900, 1).count, resolveStreamTuning(1440, 900, 1.25).count);
  assert.deepEqual(resolveStreamTuning(0, 0, 1), { count: 78, widthScale: 1 });
  assert.equal(resolveStreamTuning(320, 400, 3).widthScale, 2, 'device pixel ratio is capped for fill rate');
});

test('stream direction stays forward and bends gently across the panel', () => {
  const samples = [
    streamDirection(0, 0, 0, 1000, 600),
    streamDirection(500, 300, 4, 1000, 600),
    streamDirection(1000, 600, 8, 1000, 600),
  ];
  for (const direction of samples) {
    assert.ok(direction.x > 0.8, 'the current continues downstream rather than orbiting or reversing');
    assert.ok(Math.abs(direction.y) < 0.5, 'vertical drift remains a gentle bend');
    assert.ok(Math.abs(Math.hypot(direction.x, direction.y) - 1) < 1e-9, 'direction stays normalized');
  }
});

test('trail sampling covers the requested time span at the current frame rate', () => {
  const samples = resolveTrailSampleStep(0.72, 12, 1 / 60);
  assert.ok(Math.abs(samples * 12 / 60 - 0.72) < 1e-9, 'all segments cover the full trail duration');
  assert.equal(resolveTrailSampleStep(0.72, 12, 1 / 20), 1.2, 'lower frame rates use fewer history frames');
  assert.equal(resolveTrailSampleStep(0.72, 12, 0), 14.4, 'sample spacing never divides by zero');
});

test('life grid keeps square cells and integer dimensions for any panel', () => {
  for (const [w, h] of [[640, 330], [360, 240], [1200, 520]]) {
    const grid = resolveLifeGrid(w, h);
    assert.ok(Number.isInteger(grid.cols) && Number.isInteger(grid.rows));
    assert.ok(grid.cell >= 20 && grid.cell <= 28, `cell stays legible, got ${grid.cell}`);
    assert.ok(grid.cols * grid.cell <= w && grid.rows * grid.cell <= h, 'grid never overflows its panel');
    assert.ok(grid.gap >= 2 && grid.gap < grid.cell, 'cells keep a gap');
    assert.ok(grid.offsetX >= 0 && grid.offsetY >= 0, 'grid is inset from the edges');
  }
  const tiny = resolveLifeGrid(80, 60);
  assert.ok(tiny.cols >= 6 && tiny.rows >= 4, 'degenerate panels still get a usable grid');
});

test('palette parsing accepts the colour forms a browser may report', () => {
  assert.deepEqual(parseColor('#14617c'), [20, 97, 124]);
  assert.deepEqual(parseColor('#abc'), [170, 187, 204]);
  assert.deepEqual(parseColor('#14617cff'), [20, 97, 124]);
  assert.deepEqual(parseColor('rgb(20, 97, 124)'), [20, 97, 124]);
  assert.deepEqual(parseColor('rgba(20 97 124 / 0.5)'), [20, 97, 124]);
  assert.equal(parseColor('var(--accent)'), null);
  assert.equal(parseColor(''), null);
});

test('colour helpers keep trails readable on light and dark skins', () => {
  assert.ok(luminance([255, 255, 255]) > 0.99 && luminance([0, 0, 0]) === 0);
  assert.equal(rgba([1, 2, 3], 0.5), 'rgba(1,2,3,0.5)');
  assert.deepEqual(shade([100, 100, 100], 0.5), [177.5, 177.5, 177.5]);
  assert.deepEqual(shade([100, 100, 100], -0.5), [50, 50, 50]);
  // Additive trails are opaque: flattening onto the panel keeps them from glowing white on light skins.
  const flat = flatten([20, 97, 124], [228, 237, 240], 0.4);
  assert.ok(flat[0] > 20 && flat[0] < 228, 'flattening mixes toward the background');
  assert.deepEqual(flatten([20, 97, 124], [228, 237, 240], 1), [20, 97, 124]);
});
