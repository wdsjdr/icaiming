import type { Post, Profile, Home, Projects, Resources, Downloads, Rankings, HotboardIndex, Hotboard, EpicFree, SteamDeals, Saying, Answerbook, DailyNews, Resume } from './content';

const requests = new Map<string, Promise<unknown>>();
function fetchData<T>(name: string): Promise<T> {
  if (!requests.has(name)) requests.set(name, fetch(`/api/${name}`, { signal: AbortSignal.timeout(10000) }).then(async (response) => {
    if (!response.ok) { const error = new Error('读取失败') as Error & { status?: number }; error.status = response.status; throw error; }
    return response.json();
  }).catch((error) => { requests.delete(name); throw error; }));
  return requests.get(name) as Promise<T>;
}
// Aggregator-managed collections may not exist until the Worker has run; a 404 means "no data yet", not an error.
async function fetchOptional<T>(name: string): Promise<T | null> {
  try { return await fetchData<T>(name); }
  catch (error) { if ((error as { status?: number }).status === 404) return null; throw error; }
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') {
  const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
}
function link(href: string, label: string, className = '') {
  const element = node('a', label, className);
  if (/^https?:\/\//.test(href) || /^\/(?!\/)/.test(href) || /^mailto:/.test(href)) element.href = href;
  if (/^https?:\/\//.test(href)) { element.target = '_blank'; element.rel = 'noopener noreferrer'; }
  return element;
}
function tags(values: string[]) { const box = node('span', '', 'tags'); values.forEach((tag) => box.append(node('span', tag, 'tag'))); return box; }
function empty(text: string) { return node('p', text, 'empty-state'); }
function recover(target: Element, action: () => Promise<void>) {
  const box = node('div', '', 'error-state'); box.append(node('p', '内容暂时无法读取。请确认本地服务已启动，或稍后重试。'));
  const button = node('button', '重新读取'); button.addEventListener('click', () => { target.replaceChildren(node('p', '正在重试…', 'loading')); void action(); });
  box.append(button); target.replaceChildren(box);
}
function postCard(post: Post) {
  const card = link(`/blog/${post.slug}`, '', 'post-card');
  const meta = node('div', '', 'post-meta'); meta.append(node('span', post.date.replaceAll('-', '.')), node('span', `${post.readingMinutes} MIN READ`));
  const bottom = node('div', '', 'read-link'); bottom.append(tags(post.tags), node('span', '↗'));
  card.append(meta, node('h3', post.title), node('p', post.description), bottom); return card;
}
async function profile() {
  try {
    const data = await fetchData<Profile>('profile');
    document.querySelectorAll<HTMLAnchorElement>('[data-email-link]').forEach((el) => { el.href = `mailto:${data.email}`; if (el.hasAttribute('data-email-text')) el.textContent = data.email; });
    document.querySelectorAll('[data-profile-bio]').forEach((el) => el.textContent = data.bio);
    document.querySelectorAll('[data-profile-tagline]').forEach((el) => el.textContent = data.tagline);
    document.querySelectorAll('[data-social-links]').forEach((target) => {
      target.replaceChildren(...data.socials.map((social) => {
        const element = link(social.url, '', 'social-link'); const image = node('img'); image.src = `/media/assets/icons/${social.id}.svg`; image.alt = ''; image.width = 18; image.height = 18;
        element.append(image, node('span', social.label), node('span', '↗')); return element;
      }));
    });
  } catch {
    document.querySelectorAll('[data-profile-bio], [data-email-text]').forEach((target) => recover(target, profile));
  }
}
async function home() {
  const target = document.querySelector('[data-home-intro]'); if (!target) return;
  try { const data = await fetchData<Home>('home'); target.textContent = data.introduction;
    document.querySelector('[data-home-eyebrow]')!.textContent = data.eyebrow;
    document.querySelector('[data-home-status]')!.textContent = data.status;
  } catch { recover(target, home); }
}
async function latest() {
  const target = document.querySelector('[data-latest-posts]'); if (!target) return;
  try { const { posts } = await fetchData<{ posts: Post[] }>('posts'); target.replaceChildren(...(posts.length ? posts.slice(0, 3).map(postCard) : [empty('第一篇记录还在路上。')])); }
  catch { recover(target, latest); }
}
async function projects() {
  const target = document.querySelector('[data-projects]'); if (!target) return;
  try { const data = await fetchData<Projects>('projects'); target.replaceChildren(...data.items.map((item) => {
    const card = link(item.url, '', 'project-item'); card.append(node('span', item.status, 'project-status'), node('h3', `${item.title} ↗`), node('p', item.description), tags(item.tags)); return card;
  })); if (!data.items.length) target.append(empty('项目记录正在整理。')); }
  catch { recover(target, projects); }
}
function filterButtons(target: Element, values: string[], current: string, choose: (value: string) => void) {
  target.replaceChildren(...['全部', ...values].map((value) => { const button = node('button', value, 'filter'); button.setAttribute('aria-pressed', String(value === current)); button.addEventListener('click', () => choose(value)); return button; }));
}
async function blog() {
  const target = document.querySelector('[data-post-list]'); if (!target) return;
  try {
    const { posts } = await fetchData<{ posts: Post[] }>('posts');
    const allTags = [...new Set(posts.flatMap((post) => post.tags))];
    const query = new URLSearchParams(location.search);
    let selected = allTags.includes(query.get('tag') ?? '') ? query.get('tag')! : '全部';
    const search = document.querySelector<HTMLInputElement>('[data-post-search]')!; search.value = query.get('q') ?? '';
    const filterBox = document.querySelector('[data-post-filters]')!;
    function render() {
      const q = search.value.trim().toLocaleLowerCase();
      const matched = posts.filter((post) => (selected === '全部' || post.tags.includes(selected)) && `${post.title} ${post.description} ${post.tags.join(' ')}`.toLocaleLowerCase().includes(q));
      target!.replaceChildren(...(matched.length ? matched.map(postCard) : [empty(posts.length ? '没有找到匹配的记录，试试其他关键词。' : '第一篇记录还在路上。')]));
      document.querySelector('[data-post-count]')!.textContent = `${matched.length} 篇记录 / ${posts.length} TOTAL`;
      filterButtons(filterBox, allTags, selected, (value) => { selected = value; render(); });
      const url = new URL(location.href); q ? url.searchParams.set('q', search.value) : url.searchParams.delete('q');
      selected === '全部' ? url.searchParams.delete('tag') : url.searchParams.set('tag', selected);
      history.replaceState(null, '', url);
    }
    search.oninput = render; render();
  } catch { recover(target, blog); }
}
async function resources() {
  const target = document.querySelector('[data-resource-list]'); if (!target) return;
  try {
    const data = await fetchData<Resources>('resources'); let selected = '全部';
    const categories = [...new Set(data.items.map((item) => item.category))];
    const search = document.querySelector<HTMLInputElement>('[data-resource-search]')!;
    function render() {
      const q = search.value.trim().toLocaleLowerCase();
      const matched = data.items.filter((item) => (selected === '全部' || selected === item.category) && `${item.title} ${item.description} ${item.tags.join(' ')}`.toLocaleLowerCase().includes(q));
      target!.replaceChildren(...matched.map((item) => {
        const card = link(item.url, '', 'resource-card'); card.append(node('span', item.category.toUpperCase(), 'eyebrow'), node('h2', `${item.title} ↗`), node('p', item.description), tags(item.tags), node('span', new URL(item.url).hostname, 'resource-domain')); return card;
      }));
      if (!matched.length) target!.append(empty('没有匹配的资源，换个关键词试试。'));
      document.querySelector('[data-resource-count]')!.textContent = `${matched.length} 个收藏 / CURATED LINKS`;
      filterButtons(document.querySelector('[data-resource-filters]')!, categories, selected, (value) => { selected = value; render(); });
    }
    search.oninput = render; render();
  } catch { recover(target, resources); }
}
async function downloads() {
  const target = document.querySelector('[data-download-list]'); if (!target) return;
  try {
    const data = await fetchData<Downloads>('downloads');
    if (!data.items.length) { target.replaceChildren(empty('下载资源正在整理。')); return; }
    target.replaceChildren(...data.items.map((item) => {
      const external = Boolean(item.url);
      const card = link(external ? (item.url as string) : `/media/${item.file}?download=1`, '', 'download-card');
      if (external) { card.target = '_blank'; card.rel = 'noopener noreferrer'; }
      card.append(node('span', item.category.toUpperCase(), 'eyebrow'), node('h3', item.title), node('p', item.description), tags(item.tags));
      const meta = [item.size, item.updated?.replaceAll('-', '.')].filter(Boolean).join(' · ');
      if (meta) card.append(node('span', meta, 'download-meta'));
      return card;
    }));
  } catch { recover(target, downloads); }
}
function formatTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
function rankingRow(item: Rankings['items'][number]) {
  const row = node('li', '', 'ranking-row');
  row.append(node('span', String(item.rank).padStart(2, '0'), 'ranking-rank'));
  const main = node('div', '', 'ranking-main');
  const title = item.url ? link(item.url, '', 'ranking-name') : node('span', '', 'ranking-name');
  title.append(node('strong', item.name));
  if (item.vendor) title.append(node('span', item.vendor, 'ranking-vendor'));
  main.append(title); if (item.tags.length) main.append(tags(item.tags));
  row.append(main);
  const score = node('div', '', 'ranking-score');
  const bar = node('span', '', 'ranking-bar'); bar.style.width = `${Math.round(item.score * 100)}%`;
  const stars = typeof item.raw === 'number' && item.raw > 0 ? `+${item.raw.toLocaleString('en-US')}` : '—';
  const value = node('span', stars, 'ranking-value');
  if (typeof item.raw === 'number' && item.raw > 0) value.title = 'GitHub Trending 今日新增 star 数';
  score.append(bar, value);
  row.append(score); return row;
}
const RANKING_PREVIEW = 10;
async function rankings() {
  const target = document.querySelector('[data-rankings]'); if (!target) return;
  const stamp = document.querySelector('[data-rankings-updated]');
  try {
    const data = await fetchOptional<Rankings>('rankings');
    if (stamp) stamp.textContent = data?.updatedAt ? `来源 GitHub · 更新于 ${formatTime(data.updatedAt)}` : '尚未更新';
    if (!data || !data.items.length) { target.replaceChildren(empty('榜单数据尚未更新，等待下一次抓取。')); return; }
    let expanded = false;
    const render = () => {
      const visible = expanded ? data.items : data.items.slice(0, RANKING_PREVIEW);
      const list = node('ol', '', 'ranking-list'); list.append(...visible.map(rankingRow));
      const head = node('div', '', 'ranking-head');
      head.append(node('span', '排名'), node('span', '项目'), node('span', '今日新增 Stars'));
      target.replaceChildren(head, list);
      if (data.items.length > RANKING_PREVIEW) {
        const toggle = node('button', expanded ? '收起 ▴' : `展开全部 ${data.items.length} 条 ▾`, 'ranking-more');
        toggle.addEventListener('click', () => { expanded = !expanded; render(); });
        target.append(toggle);
      }
    };
    render();
  } catch { recover(target, rankings); }
}
async function saying() {
  const targets = document.querySelectorAll('[data-saying]'); if (!targets.length) return;
  try {
    const data = await fetchOptional<Saying>('saying');
    if (!data || !data.items.length) return;
    const pick = data.items[Math.floor(Math.random() * data.items.length)];
    targets.forEach((target) => { if (pick) target.textContent = pick; });
  } catch { /* 一言只是点缀，失败时保留默认文案 */ }
}
function remaining(endAt?: number) {
  if (!endAt) return '限时免费';
  const days = Math.ceil((endAt - Date.now()) / 86400000);
  return days > 0 ? `剩余 ${days} 天` : '即将结束';
}
async function epicFree() {
  const target = document.querySelector('[data-epic-free]'); if (!target) return;
  try {
    const data = await fetchOptional<EpicFree>('epic-free');
    if (!data || !data.items.length) { target.replaceChildren(empty('本周免费游戏尚未更新。')); return; }
    target.replaceChildren(...data.items.map((item) => {
      const card = link(item.link, '', 'epic-card');
      if (item.cover) { const image = node('img', '', 'epic-cover'); image.src = item.cover; image.alt = `${item.title} 封面`; image.loading = 'lazy'; card.append(image); }
      const body = node('div', '', 'epic-body'); body.append(node('h3', item.title));
      const meta = node('div', '', 'epic-meta');
      if (item.originalPriceDesc) meta.append(node('span', item.originalPriceDesc, 'epic-price'));
      meta.append(node('span', remaining(item.freeEndAt), 'epic-timer'));
      body.append(meta);
      if (item.description) body.append(node('p', item.description, 'epic-desc'));
      card.append(body); return card;
    }));
  } catch { recover(target, epicFree); }
}
function steamPrice(value: number) { return value === 0 ? '免费' : `¥${Number.isInteger(value) ? value : value.toFixed(2)}`; }
const STEAM_PAGE = 48;
async function steamDeals() {
  const target = document.querySelector<HTMLElement>('[data-steam-deals]'); if (!target) return;
  const meta = document.querySelector<HTMLElement>('[data-steam-meta]');
  try {
    const data = await fetchOptional<SteamDeals>('steam-deals');
    if (meta) { const stamp = data?.sourceUpdatedAt || data?.updatedAt;
      meta.textContent = [data?.items.length ? `共 ${data.items.length} 款` : '', stamp ? `更新于 ${formatTime(stamp)}` : ''].filter(Boolean).join(' · '); }
    if (!data || !data.items.length) { target.replaceChildren(empty('暂时没有折扣数据，等下一次同步。')); return; }
    const query = node('input', '', 'deal-search') as HTMLInputElement;
    query.type = 'search'; query.placeholder = '搜索游戏名'; query.setAttribute('aria-label', '搜索游戏名');
    const sort = node('select', '', 'deal-sort') as HTMLSelectElement; sort.setAttribute('aria-label', '排序');
    for (const [value, label] of [['discount', '折扣优先'], ['price', '价格最低'], ['hot', '最热门']] as const) {
      const option = node('option', label) as HTMLOptionElement; option.value = value; sort.append(option);
    }
    const toolbar = node('div', '', 'deal-toolbar'); toolbar.append(query, sort);
    const chips = node('div', '', 'deal-chips');
    const grid = node('div', '', 'deal-grid');
    const summary = node('p', '', 'deal-summary');
    const filters = [['all', '全部'], ['low', '史低'], ['newlow', '新史低'], ['free', '免费'], ['d70', '≥70%'], ['d90', '≥90%']] as const;
    let filter = 'all'; let q = ''; let page = 1;
    const match = (item: SteamDeals['items'][number]) => {
      if (filter === 'low' && !item.isLow) return false;
      if (filter === 'newlow' && !item.isNewLow) return false;
      if (filter === 'free' && item.final !== 0) return false;
      if (filter === 'd70' && item.discount < 70) return false;
      if (filter === 'd90' && item.discount < 90) return false;
      return !q || `${item.nameEn} ${item.nameZh}`.toLocaleLowerCase().includes(q);
    };
    const card = (item: SteamDeals['items'][number]) => {
      const element = link(item.url, '', 'deal-card');
      const cover = item.header || item.capsule;
      if (cover) {
        const image = node('img', '', 'deal-cover'); image.src = cover; image.alt = ''; image.loading = 'lazy';
        image.addEventListener('error', () => { image.style.display = 'none'; }); element.append(image);
      }
      element.append(node('span', item.final === 0 ? '免费' : `-${item.discount}%`, 'deal-badge'), node('h3', item.nameZh || item.nameEn, 'deal-title'));
      const price = node('div', '', 'deal-price'); price.append(node('span', steamPrice(item.final), 'deal-final'));
      if (item.original > item.final) price.append(node('del', `¥${Number.isInteger(item.original) ? item.original : item.original.toFixed(2)}`, 'deal-del'));
      element.append(price);
      const tags = node('div', '', 'deal-tags');
      if (item.isNewLow) tags.append(node('span', '新史低', 'deal-tag')); else if (item.isLow) tags.append(node('span', '史低', 'deal-tag'));
      if (item.endsAt) {
        const end = Date.parse(item.endsAt);
        if (!Number.isNaN(end)) tags.append(node('span', `剩余 ${Math.max(0, Math.ceil((end - Date.now()) / 86400000))} 天`, 'deal-tag'));
      }
      if (tags.childElementCount) element.append(tags);
      const reviews: string[] = [];
      if (item.reviewPercent !== null) reviews.push(`好评率 ${item.reviewPercent}%`);
      if (item.reviewCount > 0) reviews.push(`${item.reviewCount} 人评测`);
      if (reviews.length) element.append(node('span', reviews.join(' · '), 'deal-review'));
      return element;
    };
    const render = () => {
      const filtered = data.items.filter(match).sort((a, b) => {
        if (sort.value === 'price') return a.final - b.final || b.discount - a.discount;
        if (sort.value === 'hot') return b.reviewCount - a.reviewCount;
        return b.discount - a.discount || b.reviewCount - a.reviewCount;
      });
      const visible = filtered.slice(0, page * STEAM_PAGE);
      const shown: HTMLElement[] = visible.map(card);
      if (!shown.length) shown.push(empty('没有符合条件的折扣。'));
      grid.replaceChildren(...shown);
      if (filtered.length > visible.length) {
        const more = node('button', `加载更多 · 还有 ${filtered.length - visible.length} 款`, 'deal-more') as HTMLButtonElement;
        more.type = 'button'; more.addEventListener('click', () => { page += 1; render(); }); grid.append(more);
      }
      chips.replaceChildren(...filters.map(([value, label]) => {
        const chip = node('button', label, 'deal-chip') as HTMLButtonElement;
        chip.type = 'button'; chip.setAttribute('aria-pressed', String(value === filter));
        chip.addEventListener('click', () => { filter = value; page = 1; render(); }); return chip;
      }));
      summary.textContent = `共 ${filtered.length} 款`;
    };
    query.addEventListener('input', () => { q = query.value.trim().toLocaleLowerCase(); page = 1; render(); });
    sort.addEventListener('change', () => { page = 1; render(); });
    target.replaceChildren(toolbar, chips, grid, summary); render();
  } catch { recover(target, steamDeals); }
}
const HOTBOARD_PREVIEW = 10;
async function hotboard() {
  const target = document.querySelector('[data-hotboard]'); if (!target) return;
  const tabs = document.querySelector('[data-hotboard-tabs]');
  const meta = document.querySelector('[data-hotboard-updated]');
  try {
    const index = await fetchOptional<HotboardIndex>('hotboard');
    if (!index || !index.platforms.length) { target.replaceChildren(empty('热榜数据尚未更新，等待下一次抓取。')); return; }
    const cache = new Map<string, Hotboard>();
    let selected = index.platforms[0].type;
    let expanded = false;
    const render = (data: Hotboard) => {
      const items = data.items;
      if (!items.length) { target.replaceChildren(empty('这个平台暂时没有数据。')); return; }
      const visible = expanded ? items : items.slice(0, HOTBOARD_PREVIEW);
      target.replaceChildren(...visible.map((item) => {
        const row = link(item.url, '', 'hot-row');
        row.append(node('span', String(item.index).padStart(2, '0'), 'hot-rank'), node('span', item.title, 'hot-title'));
        if (item.hotValue) row.append(node('span', item.hotValue, 'hot-value'));
        return row;
      }));
      if (items.length > HOTBOARD_PREVIEW) {
        const toggle = node('button', expanded ? '收起 ▴' : `展开全部 ${items.length} 条 ▾`, 'hot-more');
        toggle.addEventListener('click', () => { expanded = !expanded; render(data); });
        target.append(toggle);
      }
    };
    const show = async (type: string) => {
      selected = type; expanded = false;
      tabs?.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.type === type)));
      target.replaceChildren(node('p', '正在读取…', 'loading'));
      try {
        let data = cache.get(type);
        if (!data) { const fetched = await fetchOptional<Hotboard>(`hotboard?type=${type}`); if (!fetched) { if (meta) meta.textContent = ''; target.replaceChildren(empty('这个平台暂时没有数据。')); return; } data = fetched; cache.set(type, data); }
        if (meta) meta.textContent = data.updateAt ? `来源 UAPI · 更新于 ${formatTime(data.updateAt)}` : '';
        render(data);
      } catch { recover(target, () => show(type)); }
    };
    if (tabs) tabs.replaceChildren(...index.platforms.map((platform) => {
      const button = node('button', platform.label, 'filter'); button.dataset.type = platform.type;
      button.setAttribute('aria-pressed', String(platform.type === selected));
      button.addEventListener('click', () => void show(platform.type));
      return button;
    }));
    await show(selected);
  } catch { recover(target, hotboard); }
}
function resourceTabs() {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-resource-tabs] [role="tab"]')];
  const panels = [...document.querySelectorAll<HTMLElement>('[data-resource-panels] [role="tabpanel"]')];
  const bar = document.querySelector<HTMLElement>('[data-resource-tabs]');
  if (!tabs.length || !panels.length) return;
  const keys = new Set(panels.map((panel) => panel.dataset.panel ?? ''));
  const loaders: Record<string, () => void> = { curated: () => void resources(), downloads: () => void downloads(), rankings: () => void rankings(), trending: () => void hotboard() };
  const loaded = new Set<string>();
  const activate = (key: string, remember: boolean) => {
    tabs.forEach((tab) => { const active = tab.dataset.panel === key; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
    panels.forEach((panel) => { panel.hidden = panel.dataset.panel !== key; });
    if (!loaded.has(key)) { loaded.add(key); loaders[key]?.(); }
    if (remember) history.replaceState(null, '', `#${key}`);
  };
  const focusTab = (index: number) => { activate(tabs[index].dataset.panel ?? '', true); tabs[index].focus(); };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab.dataset.panel ?? '', true));
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); focusTab((index + 1) % tabs.length); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); focusTab((index - 1 + tabs.length) % tabs.length); }
      else if (event.key === 'Home') { event.preventDefault(); focusTab(0); }
      else if (event.key === 'End') { event.preventDefault(); focusTab(tabs.length - 1); }
    });
  });
  if (bar) {
    const sync = () => document.documentElement.style.setProperty('--resource-tabs-h', `${bar.offsetHeight}px`);
    sync();
    window.addEventListener('resize', sync, { passive: true });
  }
  const hash = location.hash.slice(1);
  activate(keys.has(hash) ? hash : 'trending', false);
  window.addEventListener('hashchange', () => { const next = location.hash.slice(1); if (keys.has(next)) activate(next, false); });
}
function answerbook() {
  const form = document.querySelector<HTMLFormElement>('[data-answerbook-form]'); if (!form) return;
  const input = form.querySelector<HTMLInputElement>('[name="q"]');
  const output = document.querySelector<HTMLElement>('[data-answerbook-answer]');
  const status = document.querySelector<HTMLElement>('[data-answerbook-status]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = input?.value.trim() ?? '';
    if (!question) { if (status) status.textContent = '先写下你的问题。'; input?.focus(); return; }
    if (status) status.textContent = '正在翻书…';
    output?.classList.add('is-thinking');
    try {
      const response = await fetch(`/api/answerbook?q=${encodeURIComponent(question)}`, { signal: AbortSignal.timeout(10000) });
      const data = await response.json() as Partial<Answerbook> & { error?: string };
      if (!response.ok || !data.answer) throw new Error(data.error ?? '答案之书暂时沉默了，稍后再试。');
      if (output) { output.textContent = data.answer; output.classList.remove('is-thinking'); output.classList.add('is-revealed'); }
      if (status) status.textContent = '';
    } catch (error) {
      output?.classList.remove('is-thinking');
      if (status) status.textContent = error instanceof Error && error.message ? error.message : '答案之书暂时沉默了，稍后再试。';
    }
  });
}
function beijingToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
const CALENDAR_MONTHS_BACK = 12;
async function dailyNews() {
  const root = document.querySelector<HTMLElement>('[data-daily]'); if (!root) return;
  const grid = root.querySelector<HTMLElement>('[data-cal-grid]');
  const title = root.querySelector<HTMLElement>('[data-cal-title]');
  const frame = root.querySelector<HTMLElement>('[data-daily-frame]');
  const label = root.querySelector<HTMLElement>('[data-daily-label]');
  const linkEl = root.querySelector<HTMLAnchorElement>('[data-daily-link]');
  const prev = root.querySelector<HTMLButtonElement>('[data-cal-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-cal-next]');
  if (!grid || !title) return;
  let available = new Set<string>();
  let latest = '';
  try {
    const data = await fetchOptional<DailyNews>('daily-news');
    available = new Set(data?.dates ?? []);
    latest = data?.dates?.[0] ?? '';
  } catch { /* 归档尚未开始，按空集合渲染 */ }
  const today = beijingToday();
  const [cy, cm] = today.split('-').map(Number);
  const currentIndex = cy * 12 + (cm - 1);
  const minIndex = currentIndex - CALENDAR_MONTHS_BACK;
  let vy = cy;
  let vm = cm;
  let selected = '';
  const pad = (value: number) => String(value).padStart(2, '0');
  const monthIndex = (year: number, month: number) => year * 12 + (month - 1);
  const show = (value: string) => {
    selected = value;
    if (frame) {
      const image = node('img', '', 'daily-image') as HTMLImageElement;
      image.src = `/daily-image/${value}`; image.alt = `${value} 每日新闻`; image.loading = 'lazy';
      frame.replaceChildren(image);
    }
    if (label) label.textContent = `${value} 每日新闻`;
    if (linkEl) { linkEl.href = `/daily-image/${value}`; linkEl.removeAttribute('hidden'); }
    render();
  };
  const render = () => {
    title.textContent = `${vy} 年 ${vm} 月`;
    if (prev) prev.disabled = monthIndex(vy, vm) <= minIndex;
    if (next) next.disabled = monthIndex(vy, vm) >= currentIndex;
    const first = new Date(Date.UTC(vy, vm - 1, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(vy, vm, 0)).getUTCDate();
    const cells: Node[] = [];
    for (let index = 0; index < offset; index++) cells.push(node('span', '', 'cal-blank'));
    for (let day = 1; day <= days; day++) {
      const value = `${vy}-${pad(vm)}-${pad(day)}`;
      const button = node('button', String(day), 'cal-day');
      button.type = 'button';
      if (value === selected) button.classList.add('is-selected');
      if (value > today) button.disabled = true;
      else if (available.has(value)) { button.classList.add('has'); button.setAttribute('aria-label', `${value} 有新闻图`); button.addEventListener('click', () => show(value)); }
      else button.disabled = true;
      cells.push(button);
    }
    grid.replaceChildren(...cells);
  };
  const shift = (delta: number) => {
    const index = monthIndex(vy, vm) + delta;
    if (index < minIndex || index > currentIndex) return;
    vy = Math.floor(index / 12); vm = (index % 12) + 1;
    render();
  };
  prev?.addEventListener('click', () => shift(-1));
  next?.addEventListener('click', () => shift(1));
  const initial = available.has(today) ? today : latest;
  if (initial) { const [year, month] = initial.split('-').map(Number); vy = year; vm = month; show(initial); }
  else render();
}
async function resume() {
  const target = document.querySelector('[data-resume]'); if (!target) return;
  try {
    const data = await fetchData<Resume>('resume');
    target.replaceChildren(node('h2', `${data.name} · ${data.title}`), node('p', data.summary, 'resume-summary'));
    const download = data.pdf ? link(`/media/${data.pdf}`, '下载 PDF ↓', 'button') : node('p', 'PDF 简历尚未提供。完整资料整理后会在这里开放下载。', 'empty-state');
    target.append(download);
    for (const [label, entries] of [['工作与项目经历', data.experience], ['教育背景', data.education]] as const) {
      const block = node('section', '', 'resume-block'); block.append(node('h2', label));
      if (!entries.length) block.append(node('p', '资料整理中。', 'muted'));
      for (const entry of entries) { const item = node('div', '', 'timeline-item'); item.append(node('span', entry.period, 'eyebrow'), node('h3', `${entry.title} · ${entry.organization}`), node('p', entry.description)); block.append(item); }
      target.append(block);
    }
    const skills = node('section', '', 'resume-block'); skills.append(node('h2', '技能与工具'), data.skills.length ? tags(data.skills) : node('p', '技能资料整理中。', 'muted')); target.append(skills);
  } catch { recover(target, resume); }
}
document.querySelector('[data-print]')?.addEventListener('click', () => window.print());
void Promise.allSettled([profile(), home(), latest(), projects(), blog(), epicFree(), steamDeals(), saying(), dailyNews(), resume()]);
answerbook();
resourceTabs();

const progress = document.querySelector<HTMLElement>('[data-reading-progress]');
if (progress) {
  let ticking = false;
  const update = () => { const article = document.querySelector<HTMLElement>('[data-article-body]');
    if (article) { const start = article.offsetTop; const range = Math.max(1, article.offsetHeight - window.innerHeight); progress.style.width = `${Math.min(100, Math.max(0, (window.scrollY - start) / range * 100))}%`; }
    ticking = false;
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update); update();
}
