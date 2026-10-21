// Local files only: never syncs R2, reads credentials, or changes a manifest.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assets, assetPath, type AssetId } from '../../src/lib/pet/assets';
import { petMediaPrefix } from '../../src/lib/pet/media';
import { readAsset } from './local';

const root = fileURLToPath(new URL('../../../icaiming-content/', import.meta.url));
export async function stagePet() {
  // Check every source and every existing destination before writing anything.
  const entries = await Promise.all((Object.keys(assets) as AssetId[]).map(async (id) => {
    const body = await readAsset(id);
    const key = `${petMediaPrefix}${assetPath(id)}`;
    const path = resolve(root, key);
    const existing = await readFile(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (existing && !existing.equals(body)) throw new Error(`Refusing to overwrite differing pet media: ${key}`);
    return { id, key, path, body, existing };
  }));
  for (const entry of entries) {
    if (!entry.existing) {
      await mkdir(dirname(entry.path), { recursive: true });
      await writeFile(entry.path, entry.body, { flag: 'wx' });
    }
    const saved = await readFile(entry.path);
    if (!saved.equals(entry.body)) throw new Error(`Staged pet verification failed: ${entry.key}`);
    console.log(JSON.stringify({ id: entry.id, key: entry.key, bytes: saved.length, sha256: createHash('sha256').update(saved).digest('hex'), action: entry.existing ? 'verified-existing' : 'copied' }));
  }
  console.log(`[pet] ${entries.length} files, ${entries.reduce((sum, entry) => sum + entry.body.length, 0)} bytes staged in ${root}; no remote operations.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await stagePet();
