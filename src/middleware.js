import { config, DAY } from './config.js';
import { safeEqual } from './lib/security.js';
import { SESSION_COOKIE, sessionByToken, touchSession } from './users.js';
import { ctx } from './views/layout.js';
import { messagePage } from './views/static.js';

// ───────── Cookies ─────────

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    if (name in out) continue; // first one wins
    const value = part.slice(i + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function setCookie(res, name, value, { maxAgeMs } = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  if (config.secureCookies) cookie += '; Secure';
  if (maxAgeMs !== undefined) cookie += `; Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`;
  res.append('Set-Cookie', cookie);
}

// ───────── Session ─────────

export function loadSession(req, res, next) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const row = sessionByToken(token);
  if (row && !row.is_blocked) {
    req.user = row; // the user's columns + session_id + csrf
    if (touchSession(row)) setCookie(res, SESSION_COOKIE, token, { maxAgeMs: config.sessionDays * DAY });
  } else if (token) {
    setCookie(res, SESSION_COOKIE, '', { maxAgeMs: 0 });
  }
  next();
}

export function requireUser(req, res, next) {
  if (req.user) return next();
  const target = req.method === 'GET' ? req.originalUrl : '/library';
  res.redirect(303, `/login?next=${encodeURIComponent(target)}`);
}

export function requireAdmin(req, res, next) {
  if (!req.user) return requireUser(req, res, next);
  if (req.user.role !== 'admin') return sendPage(res, messagePage(ctx(req), { title: 'გვერდი ვერ მოიძებნა', iconName: 'search' }), 404);
  next();
}

// ───────── CSRF ─────────

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Every form post must come from our own pages (blocks cross-site and book-site form posts). */
export function originCheck(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  const referer = req.get('referer') || '';
  const ok = origin ? origin === config.appUrl : referer === config.appUrl || referer.startsWith(`${config.appUrl}/`);
  if (ok) return next();
  csrfFailed(req, res);
}

const PUBLIC_FORMS = new Set(['/login', '/register', '/forgot']);

/** Signed-in forms also carry a per-session token (<input name="_csrf">, or ?_csrf= for file uploads). */
export function csrfCheck(req, res, next) {
  if (SAFE_METHODS.has(req.method) || !req.user || PUBLIC_FORMS.has(req.path) || req.path.startsWith('/reset/')) return next();
  const token = req.body?._csrf || req.query?._csrf || req.get('x-csrf-token');
  if (token && safeEqual(token, req.user.csrf)) return next();
  csrfFailed(req, res);
}

function csrfFailed(req, res) {
  sendPage(
    res,
    messagePage(ctx(req), {
      title: 'ფორმა მოძველდა',
      text: 'განაახლე გვერდი და სცადე თავიდან.',
      iconName: 'refresh',
    }),
    403,
  );
}

// ───────── Responses ─────────

export function sendPage(res, htmlPage, status = 200) {
  res.status(status).type('html').send(String(htmlPage));
}

export function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self'",
      "script-src 'self'",
      "font-src 'self'",
      "connect-src 'self'",
      // Form posts may end in a redirect to Flitt (payment) or to a book subdomain (after login).
      `form-action 'self' ${config.payments.flitt.checkoutHost} ${config.protocol}//*.${config.booksDomain}`,
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "object-src 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (config.secureCookies) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
}
