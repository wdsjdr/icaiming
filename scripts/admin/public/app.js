const token = document.querySelector('meta[name="admin-token"]').content;
const state = { tab: 'overview', siteOrigin: 'http://127.0.0.1:4321', mediaFiles: [], dirty: false };

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const val = (id) => document.getElementById(id).value.trim();
const fmtSize = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const fmtTime = (iso) => { try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }); } catch { return iso; } };
const parseTags = (value) => String(value ?? '').split(/[,，、]/).map((part) => part.trim()).filter(Boolean);

async function api(path, options = {}) {
  const init = { method: options.method || 'GET', headers: { 'x-admin-token': token } };
  if ('json' in options) {
    init.method = options.method || 'POST';
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.json);
  } else if (options.body) {
    init.method = options.method || 'POST';
    init.body = options.body;
    init.headers['content-type'] = options.type || 'application/octet-stream';
  }
  const response = await fetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
  return data;
}

let toastTimer;
function toast(message, kind = 'ok') {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.className = `toast ${kind}`;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 3800);
}

async function act(job) {
  try {
    return await job();
  } catch (error) {
    toast(error.message, 'error');
    return null;
  }
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function updateDirtyIndicators() {
  document.getElementById('view').classList.toggle('dirty', state.dirty);
}

function markDirty() {
  if (state.dirty) return;
  state.dirty = true;
  updateDirtyIndicators();
}

function markClean() {
  state.dirty = false;
  updateDirtyIndicators();
}

function confirmLeave() {
  if (!state.dirty) return true;
  return confirm('当前页面有未保存的修改，离开将丢失。仍要离开吗？');
}

const COLLECTION_LABELS = { profile: '个人资料', home: '首页文案', projects: '项目', resources: '资源收藏', downloads: '下载清单', resume: '简历' };

const ITEM_FIELDS = {
  resources: [
    { key: 'title', label: '名称', required: true },
    { key: 'description', label: '描述', required: true },
    { key: 'category', label: '分类', required: true },
    { key: 'url', label: '链接', required: true, kind: 'weburl' },
    { key: 'tags', label: '标签（逗号分隔）', kind: 'tags' },
  ],
  downloads: [
    { key: 'title', label: '名称', required: true },
    { key: 'description', label: '描述', required: true },
    { key: 'category', label: '分类', required: true },
    { key: 'file', label: '文件（assets/ 或 downloads/）', required: true, kind: 'file' },
    { key: 'size', label: '大小（可选）' },
    { key: 'updated', label: '更新日期（可选）', kind: 'date' },
    { key: 'tags', label: '标签（逗号分隔）', kind: 'tags' },
  ],
  projects: [
    { key: 'title', label: '名称', required: true },
    { key: 'description', label: '描述', required: true },
    { key: 'status', label: '状态', required: true },
    { key: 'url', label: '链接', required: true, kind: 'link' },
    { key: 'tags', label: '标签（逗号分隔）', kind: 'tags' },
  ],
};

function fieldHtml(field, value) {
  const classes = field.kind === 'file' ? ' class="code"' : field.kind === 'tags' ? ' class="tag-input"' : '';
  const listAttr = field.kind === 'file' ? ' list="media-files"' : '';
  const uploader = field.kind === 'file'
    ? `<div class="row" style="margin-top:6px"><input type="file" data-file-input hidden><button type="button" class="btn small" data-file-upload>上传文件并填入</button><span class="hint" style="margin:0">也可直接填写已有路径</span></div>`
    : '';
  return `<label class="field"><span>${esc(field.label)}</span><input data-key="${field.key}" value="${esc(value || '')}"${listAttr}${classes}><small class="field-error" hidden></small>${uploader}</label>`;
}

function isWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const SITE_PATH_PATTERN = /^\/(?!\/)[^\\\s]*$/;

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function itemIssues(container, config) {
  const issues = [];
  for (const card of container.querySelectorAll('[data-item]')) {
    for (const field of config) {
      const input = card.querySelector(`[data-key="${field.key}"]`);
      const value = input.value.trim();
      let message = '';
      if (field.required && !value) message = `请填写${field.label.replace(/（.*）$/, '')}`;
      else if (value && field.kind === 'weburl' && !isWebUrl(value)) message = '链接需以 http:// 或 https:// 开头';
      else if (value && field.kind === 'link' && !isWebUrl(value) && !SITE_PATH_PATTERN.test(value)) message = '链接需为 http(s):// 或以 / 开头的站内路径';
      else if (value && field.kind === 'date' && !isIsoDate(value)) message = '日期需为有效日期，格式 YYYY-MM-DD';
      if (message) issues.push({ card, input, message });
    }
  }
  return issues;
}

function clearIssues(container) {
  for (const card of container.querySelectorAll('[data-item]')) {
    card.classList.remove('invalid');
    for (const marked of card.querySelectorAll('.invalid')) marked.classList.remove('invalid');
    for (const hint of card.querySelectorAll('.field-error')) {
      hint.hidden = true;
      hint.textContent = '';
    }
  }
}

function showIssues(container, issues) {
  clearIssues(container);
  for (const issue of issues) {
    issue.card.classList.add('invalid');
    issue.input.classList.add('invalid');
    const hint = issue.input.closest('label')?.querySelector('.field-error');
    if (hint) {
      hint.textContent = issue.message;
      hint.hidden = false;
    }
  }
  if (issues.length) {
    issues[0].card.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    issues[0].input.focus({ preventScroll: true });
  }
}

function mapServerIssues(message, container, config) {
  const cards = [...container.querySelectorAll('[data-item]')];
  const issues = [];
  for (const part of String(message).split('；')) {
    const match = /^items\.(\d+)\.(\w+):\s*(.+)$/.exec(part.trim());
    if (!match) continue;
    const card = cards[Number(match[1])];
    if (!card) continue;
    const field = config.find((entry) => entry.key === match[2]);
    const input = card.querySelector(`[data-key="${match[2]}"]`);
    if (!input) continue;
    let text = match[3];
    if (/invalid input/i.test(text)) {
      text = field?.kind === 'weburl' ? '链接需以 http:// 或 https:// 开头'
        : field?.kind === 'link' ? '链接需为 http(s):// 或以 / 开头的站内路径'
          : '输入无效，请检查该字段';
    }
    issues.push({ card, input, message: text });
  }
  return issues.length ? issues : null;
}

async function refreshHeader() {
  try {
    const info = await api('/api/state');
    if (info.siteOrigin) state.siteOrigin = info.siteOrigin;
    const element = document.getElementById('site-status');
    element.className = `site-status ${info.siteRunning ? 'online' : ''}`;
    element.innerHTML = `<span class="dot"></span>本地站点${info.siteRunning ? '运行中' : '未运行'}`;
    return info;
  } catch {
    return null;
  }
}

const TABS = [
  ['overview', '概览'], ['posts', '文章'], ['resources', '资源收藏'], ['downloads', '下载'],
  ['projects', '项目'], ['profile', '资料与首页'], ['resume', '简历'], ['media', '媒体库'], ['trash', '回收站'],
];

const views = {};

function renderTabs() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(([id, label]) => `<button data-tab="${id}" class="${state.tab === id ? 'active' : ''}">${esc(label)}</button>`).join('');
  nav.onclick = (event) => {
    const button = event.target.closest('button[data-tab]');
    if (button) selectTab(button.dataset.tab);
  };
}

async function selectTab(tab) {
  if (tab !== state.tab && !confirmLeave()) return;
  state.dirty = false;
  state.tab = tab;
  renderTabs();
  const view = document.getElementById('view');
  updateDirtyIndicators();
  view.innerHTML = '<p class="muted">加载中…</p>';
  try {
    await views[tab](view);
  } catch (error) {
    view.innerHTML = `<p class="muted">加载失败：${esc(error.message)}</p>`;
  }
}

function card(number, label) {
  return `<div class="card"><div class="num">${number}</div><div class="label">${esc(label)}</div></div>`;
}

async function runPipeline(endpoint, label) {
  const log = document.getElementById('pipeline-log');
  log.hidden = false;
  log.textContent = `${label}中…`;
  const buttons = [...document.querySelectorAll('button.btn')];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const result = await api(endpoint, { json: {} });
    log.textContent = (result.logs || []).join('\n').trim() || (result.ok ? '完成，无输出' : '无日志');
    if (result.ok) {
      const summary = result.summary;
      if (summary && summary.mode === 's3') {
        const changed = summary.added + summary.updated + summary.removed;
        toast(changed
          ? `发布完成：新增 ${summary.added} · 更新 ${summary.updated} · 跳过 ${summary.skipped} · 删除 ${summary.removed}`
          : `无变更：${summary.skipped} 个对象已是最新，未写入 R2`);
      } else if (summary && summary.mode === 'wrangler') {
        toast(`发布完成：已上传 ${summary.added} 个对象（wrangler 回退路径）`);
      } else {
        toast(`${label}完成${result.count != null ? `：${result.count} 个对象` : ''}`);
      }
    } else toast(`${label}失败：${result.error}`, 'error');
  } catch (error) {
    log.textContent = error.message;
    toast(error.message, 'error');
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
    const info = await refreshHeader();
    const publishButton = document.getElementById('btn-publish');
    if (publishButton && info && !(info.credentials.s3 || info.credentials.wrangler)) publishButton.disabled = true;
  }
}

views.overview = async (view) => {
  const info = await api('/api/state');
  if (info.siteOrigin) state.siteOrigin = info.siteOrigin;
  const credentials = info.credentials.s3 ? 'S3 凭据已就绪（快速）' : info.credentials.wrangler ? 'wrangler 令牌已就绪（较慢）' : '未检测到发布凭据';
  view.innerHTML = `
    <h1>概览</h1>
    <p class="muted">内容目录：<code>${esc(info.contentRoot)}</code></p>
    <div class="cards">
      ${card(info.counts.posts, '文章')}
      ${card(info.counts.drafts, '草稿/未到期')}
      ${card(info.counts.assets, '媒体资源')}
      ${card(info.counts.downloads, '下载文件')}
      ${card(info.counts.trash, '回收站条目')}
    </div>
    <div class="panel">
      <h2 style="margin-top:0">内容集合</h2>
      <table class="list">
        <thead><tr><th>集合</th><th>状态</th><th>说明</th></tr></thead>
        <tbody>
          ${info.collections.map((item) => `<tr>
            <td>${esc(item.label)}</td>
            <td>${item.valid ? '<span class="badge ok">有效</span>' : '<span class="badge danger">校验失败</span>'}</td>
            <td class="muted">${esc(item.error || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="panel">
      <h2 style="margin-top:0">校验与发布</h2>
      <p class="muted">校验使用与 <code>pnpm content:check</code> 相同的管线；发布等价 <code>pnpm content:publish</code>，只处理人工内容，永不触碰 rankings/ 与 misc/。</p>
      <div class="row">
        <button class="btn" id="btn-validate">校验全部内容</button>
        <button class="btn primary" id="btn-publish" ${info.credentials.s3 || info.credentials.wrangler ? '' : 'disabled'}>发布到生产 R2</button>
        <span class="muted">${esc(credentials)}</span>
      </div>
      <div id="pipeline-log" class="log" style="margin-top:12px" hidden></div>
    </div>
    <div class="panel">
      <h2 style="margin-top:0">发布凭据（R2 令牌）</h2>
      <p class="muted">R2 API 令牌可以设置有效期；到期后在 Cloudflare 控制台新建令牌（Object Read &amp; Write，范围限 icaiming-content 桶），把新的 Access Key ID 与 Secret Access Key 粘贴到这里保存。凭据写入 <code>icaiming/.dev.vars</code>（已 gitignore，仅本机可读），当前管理页会话立即生效，往后由 <code>pnpm content:publish</code> 触发的发布同样使用新凭据。</p>
      <div class="grid-2">
        <label class="field"><span>Access Key ID（令牌 ID）</span><input id="cred-key" class="code" autocomplete="off" spellcheck="false" placeholder="${info.credentials.s3 ? '已配置 · 粘贴新值可替换' : '粘贴令牌 ID'}"></label>
        <label class="field"><span>Secret Access Key（令牌密钥）</span><input id="cred-secret" type="password" class="code" autocomplete="new-password" spellcheck="false" placeholder="${info.credentials.s3 ? '已配置 · 粘贴新值可替换' : '粘贴令牌密钥'}"></label>
      </div>
      <div class="row">
        <button class="btn primary" id="save-credentials">保存凭据</button>
        <span class="muted">${info.credentials.s3 ? 'S3 凭据已就绪' : info.credentials.wrangler ? '仅检测到 wrangler 回退令牌' : '尚未配置发布凭据'} · 保存在本机，不会显示已保存的值</span>
      </div>
    </div>
    <div class="panel">
      <h2 style="margin-top:0">本地站点</h2>
      ${info.siteRunning
        ? `<p>运行中：<a href="${esc(info.siteOrigin)}" target="_blank" rel="noreferrer">${esc(info.siteOrigin)}</a>（保存内容后片刻自动同步）</p>`
        : `<p class="muted">未运行。在 icaiming 目录执行 <code>pnpm dev</code> 后，本页保存的内容会自动同步到本地预览；发布到生产 R2 不受此影响。</p>`}
    </div>
  `;
  document.getElementById('btn-validate').onclick = () => runPipeline('/api/validate', '校验');
  document.getElementById('btn-publish').onclick = () => {
    if (!confirm('确定发布到生产 R2（icaiming-content 桶）？将先全量校验，再上传人工内容并清理清单内旧对象。')) return;
    runPipeline('/api/publish', '发布');
  };
  document.getElementById('save-credentials').onclick = async () => {
    const accessKeyId = document.getElementById('cred-key').value.trim();
    const secretAccessKey = document.getElementById('cred-secret').value.trim();
    if (!accessKeyId || !secretAccessKey) { toast('请同时填写令牌 ID 与令牌密钥', 'error'); return; }
    const result = await act(async () => {
      await api('/api/credentials', { json: { accessKeyId, secretAccessKey } });
      return true;
    });
    if (result) { markClean(); toast('凭据已保存到 .dev.vars，立即生效'); await views.overview(view); }
  };
};

function postRow(post) {
  const status = !post.valid ? '<span class="badge danger">校验失败</span>'
    : post.published ? '<span class="badge ok">已发布</span>'
    : post.meta.draft ? '<span class="badge warn">草稿</span>' : '<span class="badge warn">未来日期</span>';
  const title = post.valid ? esc(post.meta.title) : `<code>${esc(post.slug)}</code> <span class="muted">${esc(post.error || '')}</span>`;
  return `<tr>
    <td>${title}</td>
    <td><code>${esc(post.slug)}</code></td>
    <td>${post.valid ? esc(post.meta.date) : '-'}</td>
    <td>${post.valid ? esc(post.meta.tags.join('、')) : '-'}</td>
    <td>${status}</td>
    <td style="white-space:nowrap">
      <button class="btn small" data-post="${esc(post.slug)}" data-action="edit">编辑</button>
      <button class="btn small danger" data-post="${esc(post.slug)}" data-action="delete">删除</button>
    </td>
  </tr>`;
}

views.posts = async (view) => {
  const data = await api('/api/posts');
  view.innerHTML = `
    <div class="toolbar">
      <h1 style="margin:0">文章</h1>
      <div class="spacer"></div>
      <button class="btn primary" id="post-new">新建文章</button>
    </div>
    <p class="muted">草稿与未来日期的文章不会公开发布；删除会移入回收站。</p>
    <table class="list">
      <thead><tr><th>标题</th><th>slug</th><th>日期</th><th>标签</th><th>状态</th><th></th></tr></thead>
      <tbody>${data.posts.map(postRow).join('') || '<tr><td colspan="6" class="muted">暂无文章</td></tr>'}</tbody>
    </table>
  `;
  document.getElementById('post-new').onclick = () => openPostEditor(view, null);
  view.querySelectorAll('button[data-post]').forEach((button) => {
    button.onclick = () => {
      const slug = button.dataset.post;
      if (button.dataset.action === 'edit') { openPostEditor(view, slug); return; }
      act(async () => {
        if (!confirm(`将文章 ${slug} 移入回收站？`)) return;
        await api(`/api/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
        toast('已移入回收站');
        await views.posts(view);
      });
    };
  });
};

async function openPostEditor(view, slug) {
  const doc = slug ? await api(`/api/posts/${encodeURIComponent(slug)}`) : null;
  if (slug && doc.valid === false) { renderRawPost(view, slug, doc); return; }
  const isNew = !slug;
  const meta = doc?.meta ?? { title: '', description: '', date: new Date().toISOString().slice(0, 10), tags: [], draft: true };
  const body = doc?.body ?? '';
  view.innerHTML = `
    <div class="toolbar">
      <h1 style="margin:0">${isNew ? '新建文章' : `编辑：${esc(slug)}`}</h1>
      <div class="spacer"></div>
      <button class="btn" id="post-back">返回列表</button>
      <button class="btn primary" id="post-save">保存</button>
    </div>
    <div class="panel">
      <div class="grid-2">
        <label class="field"><span>slug（小写字母、数字、连字符；文件名即 URL）</span><input id="post-slug" class="code" value="${esc(slug || '')}" ${isNew ? '' : 'disabled'}></label>
        <label class="field"><span>日期</span><input id="post-date" type="date" value="${esc(meta.date)}"></label>
      </div>
      <label class="field"><span>标题</span><input id="post-title" value="${esc(meta.title)}"></label>
      <label class="field"><span>摘要</span><input id="post-description" value="${esc(meta.description)}"></label>
      <div class="grid-2">
        <label class="field"><span>标签（逗号分隔）</span><input id="post-tags" value="${esc(meta.tags.join(', '))}"></label>
        <label class="field"><span>草稿</span><input id="post-draft" type="checkbox" ${meta.draft ? 'checked' : ''} style="width:auto"></label>
      </div>
      <p class="hint">未来日期在到达 UTC 日期并再次同步前不会公开；保存时整批校验，无效内容不会写入。</p>
    </div>
    <div class="split">
      <div>
        <h2>正文（Markdown）</h2>
        <textarea id="post-body" class="code" style="min-height:420px">${esc(body)}</textarea>
      </div>
      <div>
        <h2>预览</h2>
        <div id="post-preview" class="preview"><p class="muted">输入正文后自动预览（服务端安全渲染）</p></div>
      </div>
    </div>
  `;
  document.getElementById('post-back').onclick = () => {
    if (!confirmLeave()) return;
    markClean();
    views.posts(view);
  };
  const bodyElement = document.getElementById('post-body');
  let previewTimer;
  const updatePreview = async () => {
    const target = document.getElementById('post-preview');
    try {
      const { html } = await api('/api/preview', { json: { body: bodyElement.value } });
      target.innerHTML = String(html).replaceAll('src="/', `src="${state.siteOrigin}/`);
    } catch (error) {
      target.innerHTML = `<p class="muted">预览失败：${esc(error.message)}</p>`;
    }
  };
  bodyElement.addEventListener('input', () => { clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 500); });
  updatePreview();
  document.getElementById('post-save').onclick = async () => {
    const payload = {
      meta: {
        title: val('post-title'),
        description: val('post-description'),
        date: document.getElementById('post-date').value,
        tags: parseTags(document.getElementById('post-tags').value),
        draft: document.getElementById('post-draft').checked,
      },
      body: bodyElement.value,
    };
    const result = await act(async () => {
      if (isNew) await api('/api/posts', { json: { slug: val('post-slug'), ...payload } });
      else await api(`/api/posts/${encodeURIComponent(slug)}`, { method: 'PUT', json: payload });
      return true;
    });
    if (result) { markClean(); toast('已保存'); await views.posts(view); }
  };
}

function renderRawPost(view, slug, doc) {
  view.innerHTML = `
    <div class="toolbar"><h1 style="margin:0">编辑（原始模式）：${esc(slug)}</h1><div class="spacer"></div>
      <button class="btn" id="post-back">返回列表</button><button class="btn primary" id="post-save">保存</button></div>
    <p class="badge danger">当前文件校验失败：${esc(doc.error)}</p>
    <textarea id="post-raw" class="code" style="min-height:480px">${esc(doc.raw)}</textarea>`;
  document.getElementById('post-back').onclick = () => {
    if (!confirmLeave()) return;
    markClean();
    views.posts(view);
  };
  document.getElementById('post-save').onclick = async () => {
    const result = await act(async () => {
      await api(`/api/posts/${encodeURIComponent(slug)}`, { method: 'PUT', json: { raw: document.getElementById('post-raw').value } });
      return true;
    });
    if (result) { markClean(); toast('已保存'); await views.posts(view); }
  };
}

function renderRawCollection(view, id, data) {
  view.innerHTML = `
    <div class="toolbar"><h1 style="margin:0">${esc(COLLECTION_LABELS[id] || id)}（原始 JSON）</h1><div class="spacer"></div><button class="btn primary" id="save-raw">保存</button></div>
    <p class="badge danger">当前文件校验失败：${esc(data.error)}</p>
    <textarea id="raw" class="code" style="min-height:420px">${esc(data.raw)}</textarea>`;
  document.getElementById('save-raw').onclick = async () => {
    const result = await act(async () => {
      await api(`/api/collections/${id}`, { method: 'PUT', json: { raw: document.getElementById('raw').value } });
      return true;
    });
    if (result) { toast('已保存'); await selectTab(state.tab); }
  };
}

async function renderItems(view, id) {
  const config = ITEM_FIELDS[id];
  const data = await api(`/api/collections/${id}`);
  if (!data.valid) { renderRawCollection(view, id, data); return; }
  if (id === 'downloads') {
    const media = await api('/api/media');
    state.mediaFiles = [...media.assets, ...media.downloads].map((file) => file.path);
  }
  view.innerHTML = `
    <div class="toolbar">
      <h1 style="margin:0">${esc(COLLECTION_LABELS[id])}</h1>
      <div class="spacer"></div>
      <button class="btn" id="add-item">添加条目</button>
      <button class="btn primary" id="save-items">保存</button>
    </div>
    <p class="muted">共 ${data.value.items.length} 条，顺序即前台展示顺序；修改后点击保存生效。</p>
    <div id="items"></div>
    <datalist id="media-files">${state.mediaFiles.map((path) => `<option value="${esc(path)}"></option>`).join('')}</datalist>
  `;
  const container = document.getElementById('items');
  const refreshMoveButtons = () => {
    const cards = [...container.querySelectorAll('[data-item]')];
    cards.forEach((card, index) => {
      card.querySelector('[data-move="up"]').disabled = index === 0;
      card.querySelector('[data-move="down"]').disabled = index === cards.length - 1;
    });
  };
  const addCard = (item = {}, options = {}) => {
    const element = document.createElement('div');
    element.className = 'item-card';
    element.dataset.item = '';
    element.innerHTML = config.map((field) => fieldHtml(field, item[field.key])).join('') +
      `<div class="row" style="justify-content:flex-end">
        <button class="btn small" data-move="up" aria-label="上移本条">上移</button>
        <button class="btn small" data-move="down" aria-label="下移本条">下移</button>
        <button class="btn small danger" data-remove aria-label="移出本条">删除</button>
      </div>`;
    container.appendChild(element);
    element.querySelector('[data-remove]').onclick = () => {
      element.remove();
      refreshMoveButtons();
      markDirty();
      toast('已移出列表，点击保存后生效');
    };
    element.querySelector('[data-move="up"]').onclick = () => {
      const previous = element.previousElementSibling;
      if (previous) {
        container.insertBefore(element, previous);
        refreshMoveButtons();
        markDirty();
      }
    };
    element.querySelector('[data-move="down"]').onclick = () => {
      const next = element.nextElementSibling;
      if (next) {
        container.insertBefore(next, element);
        refreshMoveButtons();
        markDirty();
      }
    };
    const uploadButton = element.querySelector('[data-file-upload]');
    if (uploadButton) {
      const fileInput = element.querySelector('[data-file-input]');
      uploadButton.onclick = () => fileInput.click();
      fileInput.onchange = async () => {
        const file = fileInput.files[0];
        if (!file) return;
        const result = await act(() => api(`/api/media/upload?folder=downloads&name=${encodeURIComponent(file.name)}`, { body: file, type: file.type || 'application/octet-stream' }));
        if (!result) return;
        element.querySelector('[data-key="file"]').value = result.path;
        const sizeField = element.querySelector('[data-key="size"]');
        if (sizeField && !sizeField.value.trim()) sizeField.value = fmtSize(result.size ?? 0);
        markDirty();
        toast(result.renamed ? `已上传并填入 ${result.path}（文件名已调整）` : `已上传并填入 ${result.path}`);
      };
    }
    if (options.focus) {
      element.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
      const firstInput = element.querySelector('input');
      if (firstInput) firstInput.focus({ preventScroll: true });
      if (!reducedMotion()) {
        element.classList.add('flash');
        setTimeout(() => element.classList.remove('flash'), 700);
      }
    }
  };
  data.value.items.forEach((item) => addCard(item));
  refreshMoveButtons();
  document.getElementById('add-item').onclick = () => addCard({}, { focus: true });
  document.getElementById('save-items').onclick = async () => {
    const issues = itemIssues(container, config);
    if (issues.length) {
      showIssues(container, issues);
      toast(`有 ${issues.length} 处需要修正，已在列表中标记`, 'error');
      return;
    }
    const items = [...container.querySelectorAll('[data-item]')].map((element) => {
      const item = {};
      for (const field of config) {
        const raw = element.querySelector(`[data-key="${field.key}"]`).value.trim();
        if (field.kind === 'tags') item.tags = parseTags(raw);
        else if ((field.key === 'size' || field.key === 'updated') && !raw) continue;
        else item[field.key] = raw;
      }
      return item;
    });
    try {
      await api(`/api/collections/${id}`, { method: 'PUT', json: { value: { items } } });
    } catch (error) {
      const mapped = mapServerIssues(error.message, container, config);
      if (mapped) {
        showIssues(container, mapped);
        toast(`有 ${mapped.length} 处需要修正，已定位到对应条目`, 'error');
      } else {
        toast(error.message, 'error');
      }
      return;
    }
    markClean();
    toast('已保存');
    await renderItems(view, id);
  };
}

views.resources = (view) => renderItems(view, 'resources');
views.downloads = (view) => renderItems(view, 'downloads');
views.projects = (view) => renderItems(view, 'projects');

views.profile = async (view) => {
  const [profile, home] = await Promise.all([api('/api/collections/profile'), api('/api/collections/home')]);
  if (!profile.valid) { renderRawCollection(view, 'profile', profile); return; }
  if (!home.valid) { renderRawCollection(view, 'home', home); return; }
  const profileValue = profile.value;
  const homeValue = home.value;
  const socialIds = ['github', 'bilibili', 'douyin', 'heybox'];
  const socialMap = Object.fromEntries((profileValue.socials || []).map((social) => [social.id, social]));
  view.innerHTML = `
    <h1>资料与首页</h1>
    <div class="panel">
      <h2 style="margin-top:0">个人资料 site/profile.json</h2>
      <div class="grid-2">
        <label class="field"><span>名字</span><input id="pf-name" value="${esc(profileValue.name)}"></label>
        <label class="field"><span>邮箱</span><input id="pf-email" value="${esc(profileValue.email)}"></label>
      </div>
      <label class="field"><span>一句话标语</span><input id="pf-tagline" value="${esc(profileValue.tagline)}"></label>
      <label class="field"><span>简介</span><textarea id="pf-bio">${esc(profileValue.bio)}</textarea></label>
      <h2>社交链接（链接留空则不展示）</h2>
      ${socialIds.map((id) => {
        const social = socialMap[id] || { label: id, url: '' };
        return `<div class="grid-2">
          <label class="field"><span>${id} 显示名</span><input data-social-label="${id}" value="${esc(social.label)}"></label>
          <label class="field"><span>${id} 链接</span><input data-social-url="${id}" value="${esc(social.url)}"></label>
        </div>`;
      }).join('')}
      <div class="row" style="justify-content:flex-end"><button class="btn primary" id="save-profile">保存资料</button></div>
    </div>
    <div class="panel">
      <h2 style="margin-top:0">首页文案 site/home.json</h2>
      <label class="field"><span>小标题 eyebrow</span><input id="hm-eyebrow" value="${esc(homeValue.eyebrow)}"></label>
      <label class="field"><span>引导文案</span><textarea id="hm-introduction">${esc(homeValue.introduction)}</textarea></label>
      <label class="field"><span>状态行</span><input id="hm-status" value="${esc(homeValue.status)}"></label>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" id="save-home">保存首页</button></div>
    </div>
  `;
  document.getElementById('save-profile').onclick = async () => {
    const value = {
      name: val('pf-name'),
      tagline: val('pf-tagline'),
      bio: val('pf-bio'),
      email: val('pf-email'),
      socials: socialIds.map((id) => {
        const url = document.querySelector(`[data-social-url="${id}"]`).value.trim();
        if (!url) return null;
        return { id, label: document.querySelector(`[data-social-label="${id}"]`).value.trim() || id, url };
      }).filter(Boolean),
    };
    const result = await act(async () => {
      await api('/api/collections/profile', { method: 'PUT', json: { value } });
      return true;
    });
    if (result) { markClean(); toast('资料已保存'); }
  };
  document.getElementById('save-home').onclick = async () => {
    const value = { eyebrow: val('hm-eyebrow'), introduction: val('hm-introduction'), status: val('hm-status') };
    const result = await act(async () => {
      await api('/api/collections/home', { method: 'PUT', json: { value } });
      return true;
    });
    if (result) { markClean(); toast('首页文案已保存'); }
  };
};

views.resume = async (view) => {
  const data = await api('/api/collections/resume');
  if (!data.valid) { renderRawCollection(view, 'resume', data); return; }
  const value = data.value;
  let pdf = value.pdf || null;
  view.innerHTML = `
    <h1>简历</h1>
    <div class="panel">
      <div class="grid-3">
        <label class="field"><span>姓名</span><input id="rs-name" value="${esc(value.name)}"></label>
        <label class="field"><span>标题</span><input id="rs-title" value="${esc(value.title)}"></label>
        <label class="field"><span>技能（逗号分隔）</span><input id="rs-skills" value="${esc((value.skills || []).join(', '))}"></label>
      </div>
      <label class="field"><span>概述</span><textarea id="rs-summary">${esc(value.summary)}</textarea></label>
      <div class="row">
        <span>PDF：<code id="rs-pdf">${esc(pdf || '未设置')}</code></span>
        <input type="file" id="rs-pdf-file" accept="application/pdf" hidden>
        <button class="btn" id="rs-pdf-upload">上传 PDF 并引用</button>
        <button class="btn" id="rs-pdf-clear">清除引用</button>
      </div>
      <p class="hint">PDF 保存到 resume/ 目录；保存简历后前台才开放下载。资料缺失时保持空数组即可。</p>
    </div>
    <div class="panel">
      <h2 style="margin-top:0">工作经历</h2>
      <div id="rs-exp"></div>
      <button class="btn" id="rs-exp-add">添加经历</button>
    </div>
    <div class="panel">
      <h2 style="margin-top:0">教育背景</h2>
      <div id="rs-edu"></div>
      <button class="btn" id="rs-edu-add">添加教育</button>
    </div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" id="rs-save">保存简历</button></div>
  `;
  const expContainer = document.getElementById('rs-exp');
  const eduContainer = document.getElementById('rs-edu');
  const addEntry = (container, entry = {}) => {
    const element = document.createElement('div');
    element.className = 'item-card';
    element.dataset.item = '';
    element.innerHTML = `
      <div class="grid-2">
        <label class="field"><span>职位 / 学位</span><input data-key="title" value="${esc(entry.title || '')}"></label>
        <label class="field"><span>组织 / 学校</span><input data-key="organization" value="${esc(entry.organization || '')}"></label>
      </div>
      <div class="grid-2">
        <label class="field"><span>时间</span><input data-key="period" value="${esc(entry.period || '')}"></label>
        <label class="field"><span>描述</span><input data-key="description" value="${esc(entry.description || '')}"></label>
      </div>
      <div class="row" style="justify-content:flex-end"><button class="btn small danger" data-remove>删除</button></div>`;
    element.querySelector('[data-remove]').onclick = () => element.remove();
    container.appendChild(element);
  };
  (value.experience || []).forEach((entry) => addEntry(expContainer, entry));
  (value.education || []).forEach((entry) => addEntry(eduContainer, entry));
  document.getElementById('rs-exp-add').onclick = () => addEntry(expContainer);
  document.getElementById('rs-edu-add').onclick = () => addEntry(eduContainer);
  document.getElementById('rs-pdf-upload').onclick = () => document.getElementById('rs-pdf-file').click();
  document.getElementById('rs-pdf-file').onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const result = await act(() => api(`/api/media/upload?folder=resume&name=${encodeURIComponent(file.name)}`, { body: file, type: 'application/pdf' }));
    if (result) {
      pdf = result.path;
      document.getElementById('rs-pdf').textContent = pdf;
      toast(result.renamed ? `已上传并引用 ${result.name}` : 'PDF 已上传，点击保存后生效');
    }
  };
  document.getElementById('rs-pdf-clear').onclick = () => {
    pdf = null;
    document.getElementById('rs-pdf').textContent = '未设置';
    toast('已清除引用，保存后生效');
  };
  document.getElementById('rs-save').onclick = async () => {
    const collect = (container) => [...container.querySelectorAll('[data-item]')].map((element) => ({
      title: element.querySelector('[data-key="title"]').value.trim(),
      organization: element.querySelector('[data-key="organization"]').value.trim(),
      period: element.querySelector('[data-key="period"]').value.trim(),
      description: element.querySelector('[data-key="description"]').value.trim(),
    }));
    const result = await act(async () => {
      await api('/api/collections/resume', { method: 'PUT', json: { value: {
        name: val('rs-name'),
        title: val('rs-title'),
        summary: document.getElementById('rs-summary').value.trim(),
        skills: parseTags(document.getElementById('rs-skills').value),
        experience: collect(expContainer),
        education: collect(eduContainer),
        pdf,
      } } });
      return true;
    });
    if (result) { markClean(); toast('简历已保存'); }
  };
};

function fileRow(file) {
  const refs = (file.refs || []).map((ref) => `<span class="badge">${esc(ref)}</span>`).join('');
  return `<div class="file-row">
    <span class="path">${esc(file.path)}</span>
    <span class="meta">${fmtSize(file.size)}</span>
    <span class="refs">${refs || '<span class="badge">未被引用</span>'}</span>
    <button class="btn small" data-copy="${esc(file.path)}">复制链接</button>
    <button class="btn small danger" data-delete="${esc(file.path)}">删除</button>
  </div>`;
}

views.media = async (view) => {
  const media = await api('/api/media');
  const folders = ['assets/images', 'assets/icons', 'assets/brand', 'assets/lottie', 'assets/models', 'downloads', 'resume'];
  const all = [...media.assets, ...media.downloads, ...media.resume];
  view.innerHTML = `
    <div class="toolbar">
      <h1 style="margin:0">媒体库</h1>
      <div class="spacer"></div>
      <select id="upload-folder" style="width:auto" data-no-dirty>${folders.map((folder) => `<option>${esc(folder)}</option>`).join('')}</select>
      <input type="file" id="upload-input" multiple hidden data-no-dirty>
      <button class="btn primary" id="upload-btn">上传文件</button>
    </div>
    <p class="muted">文件名会转成 ASCII 安全名称（重名自动加序号，中文名会得到提示性结果）；删除会进入回收站，被引用的文件删除前会提醒。</p>
    <h2>assets/（${media.assets.length}）</h2>
    <div class="file-list">${media.assets.map(fileRow).join('') || '<p class="muted">空</p>'}</div>
    <h2>downloads/（${media.downloads.length}）</h2>
    <div class="file-list">${media.downloads.map(fileRow).join('') || '<p class="muted">空</p>'}</div>
    <h2>resume/（${media.resume.length}）</h2>
    <div class="file-list">${media.resume.map(fileRow).join('') || '<p class="muted">空</p>'}</div>
  `;
  document.getElementById('upload-btn').onclick = () => document.getElementById('upload-input').click();
  document.getElementById('upload-input').onchange = async (event) => {
    const folder = document.getElementById('upload-folder').value;
    const files = [...event.target.files];
    let uploaded = 0;
    let renamed = 0;
    for (const file of files) {
      const result = await act(() => api(`/api/media/upload?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(file.name)}`, { body: file, type: file.type || 'application/octet-stream' }));
      if (result) { uploaded += 1; if (result.renamed) renamed += 1; }
    }
    if (uploaded) toast(`已上传 ${uploaded} 个文件${renamed ? `，${renamed} 个已重命名` : ''}`);
    await views.media(view);
  };
  view.querySelectorAll('[data-copy]').forEach((button) => {
    button.onclick = () => navigator.clipboard.writeText(`/media/${button.dataset.copy}`)
      .then(() => toast('已复制媒体链接（可直接粘贴进 Markdown）'))
      .catch(() => toast('复制失败，请手动复制', 'error'));
  });
  view.querySelectorAll('[data-delete]').forEach((button) => {
    button.onclick = () => {
      const file = all.find((entry) => entry.path === button.dataset.delete);
      const refs = file?.refs || [];
      const message = refs.length
        ? `${button.dataset.delete} 仍被以下内容引用：\n${refs.join('\n')}\n\n仍要移入回收站吗？`
        : `将 ${button.dataset.delete} 移入回收站？`;
      if (!confirm(message)) return;
      act(async () => {
        await api(`/api/media?path=${encodeURIComponent(button.dataset.delete)}`, { method: 'DELETE' });
        toast('已移入回收站');
        await views.media(view);
      });
    };
  });
};

views.trash = async (view) => {
  const data = await api('/api/trash');
  view.innerHTML = `
    <h1>回收站</h1>
    <p class="muted">删除的内容会保留在 icaiming-content/.trash/（不参与同步与发布），可随时恢复或彻底删除。</p>
    <div class="file-list">
      ${data.entries.map((entry) => `<div class="file-row">
        <span class="path">${esc(entry.path)}</span>
        <span class="meta">${fmtSize(entry.size)} · ${fmtTime(entry.mtime)}</span>
        <button class="btn small" data-restore="${esc(entry.path)}">恢复</button>
        <button class="btn small danger" data-purge="${esc(entry.path)}">彻底删除</button>
      </div>`).join('') || '<p class="muted">回收站是空的。</p>'}
    </div>
  `;
  view.querySelectorAll('[data-restore]').forEach((button) => {
    button.onclick = () => act(async () => {
      await api('/api/trash/restore', { json: { path: button.dataset.restore } });
      toast('已恢复');
      await views.trash(view);
    });
  });
  view.querySelectorAll('[data-purge]').forEach((button) => {
    button.onclick = () => {
      if (!confirm(`彻底删除 ${button.dataset.purge}？此操作不可恢复。`)) return;
      act(async () => {
        await api(`/api/trash?path=${encodeURIComponent(button.dataset.purge)}`, { method: 'DELETE' });
        toast('已彻底删除');
        await views.trash(view);
      });
    };
  });
};

async function boot() {
  renderTabs();
  const syncTopbarHeight = () => {
    const height = document.querySelector('.topbar')?.offsetHeight ?? 56;
    document.documentElement.style.setProperty('--topbar-h', `${height}px`);
  };
  syncTopbarHeight();
  window.addEventListener('resize', syncTopbarHeight);
  const viewElement = document.getElementById('view');
  const handleDirty = (event) => {
    if (event.target.closest?.('[data-no-dirty]')) return;
    markDirty();
  };
  viewElement.addEventListener('input', handleDirty);
  viewElement.addEventListener('change', handleDirty);
  window.addEventListener('beforeunload', (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  await refreshHeader();
  await selectTab('overview');
  setInterval(refreshHeader, 20000);
}

boot();