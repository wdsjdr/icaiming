import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Miniflare } from 'miniflare';
import type { AstroIntegration } from 'astro';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { assets, assetPath, type AssetId } from '../../src/lib/pet/assets';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoot = resolve(root, '../资源/dsh-pet-0.3.7/dsh-pet/assets/webm');
const sourceNames: Record<AssetId, string> = {
  idle: '待机呼吸休闲.webm', walk: '螃蟹走路.webm', stretch: '超大伸懒腰.webm',
  yawn: '哈欠连天.webm', wave: '点击回应-元气挥手.webm', sulk: '点击回应-傲娇生气.webm', laugh: '点击回应-挠痒咯咯笑.webm',
};
export const localPrefix = '/media/assets/pet/local/';
export function localAssetId(path: string): AssetId | undefined {
  return (Object.keys(assets) as AssetId[]).find((id) => path === `${localPrefix}${assetPath(id)}`);
}
export async function readAsset(id: AssetId) {
  const body = await readFile(resolve(sourceRoot, sourceNames[id]));
  if (body.byteLength !== assets[id].bytes || createHash('sha256').update(body).digest('hex') !== assets[id].sha256) {
    throw new Error(`Pet source integrity mismatch: ${id}`);
  }
  return body;
}

// Local Miniflare persistence only. This module never reads credentials or contacts R2.
export async function seedPet() {
  const path = resolve(root, '.wrangler/state/v3/r2');
  const entries = await Promise.all((Object.keys(assets) as AssetId[]).map(async (id) => [id, await readAsset(id)] as const));
  await mkdir(path, { recursive: true });
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("local pet"); } }',
    r2Buckets: { CONTENT_BUCKET: 'icaiming-content' }, r2Persist: path });
  try {
    const bucket = await mf.getR2Bucket('CONTENT_BUCKET');
    const keys: string[] = [];
    for (const [id, body] of entries) {
      const key = `assets/pet/local/${assetPath(id)}`;
      keys.push(key);
      await bucket.put(key, new Uint8Array(body), { httpMetadata: { contentType: 'video/webm' } });
    }
    // Deliberately separate from the content importer's cleanup manifest.
    await bucket.put('_local/pet-manifest.json', JSON.stringify(keys));
    console.log(`[pet] Seeded ${entries.length} allowlisted clips (${entries.reduce((n, [, b]) => n + b.length, 0)} bytes) into local R2 only.`);
  } finally { await mf.dispose(); }
}

export function petLocalIntegration(): AstroIntegration {
  return {
    name: 'pet-local-allowlist',
    hooks: { 'astro:server:setup': ({ server }) => {
      server.middlewares.use(localMedia);
    } },
  };
}
export function localMedia(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const path = (req.url ?? '').split('?')[0];
  if (!path.startsWith(localPrefix)) return next();
  const id = localAssetId(path);
  if (!id) { res.statusCode = 404; res.end(); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end(); return; }
  // Complete small files (200) are intentional; the runtime fetches a full blob, not video ranges.
  void readAsset(id).then((body) => {
    res.setHeader('Content-Type', 'video/webm'); res.setHeader('Content-Length', body.length);
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(req.method === 'HEAD' ? undefined : body);
  }).catch(() => { res.statusCode = 404; res.end('Local pet source unavailable'); });
}
