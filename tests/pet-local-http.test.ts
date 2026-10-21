import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { assets, assetPath } from '../src/lib/pet/assets';
import { localMedia, localPrefix } from '../scripts/pet/local';

test('UI dev middleware serves only audited files with GET/HEAD; full blob 200 even for Range', async () => {
  const server = createServer((req, res) => localMedia(req, res, () => { res.statusCode = 418; res.end(); }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const url = `${origin}${localPrefix}${assetPath('idle')}`;
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-99' } });
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'video/webm');
    assert.equal((await response.arrayBuffer()).byteLength, assets.idle.bytes);
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), String(assets.idle.bytes));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    const post = await fetch(url, { method: 'POST' });
    assert.equal(post.status, 405); assert.equal(post.headers.get('allow'), 'GET, HEAD');
    assert.equal((await fetch(`${origin}${localPrefix}unknown.webm`)).status, 404);
    assert.equal((await fetch(`${origin}/media/other`)).status, 418);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
