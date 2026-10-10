import type { IntroPlayer } from './player';

const LITE_DURATION = 2800;
const LOAD_TIMEOUT = 1500;

function supportsWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch { return false; }
}

/**
 * Runs the home intro if IntroGate decided to play it.
 * Owns the DOM lifecycle (lock, skip, fade-out, cleanup); the Three.js player is loaded on demand.
 */
export function bootIntro() {
  const root = document.documentElement;
  const found = document.querySelector<HTMLElement>('[data-intro-root]');
  if (!found) return;
  const overlay: HTMLElement = found;
  if (root.dataset.intro !== 'play') { overlay.remove(); return; }

  root.dataset.introClaimed = 'true';
  overlay.classList.add('is-active');
  const locked = Array.from(document.body.children).filter((el): el is HTMLElement => el !== overlay && el instanceof HTMLElement && el.tagName !== 'SCRIPT');
  locked.forEach((el) => { el.inert = true; });

  let player: IntroPlayer | undefined;
  let finished = false;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    player?.dispose();
    overlay.remove();
    delete root.dataset.introClaimed;
    delete root.dataset.introVariant;
  };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(true); };
  const onPreferences = () => { if (root.dataset.motion === 'off') finish(true); };
  const onVisibility = () => { if (document.hidden) player?.pause(); else player?.resume(); };

  function finish(fast = false) {
    if (finished) return; finished = true;
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('preferenceschange', onPreferences);
    document.removeEventListener('visibilitychange', onVisibility);
    player?.pause();
    overlay.style.setProperty('--intro-fade', fast ? '250ms' : '450ms');
    overlay.classList.add('is-leaving');
    root.dataset.intro = 'done';
    locked.forEach((el) => { el.inert = false; });
    overlay.addEventListener('transitionend', (event) => { if (event.target === overlay) cleanup(); });
    window.setTimeout(cleanup, 800);
    window.dispatchEvent(new Event('introend'));
  }

  overlay.querySelector('[data-intro-skip]')?.addEventListener('click', () => finish(true));
  window.addEventListener('keydown', onKey);
  window.addEventListener('preferenceschange', onPreferences);
  document.addEventListener('visibilitychange', onVisibility);

  const playLite = () => {
    overlay.classList.add('is-lite');
    window.setTimeout(() => finish(), LITE_DURATION);
  };

  if (root.dataset.introVariant === 'lite' || !supportsWebGL2()) { playLite(); return; }

  const lowPower = window.innerWidth < 768 || (navigator.hardwareConcurrency || 4) < 4;
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), LOAD_TIMEOUT));
  void Promise.race([import('./player'), timeout]).catch(() => null).then((mod) => {
    if (finished) return;
    if (!mod) { finish(true); return; }
    try {
      const pick = <T extends HTMLElement = HTMLElement>(selector: string) => {
        const el = overlay.querySelector<T>(selector);
        if (!el) throw new Error(`Intro element missing: ${selector}`);
        return el;
      };
      player = mod.createIntro({
        canvas: pick<HTMLCanvasElement>('[data-intro-canvas]'),
        flash: pick('[data-intro-flash]'),
        hud: pick('[data-intro-hud]'),
        phase: pick('[data-intro-phase]'),
        coord: pick('[data-intro-coord]'),
        progress: pick('[data-intro-progress]'),
        vignette: pick('[data-intro-vignette]'),
        grid: pick('[data-intro-grid]'),
        reticle: pick('[data-intro-reticle]'),
        tagline: pick('[data-intro-tagline]'),
        endColor: getComputedStyle(document.body).backgroundColor,
        quality: lowPower ? 'low' : 'high',
      });
      if (document.hidden) player.pause();
      player.done.then(() => finish(), () => finish(true));
    } catch {
      finish(true);
    }
  });
}
