import test from 'node:test';
import assert from 'node:assert/strict';
import { initPet } from '../src/lib/pet/runtime';
import { assets, type AssetId } from '../src/lib/pet/assets';
import { PREFERENCE_KEY, SESSION_KEY } from '../src/lib/pet/session';
import { LAYOUT_KEY } from '../src/lib/pet/preferences';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 60; i++) await Promise.resolve(); }
class Memory {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
class ElementStub extends EventTarget {
  dataset: Record<string, string> = {};
  style = Object.assign({} as Record<string, string>, { setProperty(key: string, value: string) { this[key] = value; } });
  hidden = true;
  checked = false; disabled = false; value = '';
  captured = new Set<number>();
  setPointerCapture(id: number) { this.captured.add(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
  textContent = '';
  offsetWidth = 156;
  attributes = new Map<string, string>();
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  focus() {}
  click(detail = 1) { const event = new Event('click', { cancelable: true }); Object.assign(event, { detail }); this.dispatchEvent(event); }
}
class VideoStub extends ElementStub {
  src = ''; muted = true; loop = false; currentTime = 0;
  readyState = 0; videoWidth = 640; duration = 10.042; ended = false; paused = true;
  playCalls = 0;
  nextPlay: ReturnType<typeof deferred<void>> | null = null;
  load() { this.readyState = this.src ? 2 : 0; this.currentTime = 0; this.ended = false; }
  removeAttribute(key: string) { if (key === 'src') this.src = ''; }
  play() {
    this.playCalls++;
    const pending = this.nextPlay; this.nextPlay = null;
    if (pending) return pending.promise.then(() => { this.paused = false; });
    this.paused = false; return Promise.resolve();
  }
  pause() { this.paused = true; }
}

function browser() {
  const original = new Map<PropertyKey, PropertyDescriptor | undefined>();
  function install(key: PropertyKey, value: unknown) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let handle = 0;
  const timers = new Map<number, { callback: () => void; ms: number }>();
  const raf = new Map<number, FrameRequestCallback>();
  const idles = new Map<number, () => void>();
  const timeout = (callback: () => void, ms = 0) => { const id = ++handle; timers.set(id, { callback, ms }); return id; };
  const clear = (id: number) => { timers.delete(id); };
  const host = new ElementStub(), stage = new ElementStub(), toggle = new ElementStub();
  const close = new ElementStub(), touch = new ElementStub(), placeholder = new ElementStub(), status = new ElementStub();
  const ball = new ElementStub(), dragHandle = new ElementStub(), collapse = new ElementStub(), visible = new ElementStub(), autoWalk = new ElementStub(), size = new ElementStub(), sizeValue = new ElementStub(), reset = new ElementStub(), settingsStatus = new ElementStub();
  const videos = [new VideoStub(), new VideoStub()];
  const root = new ElementStub(); root.dataset.motion = 'on'; root.dataset.intro = 'done';
  const elements: Record<string, ElementStub> = { '[data-pet-stage]': stage, '[data-pet-toggle]': toggle,
    '[data-pet-close]': close, '[data-pet-touch]': touch, '[data-pet-placeholder]': placeholder, '[data-pet-status]': status,
    '[data-pet-ball]': ball, '[data-pet-drag]': dragHandle, '[data-pet-collapse]': collapse, '[data-pet-visible]': visible, '[data-pet-autowalk]': autoWalk,
    '[data-pet-size]': size, '[data-pet-size-value]': sizeValue, '[data-pet-reset]': reset, '[data-pet-settings-status]': settingsStatus };
  Object.assign(host, { querySelector: (selector: string) => elements[selector], querySelectorAll: () => videos });
  host.dataset.config = JSON.stringify({ enabled: true, urls: Object.fromEntries(Object.keys(assets).map((id) => [id, `https://pet.example.test/v1/${id}.webm`])) });
  const document = Object.assign(new EventTarget(), { hidden: false, readyState: 'complete', documentElement: root,
    querySelector: (selector: string) => selector === '[data-site-pet]' ? host : elements[selector], querySelectorAll: () => [toggle] });
  const window = Object.assign(new EventTarget(), { setTimeout: timeout, clearTimeout: clear, cancelIdleCallback: (id: number) => { idles.delete(id); } });
  const local = new Memory(), session = new Memory(); local.setItem(PREFERENCE_KEY, 'off');
  const queries = new Map<string, EventTarget & { matches: boolean }>();
  const requests: { id: AssetId; signal: AbortSignal }[] = [];
  const blobs = new Map<string, Blob>();
  let fetchGate: ReturnType<typeof deferred<Response>> | null = null;
  let failFetch = false;
  let observe: (() => void) | undefined;
  const urlOriginal = ['createObjectURL', 'revokeObjectURL'].map((key) => [key, Object.getOwnPropertyDescriptor(URL, key)] as const);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (blob: Blob) => { const url = `blob:pet-${++handle}`; blobs.set(url, blob); return url; } });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: (url: string) => { blobs.delete(url); } });
  install('document', document); install('window', window); install('navigator', { userAgent: 'Chrome' });
  install('localStorage', local); install('sessionStorage', session); install('innerWidth', 1200);
  install('innerHeight', 800);
  install('setTimeout', timeout); install('clearTimeout', clear);
  install('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++handle; raf.set(id, callback); return id; });
  install('cancelAnimationFrame', (id: number) => { raf.delete(id); });
  install('matchMedia', (query: string) => {
    let media = queries.get(query);
    if (!media) { media = Object.assign(new EventTarget(), { matches: !query.includes('reduced-motion') }); queries.set(query, media); }
    return media;
  });
  install('MutationObserver', class { constructor(callback: () => void) { observe = callback; } observe() {} });
  install('fetch', (url: string, options: { signal: AbortSignal }) => {
    const id = new URL(url).pathname.split('/').at(-1)!.replace('.webm', '') as AssetId;
    requests.push({ id, signal: options.signal });
    const pending = fetchGate; fetchGate = null;
    // Deliberately ignore abort here: late responses must still be rejected by the real runtime.
    if (pending) return pending.promise;
    return Promise.resolve(response(id, failFetch));
  });
  function response(id: AssetId, fail = false) {
    return new Response(fail ? null : new Blob([new Uint8Array(assets[id].bytes)], { type: 'video/webm' }), { status: fail ? 503 : 200 });
  }
  function event(name: string, data: Record<string, unknown> = {}) {
    const event = new Event(name); Object.assign(event, data); window.dispatchEvent(event);
  }
  return {
    host, stage, toggle, close, touch, placeholder, status, videos, document, root, timers, raf, requests, blobs, session, local,
    ball, dragHandle, collapse, visible, autoWalk, size, sizeValue, reset, queries,
    event,
    idles,
    useIdle() { Object.assign(window, { requestIdleCallback: (callback: () => void) => { const id = ++handle; idles.set(id, callback); return id; } }); },
    async reduced(value: boolean) {
      matchMedia('(prefers-reduced-motion: reduce)');
      const media = queries.get('(prefers-reduced-motion: reduce)')!;
      media.matches = value; media.dispatchEvent(new Event('change')); await settle();
    },
    async delay() {
      const entry = [...timers].find(([, t]) => t.ms === 2600);
      if (entry) { timers.delete(entry[0]); entry[1].callback(); await settle(); }
      return Boolean(entry);
    },
    pointer(element: ElementStub, name: string, data: Record<string, unknown> = {}) {
      const event = new Event(name, { cancelable: true });
      Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: 150, clientY: 700, ...data });
      element.dispatchEvent(event);
    },
    start: initPet,
    async open() { toggle.click(); await settle(); },
    async shut() { close.click(); await settle(); },
    async preferences() { event('preferenceschange'); await settle(); },
    preferencesNow() { event('preferenceschange'); },
    async hide(value: boolean) { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); await settle(); },
    async motion(value: string) { root.dataset.motion = value; observe?.(); await settle(); },
    async pagehide() { event('pagehide'); await settle(); },
    async pageshow() { event('pageshow', { persisted: true }); await settle(); },
    async walk() {
      const movement = [...timers].find(([, timer]) => timer.ms >= 20_000 && timer.ms < 40_000);
      assert.ok(movement, 'a movement timer must exist'); timers.delete(movement[0]); movement[1].callback(); await settle();
    },
    stepRAF() { const callbacks = [...raf.values()]; raf.clear(); callbacks.forEach((callback) => callback(16)); },
    deferFetch() { fetchGate = deferred<Response>(); return { gate: fetchGate, response }; },
    failFetch() { failFetch = true; },
    activeVideo() { return videos.find((video) => !video.hidden); },
    restore() {
      for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
      for (const [key, descriptor] of urlOriginal) { if (descriptor) Object.defineProperty(URL, key, descriptor); else Reflect.deleteProperty(URL, key); }
    },
  };
}
async function usingBrowser(run: (b: ReturnType<typeof browser>) => Promise<void>) {
  const b = browser();
  try { b.start(); await run(b); } finally { b.restore(); }
}

function key(element: ElementStub, key: string, shiftKey = false) {
  const event = new Event('keydown', { cancelable: true }); Object.assign(event, { key, shiftKey });
  element.dispatchEvent(event); return event;
}
test('controls: actor pointer movement never captures or moves; click still selects an interaction', async () => usingBrowser(async (b) => {
  await b.open(); const x = b.stage.style.left, y = b.stage.style.top, saved = b.local.getItem(LAYOUT_KEY);
  b.pointer(b.touch, 'pointerdown'); assert.equal(b.touch.captured.size, 0);
  b.pointer(b.touch, 'pointermove', { clientX: 400, clientY: 400 }); b.pointer(b.touch, 'pointerup');
  await settle();
  assert.equal(b.stage.style.left, x); assert.equal(b.stage.style.top, y); assert.equal(b.local.getItem(LAYOUT_KEY), saved);
  assert.equal(b.stage.dataset.dragging, undefined); assert.equal(b.requests.length, 2);
  b.touch.click(); await settle();
  const optional = b.requests.at(-1)!;
  assert.equal(b.requests.length, 3); assert.notEqual(optional.id, 'idle'); assert.notEqual(optional.id, 'walk');
  assert.equal(b.touch.dataset.feedback, 'on');
  assert.equal(JSON.parse(b.session.getItem(SESSION_KEY)!).totalBytes, assets[optional.id].bytes);
}));
test('controls: actor arrow keys never move or prevent scrolling; Escape still collapses', async () => usingBrowser(async (b) => {
  await b.open(); const x = b.stage.style.left, y = b.stage.style.top, saved = b.local.getItem(LAYOUT_KEY);
  for (const direction of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    assert.equal(key(b.touch, direction).defaultPrevented, false);
    assert.equal(key(b.touch, direction, true).defaultPrevented, false);
  }
  await settle(); assert.equal(b.stage.style.left, x); assert.equal(b.stage.style.top, y); assert.equal(b.local.getItem(LAYOUT_KEY), saved);
  assert.equal(key(b.touch, 'Escape').defaultPrevented, true); await settle(); assert.equal(b.host.dataset.mode, 'collapsed');
}));
test('controls: handle persists two-dimensional drag, cancels old walk and leaves optional ledger untouched', async () => usingBrowser(async (b) => {
  await b.open(); await b.walk(); const oldWalk = b.activeVideo()!;
  oldWalk.currentTime = 2; b.stepRAF();
  const x = Number.parseFloat(b.stage.style.left), y = Number.parseFloat(b.stage.style.top), ledger = b.session.getItem(SESSION_KEY);
  b.pointer(b.dragHandle, 'pointerdown'); assert.equal(b.dragHandle.captured.size, 1);
  b.pointer(b.dragHandle, 'pointermove', { clientX: 210, clientY: 620 });
  assert.equal(b.stage.dataset.dragging, 'true'); assert.equal(b.raf.size, 0);
  b.pointer(b.dragHandle, 'pointerup'); b.dragHandle.click(); await settle();
  assert.equal(b.dragHandle.captured.size, 0); assert.equal(b.stage.dataset.dragging, undefined);
  assert.equal(Number.parseFloat(b.stage.style.left), x + 60); assert.equal(Number.parseFloat(b.stage.style.top), y - 80);
  const saved = JSON.parse(b.local.getItem(LAYOUT_KEY)!);
  assert.equal(saved.x, (x + 60) / 1200); assert.equal(saved.y, (y - 80) / 800); assert.equal(saved.mode, 'expanded');
  oldWalk.currentTime = 10; oldWalk.dispatchEvent(new Event('ended')); b.stepRAF(); await settle();
  assert.equal(Number.parseFloat(b.stage.style.left), x + 60); assert.equal(b.raf.size, 0);
  assert.equal(b.requests.length, 2); assert.equal(b.session.getItem(SESSION_KEY), ledger); assert.equal(b.touch.dataset.feedback, undefined);
}));
test('controls: handle tap and keyboard activation never interact or switch mode', async () => usingBrowser(async (b) => {
  await b.open(); const saved = b.local.getItem(LAYOUT_KEY), ledger = b.session.getItem(SESSION_KEY);
  b.pointer(b.dragHandle, 'pointerdown'); b.pointer(b.dragHandle, 'pointermove', { clientX: 153 }); b.pointer(b.dragHandle, 'pointerup');
  b.dragHandle.click(1); b.dragHandle.click(0); await settle();
  assert.equal(b.host.dataset.mode, 'expanded'); assert.equal(b.local.getItem(LAYOUT_KEY), saved);
  assert.equal(b.session.getItem(SESSION_KEY), ledger); assert.equal(b.requests.length, 2); assert.equal(b.touch.dataset.feedback, undefined);
}));
for (const termination of ['pointercancel', 'lostpointercapture'] as const) {
  test(`controls: handle ${termination} releases capture and keeps keyboard movement/actor activation usable`, async () => usingBrowser(async (b) => {
    await b.open();
    b.pointer(b.dragHandle, 'pointerdown'); b.pointer(b.dragHandle, 'pointermove', { clientX: 180, clientY: 650 }); b.pointer(b.dragHandle, termination);
    await settle(); assert.equal(b.dragHandle.captured.size, 0); assert.equal(b.stage.dataset.dragging, undefined);
    const x = Number.parseFloat(b.stage.style.left), y = Number.parseFloat(b.stage.style.top);
    b.dragHandle.click(0); key(b.dragHandle, 'ArrowRight'); key(b.dragHandle, 'ArrowUp', true); await settle();
    assert.equal(Number.parseFloat(b.stage.style.left), x + 10); assert.equal(Number.parseFloat(b.stage.style.top), y - 40);
    assert.equal(b.requests.length, 2); assert.equal(JSON.parse(b.session.getItem(SESSION_KEY)!).totalBytes, 0);
    b.touch.click(0); await settle(); assert.equal(b.requests.length, 3, 'handle suppression cannot swallow actor activation');
  }));
}
test('controls: handle is shown only expanded and remains usable with static/paused media', async () => usingBrowser(async (b) => {
  assert.equal(b.dragHandle.hidden, true); assert.equal(b.stage.hidden, true);
  await b.open(); assert.equal(b.dragHandle.hidden, false); assert.equal(b.collapse.hidden, false);
  await b.motion('off');
  const x = Number.parseFloat(b.stage.style.left);
  b.pointer(b.dragHandle, 'pointerdown'); b.pointer(b.dragHandle, 'pointermove', { clientX: 180 }); b.pointer(b.dragHandle, 'pointerup'); await settle();
  assert.equal(Number.parseFloat(b.stage.style.left), x + 30); assert.equal(b.dragHandle.hidden, false);
  key(b.dragHandle, 'ArrowRight'); await settle(); assert.equal(Number.parseFloat(b.stage.style.left), x + 40);
  await b.hide(true); assert.equal(b.stage.hidden, true); await b.hide(false);
  b.collapse.click(); await settle(); assert.equal(b.dragHandle.hidden, true); assert.equal(b.collapse.hidden, true);
  const saved = b.stage.style.left; key(b.dragHandle, 'ArrowRight');
  b.pointer(b.dragHandle, 'pointerdown'); assert.equal(b.dragHandle.captured.size, 0); assert.equal(b.stage.style.left, saved);
  await b.shut(); assert.equal(b.dragHandle.hidden, true);
}));
test('controls: unconfigured pet leaves handle hidden and performs no requests', async () => {
  const b = browser();
  try {
    b.host.dataset.config = JSON.stringify({ enabled: false }); b.start(); await settle();
    assert.equal(b.dragHandle.hidden, true); assert.equal(b.stage.hidden, true); assert.equal(b.requests.length, 0);
  } finally { b.restore(); }
});

for (const initial of ['reduce', 'motionoff'] as const) {
  test(`motion recovery: clean desktop ${initial} does not consume delayed default opportunity`, async () => {
    const b = browser();
    try {
      b.local.removeItem(PREFERENCE_KEY);
      if (initial === 'reduce') await b.reduced(true); else b.root.dataset.motion = 'off';
      b.document.readyState = 'loading'; b.start();
      b.document.readyState = 'complete'; b.event('load');
      await b.delay(); assert.equal(b.requests.length, 0); assert.equal(b.host.dataset.mode, 'collapsed');
      if (initial === 'reduce') await b.reduced(false); else await b.motion('on');
      assert.equal(b.requests.length, 0); assert.equal(await b.delay(), true, 'recovery schedules fresh 2.6s delay');
      assert.equal(b.host.dataset.mode, 'expanded'); assert.deepEqual(b.requests.map((r) => r.id), ['idle', 'walk']);
    } finally { b.restore(); }
  });
}
for (const phase of ['timer', 'idle'] as const) {
  test(`motion recovery: reduced motion during default ${phase} invalidates late callback and rearms once`, async () => {
    const b = browser();
    try {
      b.local.removeItem(PREFERENCE_KEY); if (phase === 'idle') b.useIdle(); b.start();
      const timer = [...b.timers.values()].find((t) => t.ms === 2600)!; assert.ok(timer);
      if (phase === 'idle') await b.delay();
      const stale = phase === 'idle' ? [...b.idles.values()][0] : timer.callback; assert.ok(stale);
      await b.reduced(true); stale(); await settle();
      assert.equal(b.host.dataset.mode, 'collapsed'); assert.equal(b.requests.length, 0);
      await b.motion('off'); await b.reduced(false); assert.equal(await b.delay(), false);
      await b.motion('on'); await b.preferences();
      assert.equal([...b.timers.values()].filter((t) => t.ms === 2600).length, 1);
      assert.equal(await b.delay(), true);
      if (phase === 'idle') {
        assert.equal(b.idles.size, 1);
        const ready = [...b.idles.values()][0]; b.idles.clear(); ready(); await settle();
      }
      assert.equal(b.host.dataset.mode, 'expanded'); assert.deepEqual(b.requests.map((r) => r.id), ['idle', 'walk']);
    } finally { b.restore(); }
  });
}
for (const mode of ['storedcollapsed', 'takeover', 'mobile', 'corrupt', 'denied'] as const) {
  test(`motion recovery: ${mode} remains manual after restrictions lift`, async () => {
    const b = browser();
    try {
      b.local.removeItem(PREFERENCE_KEY);
      if (mode === 'storedcollapsed') b.local.setItem(LAYOUT_KEY, JSON.stringify({ version: 1, mode: 'collapsed', height: 120, autoWalk: true, x: .5, y: .8 }));
      if (mode === 'corrupt') b.local.setItem(LAYOUT_KEY, '{');
      if (mode === 'denied') b.local.getItem = () => { throw new Error('denied'); };
      if (mode === 'mobile') { matchMedia('(min-width: 1024px) and (pointer: fine) and (hover: hover)'); b.queries.get('(min-width: 1024px) and (pointer: fine) and (hover: hover)')!.matches = false; }
      await b.reduced(true); b.start(); await b.delay();
      if (mode === 'takeover') { b.size.value = '140'; b.size.dispatchEvent(new Event('input')); b.size.dispatchEvent(new Event('change')); }
      await b.reduced(false); await b.hide(true); await b.hide(false); await b.delay();
      assert.equal(b.host.dataset.mode, 'collapsed'); assert.equal(b.requests.length, 0); assert.equal(b.idles.size, 0);
    } finally { b.restore(); }
  });
}
test('motion recovery: expanded playback resumes in place', async () => usingBrowser(async (b) => {
  await b.open(); const video = b.activeVideo()!, x = b.stage.style.left, y = b.stage.style.top;
  video.currentTime = 3; await b.reduced(true); assert.equal(video.paused, true);
  await b.reduced(false); assert.equal(video.paused, false); assert.equal(video.currentTime, 3);
  assert.equal(b.stage.style.left, x); assert.equal(b.stage.style.top, y); assert.equal(b.requests.length, 2);
}));
for (const gate of ['hidden', 'intro', 'pagehide'] as const) {
  test(`motion recovery: ${gate} cancels default idle; stale callback cannot bypass fresh delay`, async () => {
    const b = browser();
    try {
      b.local.removeItem(PREFERENCE_KEY); b.useIdle(); b.start(); await b.delay();
      const stale = [...b.idles.values()][0]; assert.ok(stale);
      if (gate === 'hidden') await b.hide(true);
      else if (gate === 'pagehide') await b.pagehide();
      else { b.root.dataset.intro = 'play'; await b.preferences(); }
      stale(); await settle(); assert.equal(b.requests.length, 0);
      if (gate === 'hidden') await b.hide(false);
      else if (gate === 'pagehide') await b.pageshow();
      else { b.root.dataset.intro = 'done'; b.event('introend'); await settle(); }
      stale(); await settle(); assert.equal(b.host.dataset.mode, 'collapsed');
      assert.equal([...b.timers.values()].filter((t) => t.ms === 2600).length, 1);
      await b.delay(); const ready = [...b.idles.values()][0]; assert.ok(ready); b.idles.clear(); ready(); await settle();
      assert.equal(b.host.dataset.mode, 'expanded'); assert.deepEqual(b.requests.map((r) => r.id), ['idle', 'walk']);
    } finally { b.restore(); }
  });
}
test('motion recovery: close prevents a queued default idle callback from reviving pet', async () => {
  const b = browser();
  try {
    b.local.removeItem(PREFERENCE_KEY); b.useIdle(); b.start(); await b.delay();
    const stale = [...b.idles.values()][0]; assert.ok(stale);
    await b.shut(); stale(); await settle(); await b.reduced(true); await b.reduced(false); await b.delay();
    assert.equal(b.host.dataset.mode, 'hidden'); assert.equal(b.requests.length, 0);
  } finally { b.restore(); }
});

for (const result of ['resolve', 'reject'] as const) {
  test(`regression: stale resume ${result} cannot pause or corrupt a reused playing slot`, async () => usingBrowser(async (b) => {
    await b.open(); const video = b.activeVideo()!;
    const old = deferred<void>(); video.nextPlay = old;
    await b.preferences(); b.collapse.click(); await settle(); b.ball.click(); await settle();
    assert.equal(b.activeVideo(), video); assert.equal(video.paused, false);
    if (result === 'resolve') old.resolve(); else old.reject(new Error('old play rejected'));
    await settle();
    assert.equal(video.paused, false); assert.equal(b.host.dataset.state, 'playing');
    assert.equal(b.requests.length, 2); assert.equal(b.raf.size, 0);
  }));
}
for (const termination of ['pointercancel', 'lostpointercapture'] as const) {
  test(`regression: ${termination} without click does not swallow the next keyboard activation`, async () => usingBrowser(async (b) => {
    await b.open(); b.collapse.click(); await settle();
    b.pointer(b.ball, 'pointerdown'); b.pointer(b.ball, 'pointermove', { clientX: 180 }); b.pointer(b.ball, termination);
    b.ball.click(0); await settle();
    assert.equal(b.host.dataset.mode, 'expanded'); assert.equal(b.requests.length, 2);
  }));
  test(`regression: ${termination} without click does not swallow the next normal tap`, async () => usingBrowser(async (b) => {
    await b.open(); b.collapse.click(); await settle();
    b.pointer(b.ball, 'pointerdown'); b.pointer(b.ball, 'pointermove', { clientX: 180 }); b.pointer(b.ball, termination);
    b.pointer(b.ball, 'pointerdown', { pointerId: 2 }); b.pointer(b.ball, 'pointerup', { pointerId: 2 });
    b.ball.click(1); await settle(); assert.equal(b.host.dataset.mode, 'expanded');
  }));
}
test('regression: drag up suppresses only compatibility click, not keyboard or the next tap', async () => usingBrowser(async (b) => {
  await b.open(); b.collapse.click(); await settle();
  b.pointer(b.ball, 'pointerdown'); b.pointer(b.ball, 'pointermove', { clientX: 180 }); b.pointer(b.ball, 'pointerup');
  b.ball.click(1); await settle(); assert.equal(b.host.dataset.mode, 'collapsed');
  b.pointer(b.ball, 'pointerdown'); b.pointer(b.ball, 'pointerup'); b.ball.click(1); await settle(); assert.equal(b.host.dataset.mode, 'expanded');
  b.collapse.click(); await settle();
  b.pointer(b.ball, 'pointerdown'); b.pointer(b.ball, 'pointermove', { clientX: 180 }); b.pointer(b.ball, 'pointerup');
  b.ball.click(0); await settle(); assert.equal(b.host.dataset.mode, 'expanded');
}));
for (const action of ['drag', 'key', 'size', 'autowalk', 'reset'] as const) {
  test(`regression: ${action} during new-user delay takes ownership of collapsed layout`, async () => {
    const b = browser();
    try {
      b.local.removeItem(PREFERENCE_KEY); b.start(); await settle();
      const delayed = [...b.timers.values()].find((t) => t.ms === 2600)!; assert.ok(delayed);
      if (action === 'drag') { b.pointer(b.ball, 'pointerdown'); b.pointer(b.ball, 'pointermove', { clientX: 180 }); b.pointer(b.ball, 'pointerup'); }
      if (action === 'key') { const event = new Event('keydown', { cancelable: true }); Object.assign(event, { key: 'ArrowRight' }); b.ball.dispatchEvent(event); }
      if (action === 'size') { b.size.value = '160'; b.size.dispatchEvent(new Event('input')); b.size.dispatchEvent(new Event('change')); }
      if (action === 'autowalk') { b.autoWalk.checked = false; b.autoWalk.dispatchEvent(new Event('change')); }
      if (action === 'reset') b.reset.click();
      await settle(); delayed.callback(); await settle(); // Also exercise a callback already queued before cancellation.
      assert.equal(b.host.dataset.mode, 'collapsed'); assert.equal(b.requests.length, 0);
      assert.equal(JSON.parse(b.local.getItem(LAYOUT_KEY)!).mode, 'collapsed');
    } finally { b.restore(); }
  });
}
test('regression: short viewport temporarily uses reachable ball without overwriting expanded preference', async () => usingBrowser(async (b) => {
  await b.open();
  Object.defineProperty(globalThis, 'innerHeight', { configurable: true, writable: true, value: 120 });
  b.event('resize'); await settle();
  assert.equal(b.host.dataset.mode, 'collapsed'); assert.equal(b.ball.hidden, false); assert.equal(b.collapse.hidden, true); assert.equal(b.dragHandle.hidden, true);
  assert.ok(Number.parseFloat(b.stage.style.top) <= 120); assert.ok(Number.parseFloat(b.stage.style.top) >= 48);
  assert.equal(JSON.parse(b.local.getItem(LAYOUT_KEY)!).mode, 'expanded');
  assert.equal(b.raf.size, 0); assert.ok(b.videos.every((v) => v.paused));
  Object.defineProperty(globalThis, 'innerHeight', { configurable: true, writable: true, value: 800 });
  b.event('resize'); await settle(); assert.equal(b.host.dataset.mode, 'expanded'); assert.equal(b.requests.length, 2);
}));

test('real initPet: three successful close/open cycles do not consume failure retries', async () => usingBrowser(async (b) => {
  for (let i = 0; i < 3; i++) {
    await b.open(); assert.equal(b.host.dataset.state, 'playing', `opening ${i + 1}`);
    assert.deepEqual(b.requests.slice(i * 2).map((r) => r.id), ['idle', 'walk']);
    assert.equal(JSON.parse(b.session.getItem(SESSION_KEY)!).failures, 0);
    await b.shut(); assert.equal(b.blobs.size, 0);
  }
}));
test('real initPet: repeated BFCache restores prepare core without exhausting successful starts', async () => usingBrowser(async (b) => {
  await b.open();
  for (let i = 0; i < 4; i++) {
    await b.pagehide(); assert.equal(b.raf.size, 0); assert.ok(b.videos.every((v) => v.paused));
    await b.pageshow(); assert.equal(b.host.dataset.state, 'playing', `restore ${i + 1}`);
  }
  assert.equal(b.requests.length, 10); assert.equal(JSON.parse(b.session.getItem(SESSION_KEY)!).failures, 0);
}));
test('real initPet: preferences during walk keep exactly one RAF chain and close stops it', async () => usingBrowser(async (b) => {
  await b.open(); await b.walk(); assert.equal(b.raf.size, 1);
  for (let i = 0; i < 5; i++) { await b.preferences(); assert.equal(b.raf.size, 1); b.stepRAF(); assert.equal(b.raf.size, 1); }
  await b.shut(); b.stepRAF(); await b.preferences();
  assert.equal(b.raf.size, 0); assert.equal(b.requests.length, 2); assert.ok(b.videos.every((v) => v.paused));
}));
test('real initPet: a pending resume play cannot restart RAF/video after close', async () => usingBrowser(async (b) => {
  await b.open(); await b.walk();
  const video = b.activeVideo()!; const play = deferred<void>(); video.nextPlay = play;
  await b.preferences(); await b.shut(); const requests = b.requests.length;
  play.resolve(); await settle(); b.stepRAF();
  assert.equal(b.raf.size, 0); assert.equal(b.requests.length, requests);
  assert.equal(b.host.dataset.state, 'closed'); assert.ok(b.videos.every((v) => v.paused));
}));
test('real initPet: rapid preferences while resume play is pending cannot fork RAF or playback tasks', async () => usingBrowser(async (b) => {
  await b.open(); await b.walk();
  const video = b.activeVideo()!; const before = video.playCalls;
  const play = deferred<void>(); video.nextPlay = play;
  for (let i = 0; i < 10; i++) b.preferencesNow();
  assert.equal(video.playCalls, before + 1); assert.equal(b.raf.size, 1);
  play.resolve(); await settle();
  assert.equal(b.raf.size, 1); b.stepRAF(); assert.equal(b.raf.size, 1);
  await b.shut(); assert.equal(b.raf.size, 0); assert.ok(b.videos.every((v) => v.paused));
}));
for (const action of ['hidden', 'motion'] as const) {
  test(`real initPet: ${action} cancels pending walk resume, including late play completion`, async () => usingBrowser(async (b) => {
    await b.open(); await b.walk();
    const video = b.activeVideo()!; const play = deferred<void>(); video.nextPlay = play;
    await b.preferences();
    if (action === 'hidden') await b.hide(true); else await b.motion('off');
    play.resolve(); await settle(); b.stepRAF();
    assert.equal(b.raf.size, 0); assert.equal(b.requests.length, 2);
    assert.ok(b.videos.every((v) => v.paused)); assert.equal(b.host.dataset.state, 'paused');
  }));
}
for (const action of ['close', 'hidden', 'motion'] as const) {
  test(`real initPet: ${action} during preparation rejects a late core fetch response`, async () => usingBrowser(async (b) => {
    const pending = b.deferFetch(); await b.open(); assert.equal(b.requests.length, 1);
    if (action === 'close') await b.shut(); else if (action === 'hidden') await b.hide(true); else await b.motion('off');
    assert.equal(b.requests[0].signal.aborted, true);
    pending.gate.resolve(pending.response('idle')); await settle(); b.stepRAF();
    assert.equal(b.raf.size, 0); assert.equal(b.requests.length, 1); assert.equal(b.blobs.size, 0);
    assert.ok(b.videos.every((v) => v.paused)); assert.notEqual(b.host.dataset.state, 'playing');
    assert.equal(JSON.parse(b.session.getItem(SESSION_KEY)!).failures, 0, 'lifecycle cancellation is not a core failure');
  }));
}
test('real initPet: core fetch failure remains static and retries are bounded across explicit opens', async () => usingBrowser(async (b) => {
  b.failFetch(); await b.open(); assert.equal(b.host.dataset.state, 'static'); assert.equal(b.placeholder.hidden, false);
  for (let i = 0; i < 5; i++) { await b.shut(); await b.open(); }
  assert.equal(b.requests.length, 2); assert.equal(b.raf.size, 0);
  assert.equal(JSON.parse(b.session.getItem(SESSION_KEY)!).failures, 2);
  assert.ok(b.videos.every((v) => v.paused));
}));
test('real initPet: existing cross-navigation failure limit still prevents core fetches', async () => usingBrowser(async (b) => {
  // Start once to obtain the real schema/pool, then simulate the newer ledger read on another navigation.
  await b.open(); await b.shut();
  const ledger = JSON.parse(b.session.getItem(SESSION_KEY)!); ledger.failures = 3;
  b.session.setItem(SESSION_KEY, JSON.stringify(ledger));
  for (let i = 0; i < 3; i++) { await b.open(); assert.equal(b.host.dataset.state, 'static'); await b.shut(); }
  assert.equal(b.requests.length, 2); assert.equal(b.raf.size, 0);
}));

test('real initPet: collapsed ball has zero video requests; repeated expansion reuses page blobs', async () => usingBrowser(async (b) => {
  await b.open();
  for (let i = 0; i < 4; i++) {
    b.collapse.click(); await settle();
    assert.equal(b.host.dataset.mode, 'collapsed'); assert.equal(b.ball.hidden, false);
    assert.equal(b.raf.size, 0); assert.ok(b.videos.every((v) => v.paused));
    assert.equal(b.requests.length, 2); assert.equal(b.blobs.size, 2);
    b.ball.click(); await settle(); assert.equal(b.host.dataset.mode, 'expanded'); assert.equal(b.host.dataset.state, 'playing');
  }
  assert.equal(b.requests.length, 2); assert.equal(JSON.parse(b.session.getItem(SESSION_KEY)!).failures, 0);
  assert.equal(JSON.parse(b.local.getItem(LAYOUT_KEY)!).mode, 'expanded');
}));
test('real initPet: drag threshold suppresses click/optional selection, cancel and late moves cannot revive hidden pet', async () => usingBrowser(async (b) => {
  await b.open(); await b.walk();
  const before = Number.parseFloat(b.stage.style.left);
  b.pointer(b.dragHandle, 'pointerdown'); b.pointer(b.dragHandle, 'pointermove', { clientX: 250, clientY: 600 });
  assert.equal(b.raf.size, 0); assert.equal(Number.parseFloat(b.stage.style.left), before + 100);
  b.pointer(b.dragHandle, 'pointerup', { clientX: 250, clientY: 600 }); b.dragHandle.click(); await settle();
  assert.equal(b.requests.length, 2); assert.equal(JSON.parse(b.session.getItem(SESSION_KEY)!).totalBytes, 0);
  assert.ok(Number.parseFloat(b.stage.style.top) < 700);
  b.collapse.click(); await settle();
  b.pointer(b.ball, 'pointerdown'); b.pointer(b.ball, 'pointermove', { clientX: 153 }); b.pointer(b.ball, 'pointerup'); b.ball.click(); await settle();
  assert.equal(b.host.dataset.mode, 'expanded', 'sub-threshold tap expands');
  b.pointer(b.dragHandle, 'pointerdown'); b.pointer(b.dragHandle, 'pointermove', { clientX: 180 });
  b.pointer(b.dragHandle, 'pointercancel'); b.dragHandle.click(); await settle(); assert.equal(b.requests.length, 2);
  b.pointer(b.dragHandle, 'pointerdown'); b.pointer(b.dragHandle, 'pointermove', { clientY: 630 });
  await b.hide(true); assert.equal(b.dragHandle.captured.size, 0);
  const frozen = b.stage.style.left;
  b.pointer(b.dragHandle, 'pointermove', { clientX: 900 }); b.pointer(b.dragHandle, 'pointerup'); await settle();
  assert.equal(b.stage.style.left, frozen); assert.equal(b.stage.hidden, true); assert.equal(b.raf.size, 0);
}));
test('real initPet: right mirrors only video, seven seconds reaches target and tail/ended hold anchor', async () => usingBrowser(async (b) => {
  await b.open(); await b.walk();
  const video = b.activeVideo()!;
  assert.equal(video.style.transform, 'scaleX(-1)');
  const start = Number.parseFloat(b.stage.style.left);
  video.currentTime = 3.5; b.stepRAF(); const midpoint = Number.parseFloat(b.stage.style.left);
  video.currentTime = 7; b.stepRAF(); const target = Number.parseFloat(b.stage.style.left);
  assert.ok(target > start); assert.ok(Math.abs((target + start) / 2 - midpoint) < .001);
  video.currentTime = 10; b.stepRAF(); assert.equal(Number.parseFloat(b.stage.style.left), target);
  video.ended = true; video.dispatchEvent(new Event('ended')); await settle();
  assert.equal(Number.parseFloat(b.stage.style.left), target); assert.equal(b.raf.size, 0);
  assert.equal(b.requests.length, 2);
}));
test('real initPet: scale and auto-walk off cancel movement without resetting dragged anchor', async () => usingBrowser(async (b) => {
  await b.open(); await b.walk(); b.activeVideo()!.currentTime = 2; b.stepRAF();
  const left = b.stage.style.left, top = b.stage.style.top;
  b.size.value = '160'; b.size.dispatchEvent(new Event('input')); b.size.dispatchEvent(new Event('change')); await settle();
  assert.equal(b.stage.style.left, left); assert.equal(b.stage.style.top, top); assert.equal(b.raf.size, 0);
  assert.equal(b.sizeValue.textContent, '160 px');
  b.autoWalk.checked = false; b.autoWalk.dispatchEvent(new Event('change')); await settle();
  assert.equal(b.raf.size, 0); assert.equal([...b.timers.values()].filter((t) => t.ms >= 20_000 && t.ms < 40_000).length, 0);
  assert.equal(JSON.parse(b.local.getItem(LAYOUT_KEY)!).autoWalk, false);
  b.reset.click(); await settle(); assert.equal(b.requests.length, 2);
}));
test('real initPet: keyboard moves and Escape collapses; secondary pointer cannot drag', async () => usingBrowser(async (b) => {
  await b.open(); const before = Number.parseFloat(b.stage.style.left);
  b.pointer(b.dragHandle, 'pointerdown', { isPrimary: false }); b.pointer(b.dragHandle, 'pointermove', { clientX: 800 });
  assert.equal(Number.parseFloat(b.stage.style.left), before);
  const key = new Event('keydown', { cancelable: true }); Object.assign(key, { key: 'ArrowRight' }); b.dragHandle.dispatchEvent(key); await settle();
  assert.equal(Number.parseFloat(b.stage.style.left), before + 10);
  const escape = new Event('keydown', { cancelable: true }); Object.assign(escape, { key: 'Escape' }); b.touch.dispatchEvent(escape); await settle();
  assert.equal(b.host.dataset.mode, 'collapsed'); assert.equal(b.raf.size, 0);
}));
for (const kind of ['collapsed', 'corrupt', 'denied', 'mobile'] as const) {
  test(`real initPet: ${kind} startup remains static until explicit expansion`, async () => {
    const b = browser();
    try {
      b.local.removeItem(PREFERENCE_KEY);
      if (kind === 'collapsed') b.local.setItem(LAYOUT_KEY, JSON.stringify({ version: 1, mode: 'collapsed', height: 140, autoWalk: false, x: .7, y: .7 }));
      if (kind === 'corrupt') b.local.setItem(LAYOUT_KEY, '{');
      if (kind === 'denied') b.local.getItem = () => { throw new Error('denied'); };
      if (kind === 'mobile') {
        // Populate the media object before initPet uses it.
        matchMedia('(min-width: 1024px) and (pointer: fine) and (hover: hover)');
        b.queries.get('(min-width: 1024px) and (pointer: fine) and (hover: hover)')!.matches = false;
      }
      b.start(); await settle(); assert.equal(b.host.dataset.mode, 'collapsed'); assert.equal(b.requests.length, 0);
      const delay = [...b.timers].find(([, t]) => t.ms === 2600); if (delay) { b.timers.delete(delay[0]); delay[1].callback(); await settle(); }
      assert.equal(b.requests.length, 0);
      b.ball.click(); await settle(); assert.equal(b.requests.length, 2);
      if (kind === 'collapsed') assert.equal(b.size.value, '140');
    } finally { b.restore(); }
  });
}
test('real initPet: layout from prior MPA navigation restores expanded position and storage close synchronizes', async () => {
  const b = browser();
  try {
    b.local.setItem(PREFERENCE_KEY, 'on');
    b.local.setItem(LAYOUT_KEY, JSON.stringify({ version: 1, mode: 'expanded', height: 128, autoWalk: false, x: .7, y: .7 }));
    b.start(); await settle(); assert.equal(b.host.dataset.state, 'playing');
    assert.equal(b.stage.style.left, '840px'); assert.equal(b.stage.style.top, '560px');
    b.event('storage', { key: PREFERENCE_KEY, newValue: 'off' }); await settle();
    assert.equal(b.host.dataset.mode, 'hidden'); assert.equal(b.blobs.size, 0); assert.equal(b.stage.hidden, true);
  } finally { b.restore(); }
});
test('real initPet: new desktop waits for intro and idle delay, then loads only core', async () => {
  const b = browser();
  try {
    b.local.removeItem(PREFERENCE_KEY); b.root.dataset.intro = 'play'; b.start(); await settle();
    assert.equal(b.stage.hidden, true); assert.equal(b.requests.length, 0);
    assert.equal([...b.timers.values()].some((t) => t.ms === 2600), false);
    b.root.dataset.intro = 'done'; b.event('introend'); await settle();
    const delay = [...b.timers].find(([, t]) => t.ms === 2600)!;
    assert.ok(delay); assert.equal(b.requests.length, 0);
    b.timers.delete(delay[0]); delay[1].callback(); await settle();
    assert.equal(b.host.dataset.mode, 'expanded'); assert.deepEqual(b.requests.map((r) => r.id), ['idle', 'walk']);
  } finally { b.restore(); }
});
test('real initPet: resize cancels a walk at current media anchor without wallclock catchup', async () => usingBrowser(async (b) => {
  await b.open(); await b.walk(); b.activeVideo()!.currentTime = 3; b.stepRAF();
  const x = b.stage.style.left, y = b.stage.style.top;
  b.event('resize'); await settle();
  assert.equal(b.raf.size, 0); assert.equal(b.stage.style.left, x); assert.equal(b.stage.style.top, y);
  assert.equal(b.requests.length, 2);
}));
test('real initPet: reduced motion clears pointer capture and static manual mode makes no video requests', async () => {
  const b = browser();
  try {
    matchMedia('(prefers-reduced-motion: reduce)'); b.queries.get('(prefers-reduced-motion: reduce)')!.matches = true;
    b.start(); await b.open(); assert.equal(b.requests.length, 0); assert.equal(b.placeholder.hidden, false);
    b.pointer(b.dragHandle, 'pointerdown'); b.pointer(b.dragHandle, 'pointermove', { clientX: 200 });
    await b.preferences(); assert.equal(b.dragHandle.captured.size, 0); assert.equal(b.raf.size, 0);
    assert.equal(b.requests.length, 0);
  } finally { b.restore(); }
});
test('real initPet: collapse aborts an optional reservation without refund or late playback', async () => usingBrowser(async (b) => {
  await b.open(); const pending = b.deferFetch(); b.touch.click(); await settle();
  const optional = b.requests.at(-1)!; assert.notEqual(optional.id, 'idle'); assert.notEqual(optional.id, 'walk');
  const reserved = JSON.parse(b.session.getItem(SESSION_KEY)!).totalBytes;
  assert.equal(reserved, assets[optional.id].bytes);
  b.collapse.click(); await settle(); assert.equal(optional.signal.aborted, true);
  pending.gate.resolve(pending.response(optional.id)); await settle();
  assert.equal(JSON.parse(b.session.getItem(SESSION_KEY)!).totalBytes, reserved);
  assert.equal(b.host.dataset.mode, 'collapsed'); assert.ok(b.videos.every((v) => v.paused)); assert.equal(b.blobs.size, 2);
}));
test('real initPet: interrupted walk-core loading resumes only the missing core after expansion', async () => usingBrowser(async (b) => {
  const play = deferred<void>(); b.videos[0].nextPlay = play;
  await b.open(); assert.equal(b.requests.length, 1);
  const pending = b.deferFetch(); play.resolve(); await settle();
  assert.equal(b.requests[1].id, 'walk');
  b.collapse.click(); await settle(); assert.equal(b.requests[1].signal.aborted, true);
  pending.gate.resolve(pending.response('walk')); await settle();
  b.ball.click(); await settle();
  assert.deepEqual(b.requests.map((r) => r.id), ['idle', 'walk', 'walk']);
  assert.equal(b.blobs.size, 2); assert.equal(JSON.parse(b.session.getItem(SESSION_KEY)!).failures, 0);
}));
test('real initPet: leftward walk uses unmirrored source and keeps dragged y', async () => usingBrowser(async (b) => {
  await b.open();
  b.pointer(b.dragHandle, 'pointerdown'); b.pointer(b.dragHandle, 'pointermove', { clientX: 1000, clientY: 560 }); b.pointer(b.dragHandle, 'pointerup'); b.dragHandle.click(); await settle();
  const x = Number.parseFloat(b.stage.style.left), y = b.stage.style.top;
  await b.walk(); const video = b.activeVideo()!;
  assert.equal(video.style.transform, ''); video.currentTime = 7; b.stepRAF();
  assert.ok(Number.parseFloat(b.stage.style.left) < x); assert.equal(b.stage.style.top, y);
}));
