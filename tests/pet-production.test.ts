import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assets, assetPath, type AssetId } from '../src/lib/pet/assets';
import { petConfig } from '../src/lib/pet/config';

const base = 'https://assets.icaiming.cn/assets/pet/v0.3.7-web-2';
const root = new URL('../', import.meta.url);

test('checked-in production env contains only the exact public v2 asset base', async () => {
  const source = await readFile(new URL('.env.production', root), 'utf8');
  assert.equal(source.trim(), `PUBLIC_PET_ASSET_BASE_URL=${base}`);
  const config = petConfig({ base: source.trim().split('=')[1] });
  assert.equal(config.enabled, true);
  assert.deepEqual(config.urls, Object.fromEntries((Object.keys(assets) as AssetId[])
    .map((id) => [id, `${base}/${assetPath(id)}`])));
  assert.ok(!JSON.stringify(config).includes('/local/'));
});

test('only production public env is allowlisted; other env files remain ignored', async () => {
  const lines = (await readFile(new URL('.gitignore', root), 'utf8')).split(/\r?\n/);
  assert.ok(lines.includes('.env'));
  assert.ok(lines.includes('.env.*'));
  assert.ok(lines.indexOf('!.env.production') > lines.indexOf('.env.*'));
  assert.deepEqual(lines.filter((line) => line.startsWith('!.env')), ['!.env.production']);
});

test('production integration retains explicit local development and public base selection', async () => {
  const component = await readFile(new URL('src/components/SitePet.astro', root), 'utf8');
  assert.ok(component.includes("local: process.env.SITE_PET_LOCAL === '1'"));
  assert.ok(component.includes('base: import.meta.env.PUBLIC_PET_ASSET_BASE_URL'));
  // The committed file supplies production's default; the pure helper still disables an absent base.
  assert.deepEqual(petConfig({}), { enabled: false, urls: {} });
  assert.ok(petConfig({ local: true, base }).urls.idle?.startsWith('/media/assets/pet/local/'));
});
