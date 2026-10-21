import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/SitePet.astro', import.meta.url), 'utf8');
test('controls markup: independent accessible triangle handle follows actor, without nested buttons', () => {
  assert.match(source, /data-pet-touch aria-label="和站宠打招呼"/);
  assert.match(source, /<\/button>\s*<button[^>]*data-pet-drag[^>]*aria-label="拖动站宠"[^>]*Shift \+ 方向键[^>]*hidden>/);
  assert.match(source, /\.pet-drag svg \{ width: 16px; height: 16px;/);
  assert.match(source, /\.pet-drag, \.pet-collapse \{[^}]*width: 44px; height: 44px;/);
  assert.match(source, /\.pet-drag \{[^}]*background: transparent;/);
  assert.match(source, /\.pet-touch \{[^}]*cursor: pointer; touch-action: manipulation;/);
  assert.match(source, /\.pet-ball, \.pet-drag \{ cursor: grab; touch-action: none;/);
  assert.match(source, /\.pet-drag:focus-visible/);
  assert.match(source, /\[data-dragging\] \.pet-drag \{ cursor: grabbing;/);
  assert.match(source, /\.pet-collapse \{ top: calc\(-280px \* var\(--pet-scale\) \+ 48px\)/);
});
