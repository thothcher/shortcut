import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { html } from '../lib/html.js';
import { daysLeft, firstName } from '../lib/format.js';
import { hasAccess } from '../users.js';
import { icon, logoMark } from './icons.js';

// Short messages shown after a redirect: /account?ok=password → "პაროლი შეიცვალა."
const NOTICES = {
  ok: {
    welcome: 'ანგარიში შეიქმნა. კეთილი იყოს შენი მობრძანება!',
    profile: 'ცვლილებები შენახულია.',
    password: 'პაროლი შეიცვალა.',
    reset: 'პაროლი განახლდა. შედი ახალი პაროლით.',
    sessions: 'სხვა მოწყობილობებიდან გამოსვლა შესრულდა.',
    request: 'მადლობა! მოთხოვნა მიღებულია — ყველაზე მოთხოვნად საგნებს პირველ რიგში ვამატებთ.',
    saved: 'შენახულია.',
    deleted: 'წაიშალა.',
    uploaded: 'საიტი აიტვირთა.',
    granted: 'წვდომა დაემატა.',
  },
  err: {
    blocked: 'ეს ანგარიში დაბლოკილია. დაგვიკავშირდი, თუ ეს შეცდომაა.',
    'reset-invalid': 'ბმული არასწორია ან ვადა გაუვიდა. მოითხოვე ახალი.',
    unavailable: 'ეს მასალა ამჟამად მიუწვდომელია.',
    'payment-failed': 'გადახდის გვერდი ვერ გაიხსნა. სცადე ცოტა ხანში.',
  },
};

/** Per-request data every page needs. */
export function ctx(req) {
  const user = req.user || null;
  const ok = NOTICES.ok[req.query?.ok];
  const err = NOTICES.err[req.query?.err];
  return {
    user,
    csrf: user?.csrf || '',
    path: req.path,
    notice: ok ? { type: 'ok', text: ok } : err ? { type: 'error', text: err } : null,
  };
}

const versions = new Map();
/** /static/css/app.css?v=<hash> so browsers can cache files forever and still get updates. */
export function asset(rel) {
  if (!config.isProd || !versions.has(rel)) {
    const buf = fs.readFileSync(path.join(config.root, 'public', rel));
    versions.set(rel, crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10));
  }
  return `/static/${rel}?v=${versions.get(rel)}`;
}

export const csrfField = (c) => html`<input type="hidden" name="_csrf" value="${c.csrf}">`;

export function alert(notice) {
  if (!notice) return '';
  return html`<div class="alert alert--${notice.type}" role="${notice.type === 'error' ? 'alert' : 'status'}">
    ${icon(notice.type === 'error' ? 'alert' : 'checkCircle')}<span>${notice.text}</span>
  </div>`;
}

function accessChip(user) {
  if (user.role === 'admin') return '';
  if (hasAccess(user)) {
    const left = daysLeft(user.access_until);
    return html`<a class="chip ${left <= 3 ? 'chip--warn' : 'chip--ok'}" href="/pricing" title="წვდომის ვადა">
      ${icon('clock', 16)}${left} დღე</a>`;
  }
  return html`<a class="chip chip--cta" href="/pricing">${icon('sparkles', 16)}გააქტიურე</a>`;
}

function header(c) {
  const u = c.user;
  return html`<header class="site-header">
    <div class="container site-header__row">
      <a class="brand" href="${u ? '/library' : '/'}" aria-label="${config.appName} — მთავარი">
        ${logoMark()}<span class="brand__name">${config.appName}</span>
      </a>
      ${u
        ? html`<nav class="nav" aria-label="მთავარი მენიუ">
            <a class="nav__link ${c.path.startsWith('/library') ? 'is-active' : ''}" href="/library">${icon('library', 18)}<span>ბიბლიოთეკა</span></a>
            ${u.role === 'admin' &&
            html`<a class="nav__link ${c.path.startsWith('/admin') ? 'is-active' : ''}" href="/admin">${icon('settings', 18)}<span>ადმინი</span></a>`}
            ${accessChip(u)}
            <a class="avatar" href="/account" title="ჩემი ანგარიში" aria-label="ჩემი ანგარიში">${firstName(u.name).slice(0, 1).toUpperCase()}</a>
          </nav>`
        : html`<nav class="nav" aria-label="ავტორიზაცია">
            <a class="btn btn--ghost btn--sm" href="/login">შესვლა</a>
            <a class="btn btn--primary btn--sm" href="/register">რეგისტრაცია</a>
          </nav>`}
    </div>
  </header>`;
}

function footer() {
  const year = new Date().getFullYear();
  return html`<footer class="site-footer">
    <div class="container site-footer__grid">
      <div>
        <a class="brand brand--small" href="/">${logoMark(24)}<span class="brand__name">${config.appName}</span></a>
        <p class="muted small">სასწავლო მასალები უნივერსიტეტის სტუდენტებისთვის — მოკლე კონსპექტები, ბარათები და თამაშები.</p>
      </div>
      <nav class="site-footer__links" aria-label="იურიდიული ინფორმაცია">
        <a href="/pricing">ფასი</a>
        <a href="/terms">წესები და პირობები</a>
        <a href="/privacy">კონფიდენციალურობა</a>
        <a href="/refunds">თანხის დაბრუნება</a>
        <a href="/contact">კონტაქტი</a>
      </nav>
    </div>
    <div class="container site-footer__legal small muted">
      <p>© ${year} ${config.company.name} · ს/კ ${config.company.idCode}</p>
      <p>${config.appName} დამოუკიდებელი სასწავლო პლატფორმაა და ოფიციალურად არ არის დაკავშირებული თსუ-სთან, ილიაუნისთან ან BTU-სთან.</p>
    </div>
  </footer>`;
}

/**
 * Full HTML page.
 * @param c        ctx(req)
 * @param title    page title (without the site name)
 * @param body     page content (html``)
 * @param variant  'default' | 'auth' (centered card, no footer) | 'admin'
 */
export function page(c, { title, description, body, variant = 'default', head = '' }) {
  const fullTitle = title ? `${title} · ${config.appName}` : `${config.appName} — მოემზადე გამოცდებისთვის ჭკვიანურად`;
  return html`<!doctype html>
<html lang="ka">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${fullTitle}</title>
  <meta name="description" content="${description || 'უნივერსიტეტის საგნები ციფრულ ფორმატში: მოკლე კონსპექტები, ბარათები, თამაშები და ტესტები. 10 ₾ — 30 დღე.'}">
  <meta name="theme-color" content="#f8f6f1">
  <link rel="icon" href="${asset('img/favicon.svg')}" type="image/svg+xml">
  <link rel="preload" href="/static/fonts/sans-georgian.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${asset('css/app.css')}">
  <script src="${asset('js/app.js')}" defer></script>
  ${head}
</head>
<body class="v-${variant}">
  <a class="skip" href="#main">მთავარ შინაარსზე გადასვლა</a>
  ${header(c)}
  <main id="main" tabindex="-1">
    ${c.notice && html`<div class="container notice-wrap">${alert(c.notice)}</div>`}
    ${body}
  </main>
  ${variant !== 'auth' && footer()}
</body>
</html>`;
}
