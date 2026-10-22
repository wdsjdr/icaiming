// All media share the upstream 640×360 canvas. Only the actor is a hit target.
export const CANVAS = { width: 640, height: 360, feetY: 330, referenceWidth: 462 };
export const HIT_BOX = { x0: 200, y0: 50, x1: 440, y1: 335 };
export interface Point { x: number; y: number }
export interface Viewport { width: number; height: number; left: number; top: number; safeTop: number; safeBottom: number; safeLeft: number; safeRight: number }
export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }
export function clamp(value: number, low: number, high: number) { return Math.max(low, Math.min(value, Math.max(low, high))); }
export function geometry(height: number, expanded: boolean, viewport: Viewport) {
  const margin = 12, top = Math.max(96, viewport.safeTop + margin);
  const actorHeight = Math.min(clamp(height, 80, 180), Math.max(24, (viewport.height - top - viewport.safeBottom - 24) * 285 / 330), Math.max(24, (viewport.width - 68 - viewport.safeLeft - viewport.safeRight) * 285 / 240));
  const scale = actorHeight / 285;
  const half = 120 * scale, above = 280 * scale;
  // Two 44px controls separated by 4px may extend below a very small actor.
  // not just actor height, before choosing expanded presentation.
  const below = Math.max(5 * scale, 92 - above);
  let bounds: Bounds = {
    minX: viewport.left + viewport.safeLeft + margin + half,
    maxX: viewport.left + viewport.width - viewport.safeRight - margin - half - 48,
    minY: viewport.top + top + above,
    maxY: viewport.top + viewport.height - viewport.safeBottom - margin - below,
  };
  expanded = expanded && bounds.minX <= bounds.maxX && bounds.minY <= bounds.maxY;
  const availableWidth = Math.max(1, viewport.width - viewport.safeLeft - viewport.safeRight);
  const availableHeight = Math.max(1, viewport.height - viewport.safeTop - viewport.safeBottom);
  // Compact fallback relaxes header spacing only when there is no room below it.
  // Below 48px even the ball must shrink; never invent an offscreen ordered bound.
  const ballSize = Math.min(48, availableWidth, availableHeight);
  if (!expanded) {
    // The info button sits to the right of the ball, so reserve 32px (24px button + 8px gap) there.
    const infoSpace = 32;
    const mx = Math.min(margin, Math.max(0, (availableWidth - ballSize) / 2));
    const my = Math.min(margin, Math.max(0, (availableHeight - ballSize) / 2));
    const minTop = Math.min(Math.max(96, viewport.safeTop + my), viewport.height - viewport.safeBottom - my - ballSize);
    const minX = viewport.left + viewport.safeLeft + mx + ballSize / 2;
    const maxX = viewport.left + viewport.width - viewport.safeRight - infoSpace - ballSize / 2;
    bounds = {
      minX,
      maxX: Math.max(minX, maxX),
      minY: viewport.top + Math.max(viewport.safeTop, minTop) + ballSize,
      maxY: viewport.top + viewport.height - viewport.safeBottom - my,
    };
  }
  return { expanded, ballSize, scale, actorHeight, canvasWidth: 640 * scale, canvasHeight: 360 * scale, bounds };
}
export function clampAnchor(point: Point, bounds: Bounds): Point {
  return { x: clamp(point.x, bounds.minX, bounds.maxX), y: clamp(point.y, bounds.minY, bounds.maxY) };
}
export function normalize(point: Point, viewport: Viewport): Point {
  return { x: clamp((point.x - viewport.left) / viewport.width, 0, 1), y: clamp((point.y - viewport.top) / viewport.height, 0, 1) };
}
export function restore(point: Point, viewport: Viewport): Point {
  return { x: viewport.left + point.x * viewport.width, y: viewport.top + point.y * viewport.height };
}
export interface WalkPlan { start: number; target: number; direction: 1 | -1 }
export function planWalk(x: number, bounds: Bounds, canvasWidth: number, random = Math.random): WalkPlan | null {
  const left = x - bounds.minX, right = bounds.maxX - x;
  const direction = right > left ? 1 : -1;
  const room = Math.max(left, right);
  const unit = canvasWidth / CANVAS.referenceWidth;
  if (room < 60 * unit) return null; // Never run an entire clip against a wall.
  const distance = Math.min(room, (60 + clamp(random(), 0, 1) * 180) * unit);
  return { start: x, target: x + direction * distance, direction };
}
// The first seven media seconds move; the ~3s reset tail remains at the target.
export function walkPosition(plan: WalkPlan, seconds: number) {
  return plan.start + (plan.target - plan.start) * clamp(seconds / 7, 0, 1);
}
