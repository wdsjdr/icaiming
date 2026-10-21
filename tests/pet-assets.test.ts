import test from 'node:test';
import assert from 'node:assert/strict';
import { assets, assetPath, type AssetId } from '../src/lib/pet/assets';
import { petConfig } from '../src/lib/pet/config';
import { localAssetId, localPrefix, readAsset, petLocalIntegration } from '../scripts/pet/local';

test('seven audited allowlisted sources match bytes and SHA256', async () => {
  assert.equal(Object.keys(assets).length, 7);
  let bytes = 0;
  for (const id of Object.keys(assets) as AssetId[]) {
    assert.equal((await readAsset(id)).length, assets[id].bytes); bytes += assets[id].bytes;
    assert.match(assetPath(id), /^[a-f0-9]{64}\/[a-z]+\.webm$/);
    assert.equal(localAssetId(`${localPrefix}${assetPath(id)}`), id);
  }
  assert.equal(bytes, 3099076); assert.equal(assets.idle.bytes + assets.walk.bytes, 1038339);
});
test('local media route uses exact allowlist, not filesystem/path suffix matching', () => {
  for (const path of [localPrefix, `${localPrefix}../idle.webm`, `${localPrefix}%2e%2e/idle.webm`, `${localPrefix}${assetPath('idle')}/extra`, `${localPrefix}${assetPath('idle').replace('idle', 'walk')}`, `/media/assets/other/${assetPath('idle')}`]) {
    assert.equal(localAssetId(path), undefined);
  }
  assert.equal(petLocalIntegration().name, 'pet-local-allowlist');
});
test('pure config without a resource base is disabled (production file loading is separate)', () => {
  assert.deepEqual(petConfig({}), { enabled: false, urls: {} });
  assert.deepEqual(petConfig({ base: '' }), { enabled: false, urls: {} });
  assert.ok(!JSON.stringify(petConfig({})).includes('/local/'));
});
test('only explicit local build flag or UI dev produces local immutable URLs', () => {
  for (const options of [{ local: true }, { ui: true }]) {
    const config = petConfig(options);
    assert.equal(config.enabled, true);
    assert.equal(config.urls.idle, `${localPrefix}${assetPath('idle')}`);
    assert.equal(Object.keys(config.urls).length, 7);
    assert.ok(!JSON.stringify(config).includes('资源'));
  }
});
test('production accepts custom HTTPS domain and explicit version path', () => {
  const config = petConfig({ base: 'https://pet.example.com/dsh-v0.3.7/' });
  assert.equal(config.enabled, true);
  assert.equal(config.urls.walk, `https://pet.example.com/dsh-v0.3.7/${assetPath('walk')}`);
});
test('production supports the selected same-origin content-bucket Worker base', () => {
  const config = petConfig({ base: 'https://site.example.com/media/assets/pet/v0.3.7-web-2' });
  assert.equal(config.enabled, true);
  assert.equal(config.urls.idle, `https://site.example.com/media/assets/pet/v0.3.7-web-2/${assetPath('idle')}`);
});
test('production also supports the existing bucket custom domain without the Worker media prefix', () => {
  const config = petConfig({ base: 'https://assets.icaiming.cn/assets/pet/v0.3.7-web-2' });
  assert.equal(config.enabled, true);
  assert.equal(config.urls.idle, `https://assets.icaiming.cn/assets/pet/v0.3.7-web-2/${assetPath('idle')}`);
  assert.ok(!config.urls.idle?.includes('/media/'));
});
test('invalid production URLs fail the build instead of silently enabling local fallback', () => {
  for (const base of ['http://pet.example.com/v1', '/media/assets/pet/local', 'https://localhost/v1', 'https://x.localhost/v1', 'https://test.local/v1', 'https://127.0.0.1/v1', 'https://[::1]/v1', 'https://pub-123.r2.dev/v1', 'https://r2.dev/v1', 'https://pet.example.com', 'https://pet.example.com/v1?token=x', 'https://pet.example.com/v1#x', 'https://user:password@pet.example.com/v1', 'https://pet.example.com:4321/v1', 'https://pet.example.com/a/../v1', 'https://pet.example.com/%2e%2e/v1']) {
    assert.throws(() => petConfig({ base }), undefined, base);
  }
});
test('production rejects trailing-dot DNS hosts, including local and r2.dev aliases', () => {
  for (const host of ['localhost.', 'test.local.', 'test.localhost.', 'r2.dev.', 'pub-123.r2.dev.', 'pet.example.com.']) {
    assert.throws(() => petConfig({ base: `https://${host}/v1` }), undefined, host);
  }
  assert.throws(() => petConfig({ base: 'https://localhost./v1/https://pet.example.com' }));
});
