import type { Post, Profile, Home, Projects, Resources, Resume } from './content';

const requests = new Map<string, Promise<unknown>>();
function fetchData<T>(name: string): Promise<T> {
  if (!requests.has(name)) requests.set(name, fetch(`/api/${name}`, { signal: AbortSignal.timeout(10000) }).then(async (response) => {
    if (!response.ok) throw new Error('读取失败'); return response.json();
  }).catch((error) => { requests.delete(name); throw error; }));
  return requests.get(name) as Promise<T>;
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
void Promise.allSettled([profile(), home(), latest(), projects(), blog(), resources(), resume()]);

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
