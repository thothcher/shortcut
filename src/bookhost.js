// Serves book websites from their own subdomain: https://<slug>.<BOOKS_DOMAIN>/
//
// Why a subdomain per book: book sites are built by different developers with different tools.
// Next.js, Angular and Vite builds expect to live at the root of a domain (or at a fixed base path
// such as /CBT/ for GitHub Pages). On its own subdomain every build works without being rebuilt,
// and one book's JavaScript and localStorage cannot touch another book or the platform.
//
// Access: the platform's /open/<slug> page hands over a 60-second signed token. This server turns
// it into its own cookie, then checks on every request that the platform session still exists and
// that the student still has access (logging out or a new device signing in ends book access too).
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config, bookOrigin } from './config.js';
import { contentDir, getBookBySlug } from './books.js';
import { canOpenBook, sessionById } from './users.js';
import { safeLocalPath, signToken, verifyToken } from './lib/security.js';
import { escapeHtml } from './lib/html.js';
import { parseCookies, setCookie } from './middleware.js';

const BOOK_COOKIE = config.secureCookies ? '__Host-bk' : 'bk';
const COOKIE_MS = 12 * 60 * 60 * 1000;
const BAR_JS = path.join(config.root, 'public', 'js', 'bar.js');

/** "cbt" for host "cbt.shortcut.ge" (or "cbt.localhost:3000" in development), otherwise null. */
export function bookSlugFromHost(hostHeader) {
  const host = String(hostHeader || '').toLowerCase();
  const suffix = `.${config.booksDomain}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  return /^[a-z0-9-]{1,48}$/.test(label) ? label : null;
}

/** Link that signs the current user into a book site (valid for 60 seconds). */
export function handoffUrl(book, user, to = '') {
  const token = signToken({ p: 'open', s: book.slug, u: user.id, sid: user.session_id, exp: Date.now() + 60_000 });
  const next = safeLocalPath(to, '');
  return `${bookOrigin(book.slug)}/__auth?t=${encodeURIComponent(token)}${next ? `&to=${encodeURIComponent(next)}` : ''}`;
}

const isNavigation = (req) => req.get('sec-fetch-mode') === 'navigate' || /text\/html/.test(req.get('accept') || '');

function sendNotFound(res) {
  res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>404</title><p style="font:16px sans-serif;padding:2rem">გვერდი ვერ მოიძებნა.</p>');
}

/** Back to the platform, which signs the user in again or shows the paywall. */
function toPlatform(res, book, returnPath = '') {
  const to = returnPath && returnPath !== '/' ? `?to=${encodeURIComponent(returnPath)}` : '';
  res.redirect(302, `${config.appUrl}/open/${book.slug}${to}`);
}

export async function handleBookRequest(req, res, slug) {
  res.set({
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });

  if (slug === 'www') return res.redirect(301, config.appUrl);
  const book = getBookBySlug(slug);
  if (!book || !book.content_version) return sendNotFound(res);

  const url = new URL(req.originalUrl, 'http://book.local');
  const pathname = url.pathname;

  if (pathname === '/__platform/bar.js') {
    return res.sendFile(BAR_JS, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  }

  if (pathname === '/__auth') {
    const claims = verifyToken(url.searchParams.get('t'));
    if (!claims || claims.p !== 'open' || claims.s !== slug) return toPlatform(res, book);
    setCookie(res, BOOK_COOKIE, signToken({ p: 'book', s: slug, u: claims.u, sid: claims.sid, exp: Date.now() + COOKIE_MS }), {
      maxAgeMs: COOKIE_MS,
    });
    res.set({ 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
    return res.redirect(302, safeLocalPath(url.searchParams.get('to'), book.base_path));
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).set('Allow', 'GET, HEAD').end();

  // Who is this, and may they read this book right now?
  const claims = verifyToken(parseCookies(req.headers.cookie)[BOOK_COOKIE]);
  const session = claims?.p === 'book' && claims.s === slug ? sessionById(claims.sid) : null;
  const user = session && session.id === claims.u ? session : null;
  if (!user || !canOpenBook(user, book)) {
    if (isNavigation(req)) return toPlatform(res, book, pathname + url.search);
    return res.status(401).type('text').send('Unauthorized');
  }

  return serveFile(req, res, book, user, pathname, url.search);
}

async function serveFile(req, res, book, user, pathname, search) {
  const base = book.base_path || '/';
  let rel;
  if (pathname.startsWith(base)) rel = pathname.slice(base.length);
  else if (`${pathname}/` === base || pathname === '/') return res.redirect(302, base + search);
  else rel = pathname.slice(1); // a file referenced from the domain root, e.g. /favicon.ico

  let decoded;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return res.status(400).end();
  }
  if (decoded.includes('\0')) return res.status(400).end();

  const root = contentDir(book);
  const target = path.resolve(root, decoded);
  if (target !== root && !target.startsWith(root + path.sep)) return sendNotFound(res);

  const stat = await fsp.stat(target).catch(() => null);
  if (stat?.isDirectory() && !pathname.endsWith('/')) return res.redirect(301, `${pathname}/${search}`);

  let file = null;
  for (const candidate of [target, `${target}.html`, path.join(target, 'index.html')]) {
    const s = candidate === target ? stat : await fsp.stat(candidate).catch(() => null);
    if (s?.isFile()) {
      file = candidate;
      break;
    }
  }
  // Single-page apps (Angular, React Router…) handle their own routes: answer with index.html.
  if (!file && isNavigation(req) && !path.extname(decoded)) file = path.join(root, 'index.html');
  if (!file) return sendNotFound(res);

  if (/\.html?$/i.test(file)) {
    const text = await fsp.readFile(file, 'utf8');
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-cache' });
    return res.send(injectBar(text, user));
  }
  return res.sendFile(file, { dotfiles: 'deny', headers: { 'Cache-Control': 'private, max-age=3600' } }, (err) => {
    if (err && !res.headersSent) res.status(err.statusCode || 404).end();
  });
}

/** Adds the platform's small "back to library" button and the e-mail watermark to a book page. */
function injectBar(text, user) {
  const attrs = [
    `data-library="${escapeHtml(`${config.appUrl}/library`)}"`,
    `data-app="${escapeHtml(config.appName)}"`,
    config.watermark ? `data-wm="${escapeHtml(user.email)}"` : '',
  ].join(' ');
  const tag = `<script src="/__platform/bar.js" ${attrs} defer></script>`;
  let index = -1;
  for (const match of text.matchAll(/<\/body\s*>/gi)) index = match.index;
  return index === -1 ? text + tag : text.slice(0, index) + tag + text.slice(index);
}
