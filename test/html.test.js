import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { html, raw } = await import('../src/lib/html.js');
const { safeLocalPath, signToken, verifyToken, hashPassword, verifyPassword } = await import('../src/lib/security.js');

test('html escapes values and keeps nested templates', () => {
  const name = '<script>alert("x")</script>';
  const out = String(html`<p title="${name}">${name}</p>${[html`<b>${'&'}</b>`, raw('<i>ok</i>')]}${false}${null}`);
  assert.equal(out, '<p title="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p><b>&amp;</b><i>ok</i>');
});

test('only local redirect targets are allowed', () => {
  assert.equal(safeLocalPath('/library'), '/library');
  assert.equal(safeLocalPath('//evil.com'), '/library');
  assert.equal(safeLocalPath('https://evil.com'), '/library');
  const backslash = String.fromCharCode(92); // browsers treat "/\evil.com" like "//evil.com"
  assert.equal(safeLocalPath(`/${backslash}evil.com`), '/library');
  assert.equal(safeLocalPath(undefined, ''), '');
});

test('signed tokens expire and cannot be altered', () => {
  const token = signToken({ u: 1, exp: Date.now() + 60_000 });
  assert.equal(verifyToken(token).u, 1);
  const [body, mac] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 2, exp: Date.now() + 60_000 })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${mac}`), null);
  assert.equal(verifyToken(signToken({ u: 1, exp: Date.now() - 1 })), null);
  assert.equal(verifyToken(`${body}`), null);
});

test('password hashing round-trip', async () => {
  const hash = await hashPassword('სწორი-პაროლი-123');
  assert.equal(await verifyPassword('სწორი-პაროლი-123', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});
