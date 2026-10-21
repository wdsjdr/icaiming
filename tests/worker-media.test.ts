import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assets, assetPath, type AssetId } from '../src/lib/pet/assets';
import { isPetMediaKey, petMediaPrefix, petMediaVersion } from '../src/lib/pet/media';

test('strict immutable matcher requires the exact audited version/hash/id tuple', () => {
  assert.equal(petMediaVersion, 'v0.3.7-web-2');
  assert.equal(petMediaPrefix, 'assets/pet/v0.3.7-web-2/');
  for (const id of Object.keys(assets) as AssetId[]) assert.ok(isPetMediaKey(`${petMediaPrefix}${assetPath(id)}`));
  for (const key of [
    `assets/pet/local/${assetPath('idle')}`, `assets/pet/v0.3.6-web-1/${assetPath('idle')}`,
    `${petMediaPrefix}${assetPath('idle').replace('idle', 'walk')}`,
    `${petMediaPrefix}${assetPath('idle')}/extra`, `${petMediaPrefix}${'0'.repeat(64)}/idle.webm`,
    `assets/other/${assetPath('idle')}`, `${petMediaPrefix}${assetPath('idle').toUpperCase()}`,
  ]) assert.equal(isPetMediaKey(key), false, key);
});

test('Worker media with real ephemeral Miniflare R2: GET, HEAD, metadata and path compatibility', async (t) => {
  // Compile only this test entry in memory, never Astro/dist or a preview server.
  // Execute inside workerd: Node-native Headers cannot cross Miniflare's R2 proxy bridge.
  const require = createRequire(import.meta.resolve('wrangler'));
  const { buildSync }: { buildSync(options: object): { outputFiles: { text: string }[] } } = require('esbuild');
  const bundled = buildSync({
    stdin: { contents: `
      import { media } from './src/worker/handlers/media';
      export default { async fetch(request, env) {
        const url = new URL(request.url);
        let gets = 0, heads = 0;
        const bucket = new Proxy(env.CONTENT_BUCKET, { get(target, name) {
          if (name === 'get') return (...args) => { gets++; return target.get(...args); };
          if (name === 'head') return (...args) => { heads++; return target.head(...args); };
          const value = Reflect.get(target, name);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
        const response = await media(request, { ...env, CONTENT_BUCKET: bucket, LOCAL_DEV: url.searchParams.get('local') }, [url.searchParams.get('key')]);
        response.headers.set('X-Test-Gets', String(gets));
        response.headers.set('X-Test-Heads', String(heads));
        return response;
      } };
    `, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, r2Buckets: ['CONTENT_BUCKET'] });
  try {
    const bucket = await mf.getR2Bucket('CONTENT_BUCKET');
    const key = `${petMediaPrefix}${assetPath('idle')}`;
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 255]);
    await bucket.put(key, bytes, { httpMetadata: { contentType: 'application/octet-stream', cacheControl: 'public, max-age=7' } });
    const request = (path: string, method = 'GET', headers?: Record<string, string>, local = false) => mf.dispatchFetch(
      `https://site.example/?key=${encodeURIComponent(path)}&local=${local ? 'true' : ''}`, { method, headers });

    await t.test('pet GET returns exact bytes and overrides stale stored headers', async () => {
      const response = await request(key);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Content-Type'), 'video/webm');
      assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
      assert.equal(response.headers.get('Content-Length'), String(bytes.length));
      assert.equal(response.headers.get('ETag'), (await bucket.head(key))?.httpEtag);
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
    });
    await t.test('HEAD uses bucket.head without getting/reading a body; headers equal GET', async () => {
      const head = await request(key, 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(head.body, null);
      assert.equal(head.headers.get('X-Test-Gets'), '0');
      assert.equal(head.headers.get('X-Test-Heads'), '1');
      const get = await request(key);
      for (const name of ['Content-Type', 'Content-Length', 'ETag', 'Cache-Control']) assert.equal(head.headers.get(name), get.headers.get(name));
      await get.arrayBuffer();
    });
    await t.test('pet conditional GET/HEAD support weak tags, lists and wildcard', async () => {
      const etag = (await bucket.head(key))!.httpEtag;
      for (const method of ['GET', 'HEAD']) {
        for (const value of [etag, `"other", W/${etag}`, '*']) {
          const response = await request(key, method, { 'If-None-Match': value });
          assert.equal(response.status, 304);
          assert.equal(response.body, null);
          assert.equal(response.headers.get('ETag'), etag);
          assert.equal(response.headers.get('Content-Length'), null);
        }
      }
      const miss = await request(key, 'GET', { 'If-None-Match': '"other"' });
      assert.equal(miss.status, 200);
      await miss.arrayBuffer();
    });
    await t.test('local pet GET/HEAD are no-store even with stored caching', async () => {
      for (const method of ['GET', 'HEAD']) {
        const response = await request(key, method, undefined, true);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        await response.arrayBuffer();
      }
    });
    await t.test('nonmatching pet and other media retain stored MIME/cache and attachment behaviour', async () => {
      for (const path of [
        `assets/pet/v0.3.6-web-1/${assetPath('idle')}`,
        `${petMediaPrefix}${assetPath('idle').replace('idle', 'walk')}`,
        `${petMediaPrefix}${'0'.repeat(64)}/idle.webm`,
        'assets/images/a.png', 'downloads/a.zip', 'resume/cv.pdf',
      ]) {
        await bucket.put(path, bytes, { httpMetadata: { contentType: 'application/example', cacheControl: 'public, max-age=7' } });
        const response = await request(path, 'GET', { 'If-None-Match': '*' });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('Content-Type'), 'application/example');
        assert.equal(response.headers.get('Cache-Control'), 'public, max-age=7');
        if (!path.startsWith('assets/')) assert.match(response.headers.get('Content-Disposition') ?? '', /attachment/);
        await response.arrayBuffer();
        const head = await request(path, 'HEAD');
        assert.equal(head.body, null);
        assert.equal(head.headers.get('X-Test-Gets'), '0');
        assert.equal(head.headers.get('X-Test-Heads'), '1');
      }
    });
    await t.test('absent objects return 404; unsafe/outside-prefix paths never reach R2', async () => {
      for (const method of ['GET', 'HEAD']) assert.equal((await request(`${petMediaPrefix}${assetPath('walk')}`, method)).status, 404);
      for (const path of ['posts/a.md', 'rankings/a.json', 'assets/.hidden', 'assets/%2e%2e/a', 'assets/a%00', 'assets/a%5cb', 'assets//a', 'resume/a.txt']) {
        const response = await request(path);
        assert.equal(response.status, 404, path);
        assert.equal(response.headers.get('X-Test-Gets'), '0');
        assert.equal(response.headers.get('X-Test-Heads'), '0');
      }
    });
  } finally { await mf.dispose(); }
});
