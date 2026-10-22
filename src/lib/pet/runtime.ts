import { assets, type AssetId } from './assets';
import { candidate, readSession, reserve, markSelected, recordFailure, guardStorage, FAILURE_LIMIT, PREFERENCE_KEY } from './session';
import { geometry, clampAnchor, normalize, restore, planWalk, walkPosition, type Point, type Viewport, type WalkPlan } from './geometry';
import { LAYOUT_KEY, readLayout, parseLayout, writeLayout, type PetMode } from './preferences';

type Connection = { saveData?: boolean; effectiveType?: string; addEventListener?: (event: string, listener: () => void) => void };
const aborted = () => new DOMException('Pet task stopped', 'AbortError');
class ReservationRefused extends Error {}

// All listeners/timers have bounded lifetimes; no host polling or cache manager.
function waitFor(video: HTMLVideoElement, event: string, ready: () => boolean, signal: AbortSignal, ms: number) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(aborted());
    if (ready()) return resolve();
    const finish = (error?: Error) => {
      clearTimeout(timer); video.removeEventListener(event, success); video.removeEventListener('error', fail); signal.removeEventListener('abort', cancel);
      error ? reject(error) : resolve();
    };
    const success = () => finish();
    const fail = () => finish(new Error('Video decode failed'));
    const cancel = () => finish(aborted());
    const timer = setTimeout(() => finish(new Error(`Video ${event} timeout`)), ms);
    video.addEventListener(event, success, { once: true }); video.addEventListener('error', fail, { once: true }); signal.addEventListener('abort', cancel, { once: true });
  });
}
function boundedPlay(video: HTMLVideoElement, signal: AbortSignal, owns: () => boolean, mayPause: () => boolean) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cancel = () => finish(aborted());
    const finish = (error?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', cancel); error ? reject(error) : resolve(); };
    const timer = setTimeout(() => finish(new Error('Video play timeout')), 4000);
    if (signal.aborted) { finish(aborted()); return; }
    signal.addEventListener('abort', cancel, { once: true });
    void video.play().then(() => {
      // A late play may revive a stopped element, but must not pause its new owner.
      if ((signal.aborted || !owns()) && mayPause()) video.pause();
      finish();
    }, finish);
  });
}

export function initPet() {
  const host = document.querySelector<HTMLElement>('[data-site-pet]');
  if (!host) return;
  const config: { enabled: boolean; urls: Partial<Record<AssetId, string>> } = JSON.parse(host.dataset.config ?? '{}');
  const settings = document.querySelector<HTMLInputElement>('[data-pet-visible]');
  const autoWalk = document.querySelector<HTMLInputElement>('[data-pet-autowalk]');
  const size = document.querySelector<HTMLInputElement>('[data-pet-size]');
  const sizeValue = document.querySelector<HTMLOutputElement>('[data-pet-size-value]');
  const reset = document.querySelector<HTMLButtonElement>('[data-pet-reset]');
  const settingsStatus = document.querySelector<HTMLElement>('[data-pet-settings-status]');
  [settings, autoWalk, size, reset].forEach((control) => { if (control) control.disabled = !config.enabled; });
  if (settingsStatus) settingsStatus.textContent = config.enabled ? '拖动悬浮球或右上角小三角调整位置；聚焦球或三角后方向键移动，Escape 收起。' : '站宠素材未配置。';
  if (!config.enabled) return;
  const stage = host.querySelector<HTMLElement>('[data-pet-stage]')!;
  const ball = host.querySelector<HTMLButtonElement>('[data-pet-ball]')!;
  const dragHandle = host.querySelector<HTMLButtonElement>('[data-pet-drag]')!;
  const collapse = host.querySelector<HTMLButtonElement>('[data-pet-collapse]')!;
  const touch = host.querySelector<HTMLButtonElement>('[data-pet-touch]')!;
  const placeholder = host.querySelector<HTMLElement>('[data-pet-placeholder]')!;
  const status = host.querySelector<HTMLElement>('[data-pet-status]')!;
  const infoBtn = host.querySelector<HTMLButtonElement>('[data-pet-info]');
  const bubble = host.querySelector<HTMLElement>('[data-pet-bubble]');
  const bubbleClose = host.querySelector<HTMLButtonElement>('[data-pet-bubble-close]');
  const videos = Array.from(host.querySelectorAll<HTMLVideoElement>('[data-pet-video]'));
  const slots = videos.map(() => ({ owner: null as object | null, wantsPlayback: false }));
  function claimSlot(index: number) {
    const slot = slots[index], owner = {};
    slot.owner = owner; slot.wantsPlayback = true;
    return { owns: () => slot.owner === owner, mayPause: () => slot.owner === owner || !slot.wantsPlayback };
  }
  const root = document.documentElement;
  const desktop = matchMedia('(min-width: 1024px) and (pointer: fine) and (hover: hover)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  // VP9-alpha on Safari cannot be verified by canPlayType; use an honest static fallback.
  const safari = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|OPR|Android/.test(navigator.userAgent);
  // Access the global inside the guarded adapter: even its getter can throw.
  const local = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) };
  const stored = readLayout(local, desktop.matches);
  let prefs = stored.prefs, remembered = stored.remembered;
  let storageOK = stored.storageOK;
  try { localStorage.setItem('site-pet-storage-probe', '1'); localStorage.removeItem('site-pet-storage-probe'); } catch { storageOK = false; remembered = true; }
  const session = guardStorage({
    getItem: (key) => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value),
  });
  let enabled = prefs.mode !== 'hidden';
  let manual = remembered && prefs.mode === 'expanded', pageHidden = false, delayed = false, broken = false;
  // Only actual core failures consume the page retry allowance. Successful starts
  // and lifecycle cancellations (close, hidden, BFCache) must not exhaust it.
  let coreFailures = 0, generation = 0, active = -1;
  let activeId: AssetId | null = null;
  let pending: AbortController | null = null;
  let loading = false;
  let anchor: Point = { x: 12, y: 12 }, walk: WalkPlan | null = null;
  let drag: { id: number; element: HTMLButtonElement; start: Point; anchor: Point; moved: boolean } | null = null;
  let suppressedGesture: { id: number; element: HTMLButtonElement; until: number } | null = null;
  let frame = 0, autoTimer = 0, moveTimer = 0, delayTimer = 0, feedbackTimer = 0;
  let idleHandle: number | undefined;
  let defaultEpoch = 0;
  let lastInteraction = Date.now();
  const urls = new Map<AssetId, string>();
  const failed = new Set<AssetId>();

  function state(value: string, message = '') { host!.dataset.state = value; status.textContent = message; }
  function permitted() {
    return enabled && presentation().expanded && !drag?.moved && !broken && !pageHidden && !document.hidden && root.dataset.intro !== 'play'
      && root.dataset.motion !== 'off' && !reduced.matches && !safari && (manual || (desktop.matches && delayed));
  }
  function networkOK() { return !connection?.saveData && !/^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? ''); }
  function viewport(): Viewport {
    const visual = window.visualViewport;
    const safe = host!.querySelector<HTMLElement>('[data-pet-safe]');
    const css = safe ? getComputedStyle(safe) : null;
    return { width: visual?.width ?? innerWidth, height: visual?.height ?? innerHeight, left: visual?.offsetLeft ?? 0, top: visual?.offsetTop ?? 0,
      safeTop: parseFloat(css?.paddingTop ?? '') || 0, safeBottom: parseFloat(css?.paddingBottom ?? '') || 0,
      safeLeft: parseFloat(css?.paddingLeft ?? '') || 0, safeRight: parseFloat(css?.paddingRight ?? '') || 0 };
  }
  function setBubble(open: boolean) {
    infoBtn?.setAttribute('aria-expanded', String(open));
    if (!bubble) return;
    bubble.hidden = !open;
    if (!open) return;
    placeBubble();
    bubbleClose?.focus({ preventScroll: true });
  }
  function placeBubble() {
    if (!bubble || bubble.hidden || !ball) return;
    if (typeof bubble.getBoundingClientRect !== 'function' || typeof ball.getBoundingClientRect !== 'function') return;
    const box = bubble.getBoundingClientRect(), target = ball.getBoundingClientRect();
    const origin = typeof stage.getBoundingClientRect === 'function' ? stage.getBoundingClientRect() : { left: 0, top: 0 };
    const edge = 8, maxLeft = Math.max(edge, innerWidth - box.width - edge);
    const left = Math.min(Math.max(target.left + target.width / 2 - box.width / 2, edge), maxLeft);
    const top = Math.max(edge, target.top - box.height - edge);
    bubble.style.left = `${left - origin.left}px`; bubble.style.top = `${top - origin.top}px`;
  }
  function position() {
    const g = presentation();
    anchor = clampAnchor(anchor, g.bounds);
    stage.style.left = `${anchor.x}px`; stage.style.top = `${anchor.y}px`;
    stage.style.setProperty('--pet-scale', String(g.scale));
    stage.style.setProperty('--pet-canvas-width', `${g.canvasWidth}px`);
    stage.style.setProperty('--pet-canvas-height', `${g.canvasHeight}px`);
    stage.style.setProperty('--pet-ball-size', `${g.ballSize}px`);
    if (bubble && !bubble.hidden) placeBubble();
  }
  function presentation() { return geometry(prefs.height, prefs.mode === 'expanded', viewport()); }
  function displayedMode(): PetMode { return prefs.mode === 'hidden' ? 'hidden' : presentation().expanded ? 'expanded' : 'collapsed'; }
  function takeControl() {
    remembered = true;
    cancelDefault();
  }
  function cancelDefault() {
    defaultEpoch++;
    clearTimeout(delayTimer); delayTimer = 0;
    if (idleHandle !== undefined) { window.cancelIdleCallback(idleHandle); idleHandle = undefined; }
  }
  function persist() { takeControl(); Object.assign(prefs, normalize(anchor, viewport())); writeLayout(local, prefs); }
  function suppressCompatibilityClick(event: MouseEvent, element: HTMLButtonElement) {
    const gesture = suppressedGesture;
    suppressedGesture = null;
    // Keyboard/AT activation has detail=0 and never belongs to a pointer gesture.
    if (!gesture || event.detail === 0 || Date.now() > gesture.until || gesture.element !== element) return false;
    if ('pointerId' in event && event.pointerId !== gesture.id) return false;
    event.preventDefault(); return true;
  }
  function cancelDrag() {
    const previous = drag; drag = null; delete stage.dataset.dragging;
    if (previous) {
      suppressedGesture = previous.moved ? { id: previous.id, element: previous.element, until: Date.now() + 1000 } : null;
      if (previous.element.hasPointerCapture?.(previous.id)) previous.element.releasePointerCapture(previous.id);
    }
  }
  function discardWalk() {
    walk = null;
    if (activeId === 'walk') { releaseSlot(active); active = -1; activeId = null; placeholder.hidden = false; }
  }
  function resetAction() {
    walk = null;
    if (activeId && activeId !== 'idle') { releaseSlot(active); active = -1; activeId = null; placeholder.hidden = false; }
  }
  anchor = restore(prefs, viewport());
  function releaseSlot(index: number) {
    const video = videos[index];
    if (!video) return;
    slots[index].owner = null; slots[index].wantsPlayback = false;
    video.pause(); video.hidden = true; video.removeAttribute('src'); video.load();
  }
  function prune() {
    // Core URLs stay page-local; only current optional and the one candidate may exist.
    for (const [id, url] of urls) {
      if (id !== 'idle' && id !== 'walk' && id !== activeId) { URL.revokeObjectURL(url); urls.delete(id); }
    }
  }
  function stop(clear: boolean) {
    generation++; pending?.abort(); pending = null; loading = false;
    cancelAnimationFrame(frame); frame = 0;
    clearTimeout(autoTimer); clearTimeout(moveTimer); autoTimer = 0; moveTimer = 0;
    clearTimeout(feedbackTimer); delete touch.dataset.feedback;
    videos.forEach((video, index) => { slots[index].wantsPlayback = false; video.pause(); });
    // Discard candidate slot while retaining the last usable image on ordinary suspension.
    videos.forEach((_, index) => { if (index !== active) releaseSlot(index); });
    prune();
    if (clear) {
      videos.forEach((_, index) => releaseSlot(index));
      active = -1; activeId = null;
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear(); placeholder.hidden = false;
    }
  }
  function animateWalk() {
    // Entry is shared by a media switch, RAF ticks and resumed playback. Replace
    // the previous scheduled tick so preferenceschange cannot fork the chain.
    cancelAnimationFrame(frame); frame = 0;
    if (!permitted() || !prefs.autoWalk || !walk || activeId !== 'walk' || active < 0) return;
    anchor.x = walkPosition(walk, videos[active].currentTime);
    stage.style.left = `${anchor.x}px`;
    frame = requestAnimationFrame(animateWalk);
  }
  function scheduleMovement() {
    clearTimeout(moveTimer);
    if (!permitted() || !prefs.autoWalk) return;
    moveTimer = window.setTimeout(() => {
      moveTimer = 0;
      if (permitted() && prefs.autoWalk && activeId === 'idle' && !loading && urls.has('walk') && !failed.has('walk')) {
        const g = geometry(prefs.height, true, viewport());
        walk = planWalk(anchor.x, g.bounds, g.canvasWidth);
        if (walk) void show('walk'); else scheduleMovement();
      }
      else scheduleMovement();
    }, 20_000 + Math.random() * 20_000);
  }
  function scheduleAuto() {
    clearTimeout(autoTimer);
    if (!permitted() || !networkOK()) return;
    autoTimer = window.setTimeout(() => {
      autoTimer = 0;
      if (permitted() && networkOK() && Date.now() - lastInteraction >= 30_000 && activeId === 'idle' && !loading) {
        const id = candidate(session, 'auto');
        if (id) void show(id, 'auto'); // One candidate only; never retry another on failure.
      }
      scheduleAuto();
    }, 60_000 + Math.random() * 60_000);
  }
  async function blobURL(id: AssetId, controller: AbortController, kind?: 'auto' | 'click') {
    const cached = urls.get(id);
    if (cached) { if (kind) markSelected(session, id, kind); return cached; } // Only confirmed page-local blob hits bypass accounting.
    if (kind && !reserve(session, id, kind)) throw new ReservationRefused('Optional reservation refused');
    const url = config.urls[id];
    if (!url) throw new Error('Missing immutable media URL');
    // Reservation above is synchronous and immediately precedes the actual request.
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error(`Pet fetch ${response.status}`);
      const blob = await response.blob();
      if (controller.signal.aborted) throw aborted();
      if (blob.size !== assets[id].bytes || !blob.type.startsWith('video/webm')) throw new Error('Pet media size/type mismatch');
      const objectURL = URL.createObjectURL(blob);
      urls.set(id, objectURL);
      return objectURL;
    } finally { clearTimeout(timeout); }
  }
  async function show(id: AssetId, kind?: 'auto' | 'click'): Promise<boolean> {
    if (!permitted() || loading || failed.has(id)) return false;
    if (kind) {
      const s = readSession(session);
      if (!s || s.failures >= FAILURE_LIMIT || Date.now() < s.cooldown) return false;
    }
    const epoch = generation;
    const controller = new AbortController(); pending = controller; loading = true;
    const next = active === 0 ? 1 : 0;
    const video = videos[next];
    const ownership = claimSlot(next);
    let switched = false;
    try {
      const url = await blobURL(id, controller, kind);
      if (!ownership.owns() || epoch !== generation || !permitted()) throw aborted();
      video.muted = true; video.loop = id === 'idle'; video.src = url; video.load();
      await waitFor(video, 'loadedmetadata', () => video.readyState >= 1, controller.signal, 6000);
      if (!video.videoWidth || !Number.isFinite(video.duration)) throw new Error('Invalid pet metadata');
      // loadeddata is independently bounded: it means the first frame is decoded.
      await waitFor(video, 'loadeddata', () => video.readyState >= 2, controller.signal, 6000);
      await boundedPlay(video, controller.signal, ownership.owns, ownership.mayPause);
      if (!ownership.owns() || epoch !== generation || !permitted()) throw aborted();
      const previous = active;
      active = next; activeId = id; video.hidden = false; placeholder.hidden = true;
      if (previous >= 0) releaseSlot(previous);
      cancelAnimationFrame(frame); frame = 0;
      if (id === 'walk') {
        video.style.transform = walk?.direction === 1 ? 'scaleX(-1)' : '';
        animateWalk();
      } else video.style.transform = '';
      switched = true; prune(); state('playing'); scheduleMovement();
      return true;
    } catch (error) {
      // Aborted/failed optional fetches keep their reservations. No speculative refund.
      controller.abort();
      if (!(error instanceof ReservationRefused) && ownership.owns() && epoch === generation) {
        failed.add(id);
        if (kind || id === 'walk') recordFailure(session);
      } else if (kind && !(error instanceof ReservationRefused)) recordFailure(session);
      if (ownership.owns() && epoch === generation) {
        if (active < 0) state('static', '动画暂不可用，已保留静态站宠。');
        else state('playing', '互动未就绪，继续当前动画。');
      }
      return false;
    } finally {
      if (!switched && ownership.owns()) releaseSlot(next);
      if (pending === controller) { pending = null; loading = false; }
      prune();
      // A resume during an abort must not spawn overlapping tasks; reevaluate only once settled.
      if (epoch !== generation && permitted()) reconcile();
    }
  }
  async function prepare() {
    if (loading || !permitted()) return;
    if (coreFailures >= 2) { broken = true; state('static', '本页核心加载失败次数已达上限，保留静态站宠。'); return; }
    const s = readSession(session);
    if (s && s.failures >= FAILURE_LIMIT) { broken = true; state('static', '本会话加载失败次数已达上限，保留静态站宠。'); return; }
    const epoch = generation;
    state('preparing', '正在准备站宠核心动画…');
    if (!await show('idle')) {
      if (epoch === generation) { coreFailures++; broken = true; recordFailure(session); }
      return;
    }
    // Idle is already visible while walk loads. Core order is fixed and optional is never prefetched.
    await prepareWalk();
  }
  async function prepareWalk() {
    if (loading || urls.has('walk') || failed.has('walk')) return;
    if (!permitted()) return;
    const epoch = generation;
    const controller = new AbortController(); pending = controller; loading = true;
    try { await blobURL('walk', controller); }
    catch {
      if (epoch === generation) { coreFailures++; failed.add('walk'); recordFailure(session); state('playing', '当前仅待机动画可用。'); }
    } finally {
      if (pending === controller) { pending = null; loading = false; }
      if (epoch !== generation && permitted()) reconcile();
      else if (permitted()) { scheduleMovement(); scheduleAuto(); }
    }
  }
  function reconcile() {
    afterLoad();
    const mode = displayedMode();
    host!.dataset.mode = mode;
    if (settings) settings.checked = enabled;
    if (autoWalk) autoWalk.checked = prefs.autoWalk;
    if (size) size.value = String(prefs.height);
    if (sizeValue) sizeValue.textContent = `${prefs.height} px`;
    stage.hidden = !enabled || pageHidden || document.hidden || root.dataset.intro === 'play';
    ball.hidden = mode !== 'collapsed'; touch.hidden = dragHandle.hidden = collapse.hidden = mode !== 'expanded';
    if (infoBtn) infoBtn.hidden = mode !== 'collapsed';
    if (mode !== 'collapsed') setBubble(false);
    if (!enabled) { setBubble(false); if (infoBtn) infoBtn.hidden = true; cancelDrag(); stop(true); walk = null; state('closed'); return; }
    position();
    if (!permitted()) {
      cancelDrag();
      stop(false);
      if (mode !== 'expanded') { discardWalk(); videos.forEach((video) => video.hidden = true); placeholder.hidden = false; }
      state(safari ? 'static' : 'paused', safari ? 'Safari 使用静态站宠；视频透明效果未验证。' : reduced.matches || root.dataset.motion === 'off' ? '已尊重减少动画偏好，显示静态站宠。' : '站宠已暂停。');
      // Reduced motion is a static icon rather than a half-played video frame.
      if (root.dataset.motion === 'off' || reduced.matches) { videos.forEach((video) => video.hidden = true); placeholder.hidden = false; }
      return;
    }
    if (loading) return;
    if (active >= 0) {
      placeholder.hidden = true; videos[active].hidden = false;
      const epoch = generation;
      const controller = new AbortController(); pending = controller; loading = true;
      const video = videos[active];
      const ownership = claimSlot(active);
      void boundedPlay(video, controller.signal, ownership.owns, ownership.mayPause).then(() => {
        if (!ownership.owns() || epoch !== generation || !permitted()) { if (ownership.mayPause()) video.pause(); return; }
        if (activeId === 'walk') animateWalk();
        state('playing'); scheduleMovement(); scheduleAuto();
        if (video.ended && activeId !== 'idle') {
          // Ended can occur while a page is suspended; do not leave a frozen optional clip.
          queueMicrotask(() => { if (permitted() && !loading) void show('idle'); });
        }
      }).catch(() => {
        controller.abort();
        if (ownership.mayPause()) video.pause();
        if (ownership.owns() && epoch === generation) { slots[active].wantsPlayback = false; state('static', '播放被浏览器暂停；可关闭后重新开启。'); }
      })
        .finally(() => {
          if (pending === controller) { pending = null; loading = false; }
          if (epoch !== generation && permitted()) reconcile();
          else if (permitted() && activeId === 'idle') void prepareWalk();
        });
    } else void prepare();
  }
  function setEnabled(value: boolean) {
    setMode(value ? 'expanded' : 'hidden');
  }
  function setMode(mode: PetMode) {
    setBubble(false);
    cancelDrag(); enabled = mode !== 'hidden'; prefs.mode = mode; manual = enabled; remembered = true;
    if (mode !== 'expanded') { stop(mode === 'hidden'); discardWalk(); }
    if (mode === 'expanded' && coreFailures < 2) { broken = false; failed.delete('idle'); failed.delete('walk'); }
    reconcile(); persist();
  }
  ball.addEventListener('click', (event) => { if (suppressCompatibilityClick(event, ball)) return; if (stage.hidden || displayedMode() !== 'collapsed') return; setMode('expanded'); if (!touch.hidden) touch.focus({ preventScroll: true }); });
  collapse.addEventListener('click', () => { setMode('collapsed'); ball.focus({ preventScroll: true }); });
  infoBtn?.addEventListener('click', () => { if (stage.hidden || displayedMode() !== 'collapsed') return; setBubble(Boolean(bubble?.hidden)); });
  bubbleClose?.addEventListener('click', () => { setBubble(false); infoBtn?.focus({ preventScroll: true }); });
  document.addEventListener('pointerdown', (event) => {
    if (!bubble || bubble.hidden) return;
    const inside = (element: HTMLElement | null | undefined) => Boolean(element && typeof element.contains === 'function' && element.contains(event.target as Node));
    if (inside(bubble) || inside(infoBtn)) return;
    setBubble(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !bubble || bubble.hidden) return;
    event.preventDefault(); setBubble(false); infoBtn?.focus({ preventScroll: true });
  });
  settings?.addEventListener('change', () => setEnabled(settings.checked));
  autoWalk?.addEventListener('change', () => { prefs.autoWalk = autoWalk.checked; stop(false); discardWalk(); reconcile(); persist(); });
  size?.addEventListener('input', () => {
    takeControl();
    prefs.height = Math.max(80, Math.min(180, Number(size.value) || 120));
    stop(false); discardWalk(); position(); reconcile();
  });
  size?.addEventListener('change', persist);
  reset?.addEventListener('click', () => { stop(false); discardWalk(); anchor = restore({ x: .12, y: .92 }, viewport()); position(); persist(); reconcile(); });
  [ball, dragHandle, touch, collapse].forEach((element) => element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && prefs.mode === 'expanded') { event.preventDefault(); setMode('collapsed'); ball.focus({ preventScroll: true }); }
  }));
  dragHandle.addEventListener('click', (event) => { suppressCompatibilityClick(event, dragHandle); });
  [ball, dragHandle].forEach((element) => {
    element.addEventListener('pointerdown', (event) => {
      if (stage.hidden || element.hidden || !event.isPrimary || event.button !== 0 || drag || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      setBubble(false);
      suppressedGesture = null;
      drag = { id: event.pointerId, element, start: { x: event.clientX, y: event.clientY }, anchor: { ...anchor }, moved: false };
      element.setPointerCapture(event.pointerId);
    });
    element.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.start.x, dy = event.clientY - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!drag.moved) { takeControl(); drag.moved = true; stop(false); resetAction(); videos.forEach((video) => video.hidden = true); placeholder.hidden = false; stage.dataset.dragging = 'true'; }
      event.preventDefault(); anchor = { x: drag.anchor.x + dx, y: drag.anchor.y + dy }; position();
    });
    const finish = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const moved = drag.moved; cancelDrag(); if (moved) { persist(); lastInteraction = Date.now(); reconcile(); }
    };
    element.addEventListener('pointerup', finish);
    element.addEventListener('pointercancel', finish);
    element.addEventListener('lostpointercapture', finish);
    element.addEventListener('keydown', (event) => {
      if (stage.hidden || element.hidden) return;
      const delta: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
      const step = delta[event.key]; if (!step) return;
      event.preventDefault(); stop(false); discardWalk(); anchor.x += step.x * (event.shiftKey ? 40 : 10); anchor.y += step.y * (event.shiftKey ? 40 : 10);
      position(); persist(); reconcile();
    });
  });
  touch.addEventListener('click', () => {
    if (stage.hidden || prefs.mode !== 'expanded') return;
    lastInteraction = Date.now();
    touch.dataset.feedback = 'on'; clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(() => delete touch.dataset.feedback, 450);
    if (!permitted() || loading || activeId !== 'idle') return;
    const id = candidate(session, 'click');
    if (id) void show(id, 'click');
  });
  videos.forEach((video, index) => video.addEventListener('ended', () => {
    if (active === index && activeId !== 'idle' && permitted() && !loading) {
      if (activeId === 'walk' && walk) { anchor.x = walk.target; position(); walk = null; persist(); }
      void show('idle');
    }
  }));
  const interaction = () => { lastInteraction = Date.now(); };
  document.addEventListener('pointerdown', interaction, { passive: true });
  document.addEventListener('keydown', interaction);
  document.addEventListener('scroll', interaction, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelDefault();
    } else { lastInteraction = Date.now(); }
    reconcile();
  });
  window.addEventListener('introend', reconcile);
  window.addEventListener('preferenceschange', reconcile);
  new MutationObserver(reconcile).observe(root, { attributes: true, attributeFilter: ['data-intro', 'data-motion'] });
  reduced.addEventListener('change', reconcile);
  desktop.addEventListener('change', reconcile);
  connection?.addEventListener?.('change', () => { clearTimeout(autoTimer); scheduleAuto(); });
  const resize = () => { cancelDrag(); stop(false); discardWalk(); position(); reconcile(); };
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('resize', placeBubble, { passive: true });
  window.visualViewport?.addEventListener('resize', resize, { passive: true });
  window.visualViewport?.addEventListener('scroll', resize, { passive: true });
  window.addEventListener('pagehide', () => {
    pageHidden = true; cancelDrag(); cancelDefault(); stop(true); walk = null;
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) { pageHidden = false; lastInteraction = Date.now(); delayed = false; afterLoad(); reconcile(); }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === PREFERENCE_KEY && event.newValue === 'off') { cancelDrag(); enabled = false; prefs.mode = 'hidden'; remembered = true; reconcile(); }
    if (event.key === LAYOUT_KEY) {
      const next = parseLayout(event.newValue, desktop.matches);
      if (next) { cancelDrag(); stop(next.mode === 'hidden'); discardWalk(); prefs = next; enabled = next.mode !== 'hidden'; manual = remembered = true; anchor = restore(prefs, viewport()); reconcile(); }
    }
  });
  function afterLoad() {
    if (!defaultEligible()) { cancelDefault(); return; }
    if (delayTimer || idleHandle !== undefined) return;
    const epoch = defaultEpoch;
    delayTimer = window.setTimeout(() => {
      if (epoch !== defaultEpoch) return;
      delayTimer = 0;
      if (!defaultEligible()) { cancelDefault(); return; }
      const ready = () => {
        if (epoch !== defaultEpoch) return;
        idleHandle = undefined;
        if (!defaultEligible()) { cancelDefault(); return; }
        // Only a fully eligible callback consumes the one-time default opportunity.
        delayed = true;
        prefs.mode = 'expanded';
        reconcile();
      };
      if ('requestIdleCallback' in window) idleHandle = window.requestIdleCallback(ready, { timeout: 1500 }); else ready();
    }, 2600);
  }
  function defaultEligible() {
    return enabled && !remembered && storageOK && desktop.matches && !delayed && !manual && !safari && !broken
      && document.readyState === 'complete' && !document.hidden && !pageHidden && root.dataset.intro !== 'play'
      && root.dataset.motion !== 'off' && !reduced.matches && !drag?.moved
      && geometry(prefs.height, true, viewport()).expanded;
  }
  if (document.readyState === 'complete') afterLoad(); else window.addEventListener('load', afterLoad, { once: true });
  reconcile();
}
