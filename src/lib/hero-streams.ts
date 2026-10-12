// Home hero background: Reynolds' boids, drawn as dragging light rather than birds.
// Each agent keeps a little history of where it has been and that history is stroked as a
// tapered streak, so speed reads as trail length. Everything visual comes from CSS variables,
// and the module owns its own lifecycle (visibility, resize, appearance, reduced motion).
import { clamp, flatten, luminance, onAppearance, onResize, onVisibility, parseColor, randomRange, rgba } from './ambient';

/** Behaviour of the flock. Exported as a live object so the feel can be tuned in a browser session. */
export const streamTuning = {
  perception: 32,       // neighbour radius (px)
  separationAt: 11,     // inner radius where crowding pushes back
  maxSpeed: 120,        // px/s at cruise
  minSpeed: 46,
  maxForce: 240,        // px/s² steering budget
  separation: 1.7,      // preserve a little breathing room without scattering the current
  alignment: 1.5,       // neighboring agents follow the same broad stream
  cohesion: 1.05,       // enough to read as a flock, not enough to form a knot
  wander: 17,           // small organic variation around the smooth field
  wanderRate: 0.72,
  tailMin: 0.58,         // longer, softer lines make the collective motion legible
  tailMax: 1.02,
  tailLength: 92,
  segments: 12,
};
export function setStreamTuning(patch: Partial<typeof streamTuning>) {
  Object.assign(streamTuning, patch);
}
const TAIL_SAMPLES = 200;   // history ring: 200 frames ≈ 3.3s at 60fps, past the longest streak
const MAX_DPR = 2;
const PERCEPTION = 32;      // match the live perception radius so neighboring cells are not missed
const BOUNDARY = 74;        // soft wall depth: agents turn before they reach the edge
const POINTER_RADIUS = 96;  // personal space around the cursor
const POINTER_PUSH = 62;
const FLOW_STEER = 1.15;

/** Convert a trail's time span to history samples; the ring stores one point per rendered frame. */
export function resolveTrailSampleStep(spanSeconds: number, segments: number, frameSeconds: number) {
  return Math.max(1, spanSeconds / Math.max(1, segments) / Math.max(frameSeconds, 1 / 240));
}

/**
 * Agent count from the panel's device-pixel budget. Density follows the field the visitor sees,
 * and only a genuinely heavy canvas (a retina viewport, an ultra-wide display) eases back, so an
 * ordinary screen is never taxed for a pixel ratio it does not spend.
 */
export function resolveStreamTuning(width: number, height: number, dpr: number) {
  const area = Math.max(0, width) * Math.max(0, height);
  const devicePixels = area * clamp(dpr, 1, MAX_DPR) ** 2;
  const throttle = devicePixels > 3.4e6 ? 0.72 : 1;
  const count = Math.round(clamp((area / 3600) * throttle, 78, 230));
  return { count, widthScale: clamp(dpr, 1, MAX_DPR) };
}

interface Boid {
  x: number; y: number; vx: number; vy: number;
  ax: number; ay: number; near: number; phase: number;
  ringX: Float32Array; ringY: Float32Array; cursor: number;
}
interface Ripple { x: number; y: number; radius: number; speed: number; life: number }
interface Streams { dispose(): void }

export function bootHeroStreams(canvas: HTMLCanvasElement): Streams {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dispose() {} };
  // The panel's coordinate readout reports the flock's own centroid: the effect is measured, not drawn.
  const readout = document.querySelector<HTMLElement>('[data-flock-coord]');
  // The streak ink lives in a shadow buffer that fades its own alpha, so the visible canvas stays
  // transparent and only the light itself is painted over the page.
  const shadow = document.createElement('canvas');
  const ink = shadow.getContext('2d')!;

  let palette = readPalette();
  let width = 0, height = 0, dpr = 1;
  let boids: Boid[] = [];
  let grid = new HashGrid();
  let raf = 0, running = false, visible = true, reduced = false;
  let last = 0, frameStep = 1 / 60, wobble = Math.random() * 100, frameCount = 0;
  const ripples: Ripple[] = [];
  const pointer = { x: -1e5, y: -1e5, strength: 0 };

  function readPalette() {
    const style = getComputedStyle(canvas);
    const accent = parseColor(style.getPropertyValue('--accent').trim()) ?? parseColor('#14617c')!;
    const soft = parseColor(style.getPropertyValue('--soft').trim()) ?? parseColor('#e4edf0')!;
    const bg = parseColor(style.getPropertyValue('--bg').trim()) ?? soft;
    const dark = luminance(bg) < 0.42;
    return { accent, soft, bg, dark };
  }

  function seed() {
    boids = Array.from({ length: resolveStreamTuning(width, height, dpr).count }, () => {
      const x = randomRange(width * 0.04, width * 0.96);
      const y = randomRange(height * 0.04, height * 0.96);
      const flow = streamDirection(x, y, 0, width, height);
      const angle = Math.atan2(flow.y, flow.x) + randomRange(-0.28, 0.28);
      const speed = randomRange(streamTuning.minSpeed, streamTuning.maxSpeed * 0.8);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      // Pre-fill the history along the agent's heading so the first painted frame — the only one a
      // reduced-motion visitor ever sees — already shows a streak rather than a bare dot.
      const perFrame = 1 / 60;
      const ringX = new Float32Array(TAIL_SAMPLES);
      const ringY = new Float32Array(TAIL_SAMPLES);
      for (let i = 0; i < TAIL_SAMPLES; i++) { ringX[i] = x - vx * perFrame * i; ringY[i] = y - vy * perFrame * i; }
      return { x, y, vx, vy, ax: 0, ay: 0, near: 0, ringX, ringY, cursor: 0, phase: randomRange(0, Math.PI * 2) };
    });
  }

  function resize(force = false) {
    const size = fit();
    if (!force && size.width === width && size.height === height && size.dpr === dpr && boids.length) return;
    ({ width, height, dpr } = size);
    for (const target of [canvas, shadow]) { target.width = Math.round(width * dpr); target.height = Math.round(height * dpr); }
    grid = new HashGrid(width, height);
    seed();
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ink.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, width, height);
    ink.clearRect(0, 0, width, height);
    if (reduced) draw();
  }
  function fit() {
    const rect = canvas.getBoundingClientRect();
    return { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)), dpr: clamp(window.devicePixelRatio || 1, 1, MAX_DPR) };
  }

  /** One frame of the three rules, on a quantised grid so cost stays flat as the flock grows. */
  function step(dt: number, time: number) {
    const T = streamTuning;
    const { cell, cols, rows, heads, next } = grid;
    grid.rebuild(boids);
    const pointerActive = pointer.strength > 0.002;
    const drift = pointerActive ? null : pointerDrift(time);
    const pointerX = pointerActive ? pointer.x : drift!.x;
    const pointerY = pointerActive ? pointer.y : drift!.y;
    const perception2 = T.perception * T.perception;

    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      b.near = 0; b.ax = 0; b.ay = 0;
      const col = clamp(Math.floor(b.x / cell), 0, cols - 1);
      const row = clamp(Math.floor(b.y / cell), 0, rows - 1);
      for (let cy = row - 1; cy <= row + 1; cy++) {
        if (cy < 0 || cy >= rows) continue;
        const base = cy * cols;
        for (let cx = col - 1; cx <= col + 1; cx++) {
          if (cx < 0 || cx >= cols) continue;
          for (let j = heads[base + cx]; j >= 0; j = next[j]) {
            if (j === i) continue;
            const o = boids[j];
            const dx = b.x - o.x, dy = b.y - o.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > perception2 || d2 === 0) continue;
            const d = Math.sqrt(d2);
            b.near++;
            if (d < T.separationAt) { b.ax += (dx / d) * (1 - d / T.separationAt) * T.separation; b.ay += (dy / d) * (1 - d / T.separationAt) * T.separation; }
            b.ax += ((o.vx - b.vx) / T.maxSpeed) * T.alignment;
            b.ay += ((o.vy - b.vy) / T.maxSpeed) * T.alignment;
            b.ax += (-dx / T.perception) * T.cohesion;
            b.ay += (-dy / T.perception) * T.cohesion;
          }
        }
      }
      if (b.near > 0) {
        b.ax /= b.near; b.ay /= b.near;
        const blend = 0.14;
        b.vx += b.ax * T.maxForce * dt * blend;
        b.vy += b.ay * T.maxForce * dt * blend;
      }
      // A low-frequency, shallow current bends each path into a long, coherent S-curve.
      // Reynolds steering remains visible as local variation, while this shared field supplies
      // the calm downstream direction the old random wander was missing.
      const flow = streamDirection(b.x, b.y, time, width, height);
      b.vx += (flow.x * T.maxSpeed - b.vx) * FLOW_STEER * dt;
      b.vy += (flow.y * T.maxSpeed - b.vy) * FLOW_STEER * dt;

      // A small independent wobble keeps paths from looking mechanically identical.
      const turn = Math.sin(time * T.wanderRate + b.phase) * 0.4 + Math.sin(time * (T.wanderRate * 1.8) + b.phase * 1.7) * 0.16;
      const steady = Math.hypot(b.vx, b.vy) || 1;
      b.vx += (-b.vy / steady) * turn * T.wander * dt;
      b.vy += (b.vx / steady) * turn * T.wander * dt;

      const margin = BOUNDARY;
      if (b.y < margin) b.vy += ((margin - b.y) / margin) * T.maxForce * dt;
      if (b.y > height - margin) b.vy -= ((b.y - (height - margin)) / margin) * T.maxForce * dt;

      if (pointerActive) {
        const dx = b.x - pointerX, dy = b.y - pointerY;
        const d2 = dx * dx + dy * dy;
        if (d2 < POINTER_RADIUS * POINTER_RADIUS && d2 > 0.5) {
          const d = Math.sqrt(d2);
          const push = (1 - d / POINTER_RADIUS) ** 2 * POINTER_PUSH * pointer.strength;
          b.vx += (dx / d) * push * dt;
          b.vy += (dy / d) * push * dt;
        }
      }
      for (const ripple of ripples) {
        const dx = b.x - ripple.x, dy = b.y - ripple.y;
        const d = Math.hypot(dx, dy) || 1;
        if (Math.abs(d - ripple.radius) < 34) {
          const weight = (1 - Math.abs(d - ripple.radius) / 34) * ripple.life;
          b.vx += (dx / d) * T.maxForce * 0.38 * weight * dt;
          b.vy += (dy / d) * T.maxForce * 0.38 * weight * dt;
        }
      }

      // Speed window: cruise fast enough to leave a streak, never so fast it teleports.
      const current = Math.hypot(b.vx, b.vy);
      if (current > T.maxSpeed) { const k = T.maxSpeed / current; b.vx *= k; b.vy *= k; }
      else if (current < T.minSpeed && current > 0.01) { const k = T.minSpeed / current; b.vx *= k; b.vy *= k; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      // Wrap downstream rather than bouncing against an invisible wall; discard the old tail
      // on teleport so the loop never draws an accidental line across the whole panel.
      if (b.x > width + 2) {
        b.x = -2;
        b.ringX.fill(b.x); b.ringY.fill(b.y); b.cursor = 0;
      } else if (b.x < -2) {
        b.x = width + 2;
        b.ringX.fill(b.x); b.ringY.fill(b.y); b.cursor = 0;
      }
      if (b.y < 0 || b.y > height) { b.vy = -b.vy * 0.5; b.y = clamp(b.y, 0, height); }

      b.cursor = (b.cursor + 1) % TAIL_SAMPLES;
      b.ringX[b.cursor] = b.x; b.ringY[b.cursor] = b.y;
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const ripple = ripples[i];
      ripple.radius += ripple.speed * dt; ripple.life -= dt * 0.85;
      if (ripple.life <= 0) ripples.splice(i, 1);
    }
    pointer.strength = Math.max(0, pointer.strength - dt * 0.52);
  }

  function pointerDrift(time: number) {
    const n = time * 0.075 + wobble;
    return { x: width * (0.5 + Math.sin(n) * 0.3 + Math.sin(n * 1.7) * 0.12), y: height * (0.5 + Math.cos(n * 1.3) * 0.28) };
  }

  function draw() {
    // Keep the light in the trail itself: no particle heads or detached glow dots.
    const halo = flatten(palette.accent, palette.soft, palette.dark ? 0.42 : 0.18);
    const core = flatten(palette.accent, palette.soft, palette.dark ? 0.76 : 0.46);
    const haloAlpha = palette.dark ? 0.16 : 0.095;
    const coreAlpha = palette.dark ? 0.52 : 0.34;

    // 1. Shadow buffer: erase a little alpha, then lay down this frame's streaks.
    ink.globalCompositeOperation = 'destination-out';
    // The decay per frame sets how much of each streak survives; too fast and the drawn light is
    // cut short long before its geometric length, too slow and old paths smear into a smudge.
    ink.fillStyle = rgba([0, 0, 0], palette.dark ? 0.02 : 0.024);
    ink.fillRect(0, 0, width, height);
    ink.globalCompositeOperation = 'source-over';
    ink.lineCap = 'round'; ink.lineJoin = 'round';
    const T = streamTuning;

    for (const b of boids) {
      const speed = Math.hypot(b.vx, b.vy);
      const span = clamp(T.tailLength / Math.max(speed, 1), T.tailMin, T.tailMax);
      // Keep enough control points for a continuous ribbon; the old pixel/seconds comparison
      // collapsed most trails to three straight segments and made the flock look like dashes.
      const count = clamp(Math.round(T.segments * clamp(span / T.tailMax, 0.72, 1)), 7, T.segments);
      const sampleStep = resolveTrailSampleStep(span, count, frameStep);
      ink.beginPath();
      ink.moveTo(b.x, b.y);
      let tailX = b.x, tailY = b.y;
      for (let i = 1; i <= count; i++) {
        const back = i * sampleStep;
        const whole = Math.floor(back);
        const frac = back - whole;
        const i0 = ((b.cursor - whole) % TAIL_SAMPLES + TAIL_SAMPLES) % TAIL_SAMPLES;
        const i1 = (i0 + 1) % TAIL_SAMPLES;
        tailX = b.ringX[i0] + (b.ringX[i1] - b.ringX[i0]) * frac;
        tailY = b.ringY[i0] + (b.ringY[i1] - b.ringY[i0]) * frac;
        ink.lineTo(tailX, tailY);
      }
      // Each stream fades into the field at the end of its tail rather than terminating as a dot.
      const haloGradient = ink.createLinearGradient(b.x, b.y, tailX, tailY);
      haloGradient.addColorStop(0, rgba(halo, 0));
      haloGradient.addColorStop(0.18, rgba(halo, haloAlpha * 0.62));
      haloGradient.addColorStop(0.68, rgba(halo, haloAlpha));
      haloGradient.addColorStop(1, rgba(halo, 0));
      ink.strokeStyle = haloGradient; ink.lineWidth = 3.2; ink.stroke();
      const coreGradient = ink.createLinearGradient(b.x, b.y, tailX, tailY);
      coreGradient.addColorStop(0, rgba(core, 0));
      coreGradient.addColorStop(0.14, rgba(core, coreAlpha * 0.48));
      coreGradient.addColorStop(0.7, rgba(core, coreAlpha));
      coreGradient.addColorStop(1, rgba(core, 0));
      ink.strokeStyle = coreGradient; ink.lineWidth = 1.1; ink.stroke();
    }

    // 2. Visible canvas: only the softly faded trail ink is composited onto the page.
    ctx!.globalCompositeOperation = 'source-over';
    ctx!.clearRect(0, 0, width, height);
    ctx!.drawImage(shadow, 0, 0, width, height);
    ctx!.globalCompositeOperation = 'source-over';
    if (readout && frameCount % 6 === 0) {
      let sumX = 0, sumY = 0;
      for (const b of boids) { sumX += b.x; sumY += b.y; }
      const scale = 100 / Math.max(1, Math.max(width, height));
      readout.textContent = `X ${(sumX / boids.length * scale).toFixed(1).padStart(3, '0')}\nY ${(sumY / boids.length * scale).toFixed(1).padStart(3, '0')}`;
    }
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0.001, 0.05);
    frameStep = clamp((now - last) / 1000, 1 / 240, 1 / 24);
    last = now;
    frameCount++;
    step(dt, now / 1000);
    draw();
  }

  function start() {
    if (running || reduced) return;
    running = true; last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  }
  function still() {
    stop();
    draw();
  }

  function applyMotion() {
    reduced = document.documentElement.dataset.motion === 'off' ||
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduced) still();
    else if (visible && !document.hidden) start();
  }

  // --- wiring ---------------------------------------------------------------------------
  applyMotion();
  resize();

  const host = canvas.parentElement ?? canvas;
  const track = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < -40 || y < -40 || x > width + 40 || y > height + 40) { pointer.strength = 0; return; }
    const moved = pointer.x < -1e4 ? 0 : Math.hypot(x - pointer.x, y - pointer.y);
    pointer.x = x; pointer.y = y;
    pointer.strength = clamp(pointer.strength + moved / 900 + 0.06, 0, 1);
  };
  const leave = () => { pointer.strength = 0; };
  const click = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    ripples.push({ x: event.clientX - rect.left, y: event.clientY - rect.top, radius: 0, speed: 420, life: 1 });
    if (ripples.length > 4) ripples.shift();
  };
  host.addEventListener('pointermove', track, { passive: true });
  host.addEventListener('pointerleave', leave, { passive: true });
  host.addEventListener('pointerdown', click, { passive: true });

  onResize(canvas, () => resize(true));
  const unobserve = onVisibility(canvas, (isVisible) => {
    visible = isVisible;
    if (visible && !document.hidden && !reduced) start(); else stop();
  });
  onAppearance(() => {
    palette = readPalette();
    applyMotion();
  });
  const onHidden = () => { if (document.hidden) stop(); else if (visible && !reduced) start(); };
  document.addEventListener('visibilitychange', onHidden);

  if (!reduced && visible && !document.hidden) start();

  return {
    dispose() {
      stop();
      unobserve();
      document.removeEventListener('visibilitychange', onHidden);
      host.removeEventListener('pointermove', track);
      host.removeEventListener('pointerleave', leave);
      host.removeEventListener('pointerdown', click);
    },
  };
}

/** A broad, moving current with gentle shear; streamlines stay smooth while the flock evolves. */
export function streamDirection(x: number, y: number, time: number, width: number, height: number) {
  const phase = (x / Math.max(width, 1)) * Math.PI * 2
    + (y / Math.max(height, 1)) * Math.PI * 2.1
    - time * 0.2;
  // Adjacent paths curve together instead of independently orbiting a random target.
  const u = 1 + Math.cos(phase) * 0.17;
  const v = -Math.cos(phase) * 0.4;
  const magnitude = Math.hypot(u, v) || 1;
  return { x: u / magnitude, y: v / magnitude };
}

/** Uniform grid over the panel, rebuilt every frame: head/next linked lists keep queries to 9 cells. */
class HashGrid {
  cell = PERCEPTION; cols: number; rows: number; heads: Int32Array; next: Int32Array;
  constructor(width = 1, height = 1) {
    this.cols = Math.max(1, Math.ceil(width / this.cell));
    this.rows = Math.max(1, Math.ceil(height / this.cell));
    this.heads = new Int32Array(this.cols * this.rows);
    this.next = new Int32Array(0);
  }
  /** Every insert resets `next`, so a bucket can never inherit a stale tail from last frame. */
  rebuild(boids: Boid[]) {
    const { cols, rows, heads, cell } = this;
    heads.fill(-1);
    if (this.next.length < boids.length) this.next = new Int32Array(boids.length);
    const next = this.next;
    for (let i = 0; i < boids.length; i++) {
      const col = clamp(Math.floor(boids[i].x / cell), 0, cols - 1);
      const row = clamp(Math.floor(boids[i].y / cell), 0, rows - 1);
      const key = row * cols + col;
      next[i] = heads[key];
      heads[key] = i;
    }
  }
}
