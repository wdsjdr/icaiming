import test from 'node:test';
import assert from 'node:assert/strict';
import { contentTypes, prepareContent } from '../scripts/content';
import { assets, assetPath, type AssetId } from '../src/lib/pet/assets';
import { petMediaPrefix } from '../src/lib/pet/media';
import { createHash } from 'node:crypto';

test('content importer declares WebM MIME instead of falling back to octet-stream', () => {
  assert.equal(contentTypes['.webm'], 'video/webm');
  assert.equal(contentTypes['.png'], 'image/png');
  assert.equal(contentTypes['.unrecognised'], undefined);
});

test('complete content source retains existing content and seven exact versioned clips', async () => {
  const objects = await prepareContent(); // Read-only: no sync, credentials or manifest writes.
  for (const key of ['site/profile.json', 'site/home.json', 'resources/index.json', 'projects/index.json', 'downloads/index.json', 'resume/resume.json', 'posts/a-small-garden.md']) {
    assert.ok(objects.has(key), key);
  }
  assert.equal([...objects.keys()].filter((key) => key.startsWith(petMediaPrefix)).length, 7);
  for (const id of Object.keys(assets) as AssetId[]) {
    const body = objects.get(`${petMediaPrefix}${assetPath(id)}`);
    assert.ok(Buffer.isBuffer(body));
    assert.equal(body.length, assets[id].bytes);
    assert.equal(createHash('sha256').update(body).digest('hex'), assets[id].sha256);
  }
});
