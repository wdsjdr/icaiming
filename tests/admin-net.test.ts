import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionErrorCode, isConnectionError, proxyEndpoint } from '../scripts/admin/net';

test('connection errors are recognised by their cause code', () => {
  assert.equal(isConnectionError({ cause: { code: 'ECONNREFUSED' } }), true);
  assert.equal(isConnectionError({ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }), true);
  assert.equal(isConnectionError({ cause: { code: 'ENOTFOUND' } }), true);
  assert.equal(isConnectionError({ cause: { code: 'ENOENT' } }), false);
  assert.equal(isConnectionError(new Error('boom')), false);
  assert.equal(isConnectionError(null), false);
  assert.equal(connectionErrorCode({ cause: { code: 'ETIMEDOUT' } }), 'ETIMEDOUT');
  assert.equal(connectionErrorCode(new Error('boom')), '');
});

test('proxy endpoint fills the default port from the scheme', () => {
  assert.deepEqual(proxyEndpoint('http://127.0.0.1:7897'), { host: '127.0.0.1', port: 7897 });
  assert.deepEqual(proxyEndpoint('https://proxy.example.com'), { host: 'proxy.example.com', port: 443 });
  assert.deepEqual(proxyEndpoint('http://proxy.example.com'), { host: 'proxy.example.com', port: 80 });
});
