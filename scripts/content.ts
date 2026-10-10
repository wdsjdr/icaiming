import { readFile, readdir, writeFile, stat, mkdir } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { z } from 'zod';
import { parsePost, isPublished, profileSchema, homeSchema, projectsSchema, resourcesSchema, resumeSchema, type Post } from '../src/lib/content';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const contentRoot = resolve(root, '../icaiming-content');
// Wrangler appends /v3 to --persist-to; Miniflare needs the complete R2 path.
export const persist = resolve(root, '.wrangler/state');
const r2Path = resolve(persist, 'v3/r2');

export async function prepareContent() {
  const objects = new Map<string, string | Buffer>();
  const schemas = {
    'site/profile.json': profileSchema, 'site/home.json': homeSchema,
    'projects/index.json': projectsSchema, 'resources/index.json': resourcesSchema,
    'resume/resume.json': resumeSchema,
  };
  for (const [key, schema] of Object.entries(schemas)) {
    const data = schema.parse(JSON.parse(await readFile(resolve(contentRoot, key), 'utf8')));
    objects.set(key, JSON.stringify(data));
  }
  const posts: Post[] = [];
  for (const name of (await readdir(resolve(contentRoot, 'posts'))).sort()) {
    if (!name.endsWith('.md')) continue;
    const raw = await readFile(resolve(contentRoot, 'posts', name), 'utf8');
    const { meta } = parsePost(raw, name.slice(0, -3));
    if (!isPublished(meta)) continue;
    posts.push(meta);
    objects.set(`posts/${name}`, raw);
  }
  posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  async function assets(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await assets(path);
      else objects.set(relative(contentRoot, path).replaceAll('\\', '/'), await readFile(path));
    }
  }
  await assets(resolve(contentRoot, 'assets'));
  const resume = resumeSchema.parse(JSON.parse(String(objects.get('resume/resume.json'))));
  if (resume.pdf) {
    await stat(resolve(contentRoot, resume.pdf));
    objects.set(resume.pdf, await readFile(resolve(contentRoot, resume.pdf)));
  }
  objects.set('posts/index.json', JSON.stringify({ posts }, null, 2) + '\n');
  return objects;
}

export async function syncContent() {
  const objects = await prepareContent(); // Validate everything before changing the bucket.
  await mkdir(r2Path, { recursive: true });
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("local content"); } }',
    r2Buckets: { CONTENT_BUCKET: 'ic-aiming-content' }, r2Persist: r2Path,
  });
  const types: Record<string, string> = { '.json': 'application/json', '.md': 'text/markdown', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
  try {
    const bucket = await mf.getR2Bucket('CONTENT_BUCKET');
    const previous = await bucket.get('_local/manifest.json');
    const oldKeys = previous ? z.array(z.string()).parse(await previous.json()) : [];
    for (const [key, body] of objects) {
      // Miniflare's cross-runtime bridge accepts Web typed arrays, not Node Buffer.
      await bucket.put(key, typeof body === 'string' ? body : new Uint8Array(body), { httpMetadata: { contentType: `${types[extname(key)] ?? 'application/octet-stream'}` } });
    }
    // Only remove objects previously managed by this local content importer.
    for (const key of oldKeys) if (!objects.has(key)) await bucket.delete(key);
    await bucket.put('_local/manifest.json', JSON.stringify([...objects.keys()]));
    const index = String(objects.get('posts/index.json'));
    const indexPath = resolve(contentRoot, 'posts/index.json');
    if (await readFile(indexPath, 'utf8').catch(() => '') !== index) await writeFile(indexPath, index);
    console.log(`[content] 已同步 ${objects.size} 个对象到本地 R2（无需重建页面）`);
  } finally { await mf.dispose(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const objects = await prepareContent();
    console.log(`[content] 校验通过：${objects.size} 个对象`);
  } else await syncContent();
}
