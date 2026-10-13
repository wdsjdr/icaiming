import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminError, normalizeRunToken, sanitizeCommandOutput } from '../scripts/admin/lib';

test('RUN_TOKEN must be 16+ non-blank characters and is trimmed', () => {
  assert.equal(normalizeRunToken('  abcdefghijklmnop  '), 'abcdefghijklmnop');
  assert.throws(() => normalizeRunToken('short-token'), (error) => error instanceof AdminError && error.status === 400);
  assert.throws(() => normalizeRunToken('abcdefgh ijklmnop'), (error) => error instanceof AdminError);
  assert.throws(() => normalizeRunToken(''), (error) => error instanceof AdminError);
  assert.throws(() => normalizeRunToken(undefined), (error) => error instanceof AdminError);
});

test('command output loses colour codes and every secret value', () => {
  const secret = 'cf-api-token-value-1234567890';
  const raw = `\u001b[32mSuccess!\u001b[0m token=${secret} and again ${secret}`;
  const cleaned = sanitizeCommandOutput(raw, [secret, '']);
  assert.equal(cleaned, 'Success! token=[已隐藏] and again [已隐藏]');
  assert.ok(!cleaned.includes(secret));
});
