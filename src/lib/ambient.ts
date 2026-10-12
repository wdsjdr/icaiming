// Shared plumbing for the decorative background canvases (hero streams, playground life grid).
// These effects are ornament: they must never fetch, never steal a pointer event, and must
// stand still when the visitor asked for less motion.

export type Rgb = readonly [number, number, number];

/** DSH-accent friendly palette reader. Values come from CSS variables, so skins stay in charge. */
export function readPalette(el: Element) {
  const style = getComputedStyle(el);
  const pick = (name: string, fallback: string) => parseColor(style.getPropertyValue(name).trim()) ?? parseColor(fallback)!;
  return {
    accent: pick('--accent', '#14617c'),
    line: pick('--line', '#d6e0e3'),
    soft: pick('--soft', '#e4edf0'),
    surface: pick('--surface', '#ffffff'),
    ink: pick('--ink', '#162d35'),
    bg: parseColor(style.getPropertyValue('--bg').trim()) ?? pick('--soft', '#e4edf0'),
  };
}
export type Palette = ReturnType<typeof readPalette>;

/** Accepts #rgb, #rrggbb, rgb()/rgba() and comma-free modern syntax; returns null when unknown. */
export function parseColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(text);
  if (hex) {
    const digits = hex[1];
    // #abc / #abcd: each digit is a nibble doubled into a byte.
    if (digits.length === 3 || digits.length === 4) return [0, 1, 2].map((i) => parseInt(digits[i] + digits[i], 16)) as unknown as Rgb;
    if (digits.length === 6 || digits.length === 8) return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as unknown as Rgb;
    return null;
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(text);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) return [parts[0], parts[1], parts[2]] as unknown as Rgb;
  }
  return null;
}
/** Relative luminance in 0–1, enough to tell a light skin from a dark one. */
export function luminance([r, g, b]: Rgb) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }
export function rgba([r, g, b]: Rgb, alpha: number) { return `rgba(${r},${g},${b},${alpha})`; }
export function shade([r, g, b]: Rgb, amount: number): Rgb {
  const toward = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return [r + (toward - r) * t, g + (toward - g) * t, b + (toward - b) * t] as unknown as Rgb;
}
/** Flattens onto the page background, because the trail colours of additive blending are opaque. */
export function flatten(front: Rgb, back: Rgb, alpha: number): Rgb {
  return [front[0] * alpha + back[0] * (1 - alpha), front[1] * alpha + back[1] * (1 - alpha), front[2] * alpha + back[2] * (1 - alpha)] as unknown as Rgb;
}

export const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);
export const randomRange = (min: number, max: number) => min + Math.random() * (max - min);

/** Reduced motion, or the site's own animation switch. Both are announced by lib/theme.ts. */
export const motionAllowed = () => document.documentElement.dataset.motion !== 'off';
export const onPreferences = (run: () => void) => window.addEventListener('preferenceschange', run);
/** Re-read palette + restart or freeze whenever the visitor flips mode, skin or motion. */
export function onAppearance(run: (reason: 'palette' | 'motion') => void) {
  let last = `${document.documentElement.dataset.mode}|${document.documentElement.dataset.theme}`;
  onPreferences(() => {
    const now = `${document.documentElement.dataset.mode}|${document.documentElement.dataset.theme}`;
    const reason = now === last ? 'motion' : 'palette';
    last = now;
    run(reason);
  });
}
/** Pauses when the panel is off screen or the tab is hidden; resumes without replaying lost time. */
export function onVisibility(target: Element, run: (visible: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => run(entry.isIntersecting)), { rootMargin: '120px' });
  observer.observe(target);
  return () => observer.disconnect();
}

/** Sizing shared by both canvases: CSS pixels for drawing, capped DPR for fill rate. */
function fitCanvas(canvas: HTMLCanvasElement, maxDpr = 2) {
  const rect = canvas.getBoundingClientRect();
  const dpr = clamp(window.devicePixelRatio || 1, 1, maxDpr);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  return { width, height, dpr };
}
/** Re-fits on layout changes; debounced because a resize storms during mobile scroll. */
export function onResize(canvas: HTMLCanvasElement, run: (size: { width: number; height: number; dpr: number }) => void) {
  let timer: number | undefined;
  const measure = () => { clearTimeout(timer); timer = window.setTimeout(() => run(fitCanvas(canvas)), 160); };
  if (typeof ResizeObserver === 'undefined') window.addEventListener('resize', measure, { passive: true });
  else new ResizeObserver(measure).observe(canvas);
  window.addEventListener('orientationchange', measure, { passive: true });
}
