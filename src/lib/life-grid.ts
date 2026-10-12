// Playground title texture: Conway's Game of Life behind the Play heading.
// Same restraint as the hero streams — accent-derived ink, low alpha, no pointer capture.
// The grid is toroidal (cells wrap) and reseeds itself when a pattern dies out. It remains a
// quiet texture rather than an interactive board.
import { clamp, flatten, luminance, onAppearance, onResize, onVisibility, parseColor, rgba, type Rgb } from './ambient';

const MAX_DPR = 2;
const MIN_CELL = 20;
const STEP_SECONDS = 0.28;   // ≈3.5 generations/s: slow enough for a quiet background texture
const SETTLE_STEPS = 3;      // seeded patterns get a head start before the first paint

// Still lifes and oscillators are dropped in so the field never decays into noise-only.
const PATTERNS: number[][][] = [
  [[0, 1], [1, 1], [2, 1]],                                   // blinker
  [[0, 0], [0, 1], [1, 0], [1, 1]],                           // block
  [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],                   // toad
  [[0, 0], [1, 1], [2, 0], [2, 1], [2, 2]],                   // r-pentomino
  [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],                   // glider
];

/** Cell size and grid size from the panel box: cells stay square and centred. */
export function resolveLifeGrid(width: number, height: number) {
  const cell = clamp(Math.round(Math.min(width, height) / 17), MIN_CELL, 28);
  const gap = Math.max(2, Math.round(cell * 0.13));
  const cols = Math.max(6, Math.floor(width / cell));
  const rows = Math.max(4, Math.floor(height / cell));
  return { cell, gap, cols, rows, offsetX: (width - cols * cell) / 2, offsetY: (height - rows * cell) / 2 };
}

export interface LifeGrid { dispose(): void }

export function bootLifeGrid(canvas: HTMLCanvasElement): LifeGrid {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dispose() {} };

  let width = 0, height = 0, dpr = 1, cell = MIN_CELL, gap = 3, cols = 8, rows = 6, offsetX = 0, offsetY = 0;
  let current = new Uint8Array(1);
  let next = new Uint8Array(1);
  let age = new Float32Array(1);
  let alive = new Uint8Array(1);
  let generation = 0, clock = 0, raf = 0, running = false, visible = true, reduced = false, stepAccumulator = 0;
  let palette: { accent: Rgb; soft: Rgb; dark: boolean } | null = null;

  function readPalette() {
    const style = getComputedStyle(canvas);
    const accent = parseColor(style.getPropertyValue('--accent').trim()) ?? parseColor('#14617c')!;
    const soft = parseColor(style.getPropertyValue('--soft').trim()) ?? parseColor('#e4edf0')!;
    const bg = parseColor(style.getPropertyValue('--bg').trim()) ?? soft;
    return { accent, soft, dark: luminance(bg) < 0.42 };
  }

  function allocate() {
    const size = resolveLifeGrid(width, height);
    ({ cell, gap, cols, rows, offsetX, offsetY } = size);
    const total = cols * rows;
    current = new Uint8Array(total);
    next = new Uint8Array(total);
    age = new Float32Array(total);
    alive = new Uint8Array(total);
    return total;
  }

  function seed() {
    const total = allocate();
    generation = 0;
    const seeds = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < seeds; i++) stamp(PATTERNS[Math.floor(Math.random() * PATTERNS.length)]);
    const density = 0.16 + Math.random() * 0.05;
    for (let i = 0; i < total; i++) if (Math.random() < density) current[i] = 1;
    for (let i = 0; i < total; i++) age[i] = current[i];
    for (let i = 0; i < SETTLE_STEPS; i++) advance();
    paint();
  }

  function stamp(pattern: number[][]) {
    const px = 1 + Math.floor(Math.random() * Math.max(1, cols - 6));
    const py = 1 + Math.floor(Math.random() * Math.max(1, rows - 6));
    for (const [dx, dy] of pattern) {
      const x = (px + dx) % cols, y = (py + dy) % rows;
      current[y * cols + x] = 1;
    }
  }

  /** B3/S23 on a wrapping grid; `age` drives the fade so deaths dissolve instead of blinking out. */
  function advance() {
    alive.fill(0);
    for (let i = 0; i < current.length; i++) if (current[i]) alive[i] = 1;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const left = (x - 1 + cols) % cols, right = (x + 1) % cols;
        const up = (y - 1 + rows) % rows, down = (y + 1) % rows;
        const sum = alive[up * cols + left] + alive[up * cols + x] + alive[up * cols + right]
          + alive[y * cols + left] + alive[y * cols + right]
          + alive[down * cols + left] + alive[down * cols + x] + alive[down * cols + right];
        const on = current[i] === 1;
        next[i] = (on && (sum === 2 || sum === 3)) || (!on && sum === 3) ? 1 : 0;
      }
    }
    for (let i = 0; i < current.length; i++) {
      if (next[i]) age[i] = Math.min(1, age[i] + 0.5);
      else age[i] = Math.max(0, age[i] - 0.28);
    }
    const swap = current; current = next; next = swap;
    generation++;
  }

  function paint() {
    if (!palette) palette = readPalette();
    const { accent, soft, dark } = palette;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, width, height);
    const inset = Math.max(1, gap * 0.5);
    const side = cell - gap;
    const born = flatten(accent, soft, dark ? 0.82 : 0.48);
    const decay = flatten(accent, soft, dark ? 0.38 : 0.2);
    ctx!.globalCompositeOperation = 'source-over';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const on = current[i] === 1;
        if (!on && age[i] <= 0.02) continue;
        // A newborn reads brighter for one generation; a death fades on its `age` tail.
        ctx!.fillStyle = on
          ? rgba(born, age[i] === 1 ? (dark ? 0.38 : 0.3) : (dark ? 0.31 : 0.23))
          : rgba(decay, age[i] * (dark ? 0.18 : 0.12));
        ctx!.fillRect(offsetX + x * cell + inset, offsetY + y * cell + inset, side, side);
      }
    }
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - clock) / 1000, 0.001, 0.25);
    clock = now;
    stepAccumulator += dt;
    if (stepAccumulator >= STEP_SECONDS) {
      stepAccumulator = 0;
      advance();
      if (generation > 60 && population() < cols * rows * 0.012) seed();
    }
    paint();
  }

  function population() {
    let total = 0;
    for (let i = 0; i < current.length; i++) if (current[i]) total++;
    return total;
  }

  /** One generation per `STEP_SECONDS`, so the population is legible rather than a shimmer. */
  function start() {
    if (running || reduced) return;
    running = true; clock = performance.now(); stepAccumulator = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }
  function applyMotion() {
    reduced = document.documentElement.dataset.motion === 'off' ||
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduced) stop();
    else if (visible && !document.hidden) start();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    dpr = clamp(window.devicePixelRatio || 1, 1, MAX_DPR);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    seed();
  }

  resize();
  applyMotion();

  onResize(canvas, () => { resize(); applyMotion(); if (reduced) paint(); });
  const unobserve = onVisibility(canvas, (isVisible) => {
    visible = isVisible;
    if (visible && !document.hidden && !reduced) start(); else stop();
  });
  onAppearance(() => { palette = readPalette(); applyMotion(); paint(); });
  const onHidden = () => { if (document.hidden) stop(); else if (visible && !reduced) start(); };
  document.addEventListener('visibilitychange', onHidden);

  if (!reduced && visible && !document.hidden) start();

  return {
    dispose() {
      stop();
      unobserve();
      document.removeEventListener('visibilitychange', onHidden);
    },
  };
}
