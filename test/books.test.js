import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { detectBasePath, normalizeBasePath, slugError, imageType } = await import('../src/books.js');

const files = (...list) => (rel) => list.some((f) => f === rel || f.startsWith(`${rel}/`));

test('Angular <base href> is used as the base path', () => {
  assert.equal(detectBasePath('<base href="/CBT/"><link href="styles.css">', files('styles.css')), '/CBT/');
  assert.equal(detectBasePath('<base href="/">', files()), '/');
  assert.equal(detectBasePath('<base href="./">', files()), '/');
});

test('Next.js basePath is detected from asset URLs', () => {
  const html = '<link href="/body-lang/_next/static/chunks/a.css"><script src="/body-lang/_next/static/chunks/b.js"></script><a href="/body-lang/chapters/x">';
  assert.equal(detectBasePath(html, files('_next/static/chunks/a.css', '_next/static/chunks/b.js', 'chapters/x/index.html')), '/body-lang/');
});

test('root-absolute and relative builds use "/"', () => {
  assert.equal(detectBasePath('<script src="/assets/index-abc.js"></script>', files('assets/index-abc.js')), '/');
  assert.equal(detectBasePath('<link href="css/base.css"><script src="js/app.js"></script>', files('css/base.css')), '/');
  // A link to an SPA route that is not a file must not be mistaken for a base path.
  assert.equal(detectBasePath('<a href="/about">About</a><script src="/assets/x.js">', files('assets/x.js')), '/');
});

test('base path normalisation', () => {
  assert.equal(normalizeBasePath('CBT'), '/CBT/');
  assert.equal(normalizeBasePath('//a//b/'), '/a/b/');
  assert.equal(normalizeBasePath(''), '/');
});

test('slugs must be safe subdomain names', () => {
  assert.equal(slugError('cbt'), null);
  assert.equal(slugError('social-psychology-2'), null);
  assert.ok(slugError('CBT'));
  assert.ok(slugError('-cbt'));
  assert.ok(slugError('ფსიქოლოგია'));
  assert.ok(slugError('www'));
  assert.ok(slugError('a.b'));
});

test('cover images are recognised by their bytes, not their name', () => {
  assert.equal(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'jpg');
  assert.equal(imageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), 'png');
  assert.equal(imageType(Buffer.from('RIFF0000WEBPVP8 ', 'latin1')), 'webp');
  assert.equal(imageType(Buffer.from('<svg onload=alert(1)>')), null);
});
