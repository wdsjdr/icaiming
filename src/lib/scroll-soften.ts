import { clamp } from './ambient';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Softly retires a page's lead section as it scrolls away. A bottom-up mask is paired with a
 * small, uniform blur so the content feels like it recedes instead of being abruptly clipped.
 */
export function bootScrollSoften(target: HTMLElement) {
  const media = matchMedia(REDUCED_MOTION);
  let originTop = target.getBoundingClientRect().top;
  let frame = 0;

  const reset = () => {
    target.classList.remove('is-softening');
    target.style.removeProperty('--soften-progress');
    target.style.removeProperty('--soften-edge');
    target.style.removeProperty('--soften-front');
    target.style.removeProperty('--soften-blur');
  };

  const update = () => {
    frame = 0;
    const motionOff = document.documentElement.dataset.motion === 'off' || media.matches;
    if (motionOff) { reset(); return; }

    const rect = target.getBoundingClientRect();
    if (window.scrollY <= 1) originTop = rect.top;
    const distance = Math.max(1, Math.max(window.innerHeight * 0.58, rect.height * 0.9));
    // Track the lead block's upward travel and clear it from its lower edge toward the top.
    const progress = clamp((originTop - rect.top) / distance, 0, 1);
    if (progress <= 0.001) { reset(); return; }

    target.classList.add('is-softening');
    target.style.setProperty('--soften-progress', progress.toFixed(3));
    const front = progress * 100;
    target.style.setProperty('--soften-front', `${front.toFixed(1)}%`);
    target.style.setProperty('--soften-edge', `${Math.min(100, front + 18).toFixed(1)}%`);
    target.style.setProperty('--soften-blur', `${(progress * 12).toFixed(1)}px`);
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const onPreferences = () => schedule();
  const onMotionChange = () => schedule();

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('preferenceschange', onPreferences);
  media.addEventListener('change', onMotionChange);
  schedule();

  return () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('preferenceschange', onPreferences);
    media.removeEventListener('change', onMotionChange);
    if (frame) cancelAnimationFrame(frame);
    reset();
  };
}

export function bootPageScrollSoften() {
  document.querySelectorAll<HTMLElement>('[data-scroll-soften]').forEach(bootScrollSoften);
}
