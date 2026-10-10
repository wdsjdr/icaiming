import { themeStore, colorModeStore, motionStore, type Mode, type Theme } from '../stores/preferences';

const root = document.documentElement;
const themes = ['default', 'terminal', 'newspaper'];
const modes = ['light', 'dark', 'system'];
function saved(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function save(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Preferences still work in memory. */ } }
const params = new URLSearchParams(location.search);
const theme = params.get('theme') ?? saved('theme', 'default');
const mode = params.get('mode') ?? saved('colorMode', 'system');
themeStore.set((themes.includes(theme) ? theme : 'default') as Theme);
colorModeStore.set((modes.includes(mode) ? mode : 'system') as Mode);
motionStore.set(saved('motion', 'on') !== 'off');
const darkMedia = matchMedia('(prefers-color-scheme: dark)');
const motionMedia = matchMedia('(prefers-reduced-motion: reduce)');
function apply() {
  root.dataset.theme = themeStore.get();
  root.dataset.mode = colorModeStore.get() === 'system' ? (darkMedia.matches ? 'dark' : 'light') : colorModeStore.get();
  root.dataset.motion = motionStore.get() && !motionMedia.matches ? 'on' : 'off';
  document.querySelectorAll<HTMLSelectElement>('[data-mode-select]').forEach((el) => el.value = colorModeStore.get());
  document.querySelectorAll<HTMLSelectElement>('[data-skin-select]').forEach((el) => el.value = themeStore.get());
  document.querySelectorAll<HTMLInputElement>('[data-motion-toggle]').forEach((el) => el.checked = motionStore.get());
  const button = document.querySelector('[data-theme-toggle]');
  button?.setAttribute('aria-label', root.dataset.mode === 'dark' ? '切换到亮色模式' : '切换到暗色模式');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', root.dataset.mode === 'dark' ? '#10191e' : '#f4f7f7');
  window.dispatchEvent(new Event('preferenceschange'));
}
themeStore.subscribe(apply); colorModeStore.subscribe(apply); motionStore.subscribe(apply);
darkMedia.addEventListener('change', apply); motionMedia.addEventListener('change', apply);
function clearPreview() {
  const url = new URL(location.href); url.searchParams.delete('theme'); url.searchParams.delete('mode');
  history.replaceState(null, '', url);
  const storedTheme = saved('theme', 'default'); const storedMode = saved('colorMode', 'system');
  themeStore.set((themes.includes(storedTheme) ? storedTheme : 'default') as Theme);
  colorModeStore.set((modes.includes(storedMode) ? storedMode : 'system') as Mode);
}
document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
  const mode = root.dataset.mode === 'dark' ? 'light' : 'dark'; clearPreview();
  save('colorMode', mode); colorModeStore.set(mode);
});
document.querySelector<HTMLSelectElement>('[data-mode-select]')?.addEventListener('change', (event) => {
  const mode = (event.target as HTMLSelectElement).value as Mode; clearPreview();
  save('colorMode', mode); colorModeStore.set(mode);
});
document.querySelector<HTMLSelectElement>('[data-skin-select]')?.addEventListener('change', (event) => {
  const theme = (event.target as HTMLSelectElement).value as Theme; clearPreview();
  save('theme', theme); themeStore.set(theme);
});
document.querySelector<HTMLInputElement>('[data-motion-toggle]')?.addEventListener('change', (event) => {
  const enabled = (event.target as HTMLInputElement).checked;
  save('motion', enabled ? 'on' : 'off'); motionStore.set(enabled);
});
window.addEventListener('storage', () => {
  const current = new URLSearchParams(location.search);
  const theme = current.get('theme') ?? saved('theme', 'default'); const mode = current.get('mode') ?? saved('colorMode', 'system');
  themeStore.set((themes.includes(theme) ? theme : 'default') as Theme);
  colorModeStore.set((modes.includes(mode) ? mode : 'system') as Mode);
  motionStore.set(saved('motion', 'on') !== 'off');
});
const menu = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const nav = document.querySelector<HTMLElement>('[data-mobile-nav]');
function closeMenu() { menu?.setAttribute('aria-expanded', 'false'); nav?.classList.remove('is-open'); }
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open)); nav?.classList.toggle('is-open', open);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { if (menu?.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); }
    document.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((el) => { el.open = false; el.querySelector('summary')?.focus(); }); }
});
document.addEventListener('click', (event) => {
  if (!(event.target as Element).closest('.site-header')) closeMenu();
  document.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((el) => { if (!el.contains(event.target as Node)) el.open = false; });
});
matchMedia('(min-width: 800px)').addEventListener('change', closeMenu);
