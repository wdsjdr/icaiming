import { mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ZodTypeAny } from 'zod';
import {
  downloadsSchema, homeSchema, isPublished, parsePost, profileSchema, projectsSchema,
  resourcesSchema, resumeSchema, slugPattern, type Post,
} from '../../src/lib/content';

export const defaultContentRoot = fileURLToPath(new URL('../../../icaiming-content/', import.meta.url));

export class AdminError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const collections = {
  profile: { file: 'site/profile.json', schema: profileSchema, label: '个人资料' },
  home: { file: 'site/home.json', schema: homeSchema, label: '首页' },
  projects: { file: 'projects/index.json', schema: projectsSchema, label: '项目' },
  resources: { file: 'resources/index.json', schema: resourcesSchema, label: '资源收藏' },
  downloads: { file: 'downloads/index.json', schema: downloadsSchema, label: '下载清单' },
  resume: { file: 'resume/resume.json', schema: resumeSchema, label: '简历' },
} satisfies Record<string, { file: string; schema: ZodTypeAny; label: string }>;

export type CollectionId = keyof typeof collections;

const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const segmentPattern = /^[A-Za-z0-9._-]+$/;
export const uploadExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'ico', 'pdf', 'zip', '7z', 'txt', 'md']);

export interface MediaEntry { path: string; size: number; mtime: string; refs?: string[] }
export interface TrashEntry { path: string; size: number; mtime: string }
export interface RefCorpus { label: string; text: string }

export async function exists(path: string) {
  return stat(path).then(() => true).catch(() => false);
}

export function describeError(error: unknown): string {
  if (error instanceof AdminError) return error.message;
  if (error instanceof Error) {
    try {
      const issues = JSON.parse(error.message) as { path?: (string | number)[]; message?: string }[];
      if (Array.isArray(issues) && issues.length && issues.every((issue) => issue && typeof issue.message === 'string')) {
        return issues.map((issue) => `${(issue.path ?? []).join('.') || '内容'}: ${issue.message}`).join('；');
      }
    } catch {
      /* 非 zod 错误 */
    }
    return error.message;
  }
  return String(error);
}

function safeSegments(rel: string): string[] {
  const normalized = rel.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) throw new AdminError(400, `路径不合法：${rel}`);
  const segments = normalized.split('/');
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') throw new AdminError(400, `路径不合法：${rel}`);
    if (segment.startsWith('.') || !segmentPattern.test(segment) || reservedNames.test(segment.split('.')[0])) {
      throw new AdminError(400, `路径不合法：${rel}`);
    }
  }
  return segments;
}

export function resolveUnder(root: string, rel: string): string {
  return resolve(root, ...safeSegments(rel));
}

export function assertMediaPath(rel: string) {
  const segments = safeSegments(rel);
  const prefix = segments[0];
  if (prefix === 'assets' || prefix === 'downloads') return;
  if (prefix === 'resume' && segments.length === 2 && /\.pdf$/i.test(segments[1])) return;
  throw new AdminError(400, '不允许操作该路径');
}

export function sanitizeUploadName(input: string): string {
  const raw = input.trim().replace(/\\/g, '/');
  const file = raw.split('/').pop() ?? '';
  const dot = file.lastIndexOf('.');
  const ext = dot > 0 ? file.slice(dot).toLowerCase() : '';
  let base = dot > 0 ? file.slice(0, dot) : file;
  base = base.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  if (!base) base = `file-${Date.now().toString(36)}`;
  if (reservedNames.test(base)) base = `file-${base}`;
  const cleanExt = ext.replace(/[^a-z0-9.]/g, '').replace(/\.{2,}/g, '.');
  return `${base}${cleanExt}`;
}

export async function resolveUploadTarget(root: string, folder: string, name: string) {
  const clean = folder.replace(/\\/g, '/').replace(/\/+$/, '');
  const allowed = clean === 'resume' || clean === 'assets' || clean.startsWith('assets/')
    || clean === 'downloads' || clean.startsWith('downloads/');
  if (!allowed || clean.startsWith('resume/')) throw new AdminError(400, '不允许上传到该目录');
  resolveUnder(root, clean);
  let finalName = sanitizeUploadName(name);
  if (!finalName) throw new AdminError(400, '文件名不合法');
  const ext = extname(finalName).toLowerCase();
  if (clean === 'resume') {
    if (ext !== '.pdf') throw new AdminError(400, '简历目录只允许上传 PDF 文件');
    const stem = finalName.slice(0, -ext.length).replace(/\./g, '-') || 'resume';
    finalName = `${stem}.pdf`;
  } else {
    const kind = ext.slice(1);
    if (!kind || !uploadExtensions.has(kind)) throw new AdminError(400, `不支持的文件类型：${kind || '未知'}`);
  }
  const dirAbs = resolve(root, clean);
  const finalExt = extname(finalName);
  const stem = finalName.slice(0, finalName.length - finalExt.length);
  let candidate = finalName;
  let index = 1;
  while (await exists(join(dirAbs, candidate))) {
    index += 1;
    if (index > 99) throw new AdminError(409, '同名文件过多，请重命名后再上传');
    candidate = `${stem}-${index}${finalExt}`;
  }
  return { rel: `${clean}/${candidate}`, abs: join(dirAbs, candidate), finalName: candidate, renamed: candidate !== name };
}

export async function atomicWrite(abs: string, data: string | Buffer) {
  await mkdir(dirname(abs), { recursive: true });
  const tmp = join(dirname(abs), `.tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  await writeFile(tmp, data);
  try {
    await rename(tmp, abs);
  } catch {
    await new Promise((done) => setTimeout(done, 120));
    try {
      await rename(tmp, abs);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
  }
}

export function trashRoot(root: string) {
  return join(root, '.trash');
}

export function normalizeCredential(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new AdminError(400, `请填写${label}`);
  if (text.length > 256) throw new AdminError(400, `${label} 长度超出预期`);
  if (/\s/.test(text)) throw new AdminError(400, `${label} 不能包含空白或换行，请检查是否多粘贴了内容`);
  return text;
}

export async function updateEnvFile(envPath: string, updates: Record<string, string>) {
  const text = await readFile(envPath, 'utf8').catch(() => '');
  const lines = text ? text.split(/\r?\n/) : [];
  const seen = new Set<string>();
  const output = lines.map((line) => {
    const key = /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=/.exec(line)?.[1];
    if (key && key in updates) {
      seen.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) output.push(`${key}=${value}`);
  }
  while (output.length && !output[output.length - 1].trim()) output.pop();
  await atomicWrite(envPath, `${output.join('\n')}\n`);
}

export async function moveToTrash(root: string, rel: string) {
  const segments = safeSegments(rel);
  const source = resolve(root, ...segments);
  if (!(await exists(source))) throw new AdminError(404, '文件不存在');
  const name = segments[segments.length - 1];
  const ext = extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  const destDir = join(trashRoot(root), ...segments.slice(0, -1));
  let candidate = name;
  let index = 1;
  while (await exists(join(destDir, candidate))) {
    index += 1;
    candidate = `${stem}-${index}${ext}`;
  }
  await mkdir(destDir, { recursive: true });
  await rename(source, join(destDir, candidate));
  return { path: [...segments.slice(0, -1), candidate].join('/') };
}

export async function restoreFromTrash(root: string, rel: string) {
  const segments = safeSegments(rel);
  const source = join(trashRoot(root), ...segments);
  const dest = resolve(root, ...segments);
  if (!(await exists(source))) throw new AdminError(404, '回收站中不存在该条目');
  if (await exists(dest)) throw new AdminError(409, '目标位置已存在同名文件');
  await mkdir(dirname(dest), { recursive: true });
  await rename(source, dest);
  await pruneEmptyDirs(dirname(source), trashRoot(root));
  return { path: segments.join('/') };
}

export async function purgeTrash(root: string, rel: string) {
  const segments = safeSegments(rel);
  const target = join(trashRoot(root), ...segments);
  if (!(await exists(target))) throw new AdminError(404, '回收站中不存在该条目');
  await rm(target, { force: true });
  await pruneEmptyDirs(dirname(target), trashRoot(root));
}

async function pruneEmptyDirs(start: string, stop: string) {
  let dir = start;
  while (dir !== stop && dir.startsWith(stop)) {
    const entries = await readdir(dir).catch(() => null);
    if (!entries || entries.length) return;
    await rmdir(dir).catch(() => undefined);
    dir = dirname(dir);
  }
}

async function walk(dir: string, prefix: string, out: MediaEntry[]) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(join(dir, entry.name), path, out);
    else if (entry.isFile()) {
      const info = await stat(join(dir, entry.name));
      out.push({ path, size: info.size, mtime: info.mtime.toISOString() });
    }
  }
}

export async function walkFiles(root: string, rel: string): Promise<MediaEntry[]> {
  const out: MediaEntry[] = [];
  await walk(join(root, ...safeSegments(rel)), rel, out);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

export async function listTrash(root: string): Promise<TrashEntry[]> {
  const out: MediaEntry[] = [];
  await walk(trashRoot(root), '', out);
  out.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return out;
}

export async function listMedia(root: string) {
  const [assets, downloads, resumeAll] = await Promise.all([
    walkFiles(root, 'assets'), walkFiles(root, 'downloads'), walkFiles(root, 'resume'),
  ]);
  return { assets, downloads, resume: resumeAll.filter((file) => /\.pdf$/i.test(file.path)) };
}

export async function buildReferenceCorpus(root: string): Promise<RefCorpus[]> {
  const corpus: RefCorpus[] = [];
  const postsDir = join(root, 'posts');
  for (const name of await readdir(postsDir).catch(() => [] as string[])) {
    if (!name.endsWith('.md') || name.startsWith('.')) continue;
    corpus.push({ label: `posts/${name}`, text: await readFile(join(postsDir, name), 'utf8').catch(() => '') });
  }
  for (const [id, def] of Object.entries(collections)) {
    if (!(id in collections)) continue;
    const text = await readFile(join(root, def.file), 'utf8').catch(() => '');
    if (text) corpus.push({ label: def.file, text });
  }
  return corpus;
}

export function referencesFor(corpus: RefCorpus[], rel: string): string[] {
  const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![\\w.-])${escaped}(?![\\w.-])`);
  return corpus.filter((source) => pattern.test(source.text)).map((source) => source.label);
}

export interface PostSummary {
  slug: string; valid: boolean; error?: string; published?: boolean; meta?: Post; mtime: string;
}

export async function listPosts(root: string): Promise<PostSummary[]> {
  const dir = join(root, 'posts');
  const names = (await readdir(dir).catch(() => [] as string[])).filter((name) => name.endsWith('.md') && !name.startsWith('.'));
  const posts: PostSummary[] = [];
  for (const name of names) {
    const slug = name.slice(0, -3);
    const abs = join(dir, name);
    const mtime = (await stat(abs)).mtime.toISOString();
    try {
      const raw = await readFile(abs, 'utf8');
      const { meta } = parsePost(raw, slug);
      posts.push({ slug, valid: true, published: isPublished(meta), meta, mtime });
    } catch (error) {
      posts.push({ slug, valid: false, error: describeError(error), mtime });
    }
  }
  posts.sort((a, b) => (b.meta?.date ?? '').localeCompare(a.meta?.date ?? '') || a.slug.localeCompare(b.slug));
  return posts;
}

export async function readPostFile(root: string, slug: string) {
  if (!slugPattern.test(slug)) throw new AdminError(400, 'slug 不合法');
  const abs = join(root, 'posts', `${slug}.md`);
  const raw = await readFile(abs, 'utf8').catch(() => {
    throw new AdminError(404, '文章不存在');
  });
  try {
    const { meta, body } = parsePost(raw, slug);
    return { raw, meta, body, valid: true as const };
  } catch (error) {
    return { raw, valid: false as const, error: describeError(error) };
  }
}

export interface PostMetaInput { title: string; description: string; date: string; tags: string[]; draft: boolean }

export function buildPostRaw(meta: PostMetaInput, body: string) {
  const frontmatter = [
    `title: ${JSON.stringify(meta.title)}`,
    `description: ${JSON.stringify(meta.description)}`,
    `date: "${meta.date}"`,
    `tags: [${meta.tags.map((tag) => JSON.stringify(tag)).join(', ')}]`,
    `draft: ${meta.draft ? 'true' : 'false'}`,
  ].join('\n');
  return `---\n${frontmatter}\n---\n\n${body.trim()}\n`;
}

export async function createPost(root: string, slug: string, raw: string) {
  if (!slugPattern.test(slug)) throw new AdminError(400, 'slug 需为小写字母、数字和单个连字符');
  const abs = join(root, 'posts', `${slug}.md`);
  if (await exists(abs)) throw new AdminError(409, '同名文章已存在');
  parsePost(raw, slug);
  await atomicWrite(abs, raw.endsWith('\n') ? raw : `${raw}\n`);
}

export async function writePost(root: string, slug: string, raw: string) {
  if (!slugPattern.test(slug)) throw new AdminError(400, 'slug 不合法');
  parsePost(raw, slug);
  await atomicWrite(join(root, 'posts', `${slug}.md`), raw.endsWith('\n') ? raw : `${raw}\n`);
}

export async function readCollection(root: string, id: string) {
  const def = (collections as Record<string, { file: string; schema: ZodTypeAny; label: string }>)[id];
  if (!def) throw new AdminError(404, '未知集合');
  const raw = await readFile(join(root, def.file), 'utf8').catch(() => {
    throw new AdminError(404, `内容文件不存在：${def.file}`);
  });
  try {
    const value = def.schema.parse(JSON.parse(raw));
    return { raw, value, valid: true as const };
  } catch (error) {
    return { raw, valid: false as const, error: describeError(error) };
  }
}

export async function validateCollection(root: string, id: string, value: unknown) {
  const def = (collections as Record<string, { file: string; schema: ZodTypeAny; label: string }>)[id];
  if (!def) throw new AdminError(404, '未知集合');
  const parsed = def.schema.parse(value) as { items?: { file: string }[]; pdf?: string | null };
  if (id === 'downloads') {
    for (const item of parsed.items ?? []) {
      if (!(await exists(resolveUnder(root, item.file)))) throw new AdminError(400, `下载文件不存在：${item.file}`);
    }
  }
  if (id === 'resume' && parsed.pdf && !(await exists(resolveUnder(root, parsed.pdf)))) {
    throw new AdminError(400, `简历 PDF 不存在：${parsed.pdf}`);
  }
  return parsed;
}

export async function writeCollectionValue(root: string, id: string, value: unknown) {
  const parsed = await validateCollection(root, id, value);
  const def = (collections as Record<string, { file: string }>)[id];
  await atomicWrite(join(root, def.file), `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

export async function writeCollection(root: string, id: string, raw: string) {
  const def = (collections as Record<string, { file: string }>)[id];
  if (!def) throw new AdminError(404, '未知集合');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new AdminError(400, `JSON 解析失败：${(error as Error).message}`);
  }
  await validateCollection(root, id, parsed);
  await atomicWrite(join(root, def.file), raw.endsWith('\n') ? raw : `${raw}\n`);
}