// Static demo for GitHub Pages:  npm run build:demo  →  _site/
//
// GitHub Pages can only serve files. This script starts the real app with the sample data
// (in a temporary folder), visits it as four demo users and saves every page they can reach,
// then copies the sample books. Links become relative, so the result works at
// https://<user>.github.io/<repo>/ or from any folder on a static server.
//
// A static site cannot receive forms. Each form gets the address of the page the server would
// answer with (login → library, payment → "payment succeeded" …) in data-demo-to, and
// demo/demo.js opens that page instead of sending the form.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(root, process.argv[2] || '_site');
// Where the site will live, e.g. "/shortcut/" on GitHub Pages. Only the 404 page needs it.
const trimmedBase = (process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '');
if (!/^[\w./-]*$/.test(trimmedBase)) {
  // Git Bash on Windows turns "/shortcut" into "C:/Program Files/Git/shortcut"; MSYS_NO_PATHCONV=1 prevents it.
  throw new Error(`BASE_PATH should look like /my-repo, got "${process.env.BASE_PATH}"`);
}
const basePath = trimmedBase ? `/${trimmedBase}/` : '/';

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const repoUrl = process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}`
  : String(pkg.repository?.url || '').replace(/^git\+/, '').replace(/\.git$/, '');

if (out === root || root.startsWith(out + path.sep)) throw new Error(`Refusing to write the demo into ${out}`);
if (fs.existsSync(out) && fs.readdirSync(out).length && !fs.existsSync(path.join(out, '.nojekyll'))) {
  throw new Error(`${out} is not empty and was not made by this script. Choose another folder.`);
}

// The app reads its settings when it is first imported, so set them before that.
const storage = await fsp.mkdtemp(path.join(os.tmpdir(), 'shortcut-demo-'));
for (const key of ['PORT', 'BOOKS_DOMAIN', 'PAYMENT_PROVIDER', 'FLITT_MERCHANT_ID', 'FLITT_SECRET_KEY', 'RESEND_API_KEY', 'SESSION_SECRET', 'TRUST_PROXY', 'WATERMARK']) {
  delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: 'development', // test payments
  APP_URL: 'http://localhost:3000', // the address shown in the admin pages, as in a local run
  STORAGE_DIR: storage,
});

// The app and the seed script print a lot (accounts, e-mails); keep the build output short.
const log = console.log.bind(console);
console.log = () => {};

// Accounts created by scripts/seed-demo.js
const STUDENT = { email: 'student@shortcut.local', password: 'shortcut-demo' };
const ADMIN = { email: 'admin@shortcut.local', password: 'shortcut-admin' };

// Who the demo shows. Each one gets its own folder. "new" and "paid" are the same student,
// before and after paying.
const PERSONAS = {
  guest: { dir: '', label: 'სტუმარი', home: '/' },
  new: { dir: 'new/', label: 'ახალი სტუდენტი', home: '/library', email: STUDENT.email },
  paid: { dir: 'paid/', label: 'სტუდენტი გამოწერით', home: '/library', email: STUDENT.email },
  owner: { dir: 'owner/', label: 'ადმინი', home: '/admin', email: ADMIN.email },
};

const saved = []; // every page: { persona, dir, file, html, absolute }
const byUrl = new Map(); // "<persona> <url>" → folder of the saved page
const redirects = new Map(); // "<persona> <url>" → where the app sent this persona ("/pricing", "book:cbt" …)
const copiedBooks = new Set();
let dirs = new Set(); // folders of all saved pages (filled before the links are rewritten)
// Never visited: files, the book API, and pages that only make sense after a form.
const SKIP = /^\/(static|covers|api|reset|logout|billing\/mock|healthz|robots\.txt|__)/;
let origin = ''; // the app's own address (APP_URL)
let bookUrl = /$^/; // matches https://<slug>.<BOOKS_DOMAIN>/…
let appName = ''; // APP_NAME, shown on the books' "ბიბლიოთეკა" button

let server;
let db;
try {
  await import('../scripts/seed-demo.js'); // sample books + demo accounts
  const { config } = await import('../src/config.js');
  ({ db } = await import('../src/db.js'));
  const { createApp } = await import('../src/app.js');
  const { COVERS_DIR, contentDir } = await import('../src/books.js');

  // The demo follows one student from sign-up to payment, so the account starts without access.
  const student = db.prepare('SELECT id FROM users WHERE email = ?').get(STUDENT.email);
  db.prepare("DELETE FROM orders WHERE user_id = ? AND provider = 'manual'").run(student.id);
  db.prepare('UPDATE users SET access_until = NULL WHERE id = ?').run(student.id);

  const port = await freePort();
  server = createApp().listen(port, '127.0.0.1');
  await once(server, 'listening');
  const site = `http://127.0.0.1:${port}`; // where the requests go
  origin = config.appUrl; // what the app believes its address is
  appName = config.appName;
  bookUrl = new RegExp(`^https?://([a-z0-9-]+)\\.${escapeRegExp(config.booksDomain)}(?:[/?#]|$)`, 'i');

  class Visitor {
    cookies = new Map();
    csrf = '';

    async request(url, { form } = {}) {
      const headers = { accept: 'text/html' };
      if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
      let body;
      if (form) {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        headers.origin = origin;
        body = new URLSearchParams({ _csrf: this.csrf, ...form }).toString();
      }
      const res = await fetch(site + url, { method: form ? 'POST' : 'GET', headers, body, redirect: 'manual' });
      for (const line of res.headers.getSetCookie()) {
        const [pair] = line.split(';');
        const eq = pair.indexOf('=');
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1);
        if (!value || /;\s*max-age=0\b/i.test(line)) this.cookies.delete(name);
        else this.cookies.set(name, value);
      }
      const isHtml = (res.headers.get('content-type') || '').includes('text/html');
      const html = isHtml ? await res.text() : (await res.arrayBuffer(), '');
      const csrf = /name="_csrf" value="([^"]+)"/.exec(html)?.[1];
      if (csrf) this.csrf = csrf;
      return { status: res.status, location: res.headers.get('location'), html };
    }

    async login({ email, password }) {
      const res = await this.request('/login', { form: { email, password } });
      if (res.status !== 303) throw new Error(`Could not sign in as ${email} (HTTP ${res.status})`);
    }
  }

  /** Visits every page reachable from `start` (links, and the options of GET forms such as the program switcher). */
  async function crawl(visitor, persona, start) {
    const queue = start.map(normalize);
    const seen = new Set();
    while (queue.length) {
      const url = queue.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      const key = `${persona} ${url}`;
      if (byUrl.has(key)) continue;
      if (!redirects.has(key)) {
        const res = await visitor.request(url);
        if (res.status >= 300 && res.status < 400) {
          redirects.set(key, classify(res.location));
        } else if (res.status === 200 && res.html) {
          save(persona, PERSONAS[persona].dir + pagePath(url), res.html, { url });
          queue.push(...links(res.html));
          continue;
        } else {
          console.warn(`  skipped ${persona} ${url} (HTTP ${res.status})`);
          continue;
        }
      }
      const target = redirects.get(key);
      if (target && !target.startsWith('book:')) queue.push(target);
    }
  }

  /** Saves the page at `url` into a chosen folder (pages reached by sending a form). */
  async function snapshot(visitor, persona, url, dir) {
    const res = await visitor.request(url);
    if (res.status !== 200) throw new Error(`${url} answered HTTP ${res.status}`);
    save(persona, dir, res.html);
  }

  async function checkout(visitor) {
    const res = await visitor.request('/billing/checkout', { form: { consent: '1' } });
    const id = /\/billing\/mock\/([^/?#]+)/.exec(res.location || '')?.[1];
    if (!id) throw new Error(`Checkout failed (HTTP ${res.status})`);
    return decodeURIComponent(id);
  }

  async function pay(visitor, orderId, result) {
    const res = await visitor.request(`/billing/mock/${encodeURIComponent(orderId)}`, { form: { result } });
    if (res.status !== 303) throw new Error(`Test payment failed (HTTP ${res.status})`);
  }

  const slugs = db.prepare('SELECT slug FROM books WHERE is_published = 1 AND content_version > 0').all().map((b) => b.slug);
  // Books are opened first, so the "continue studying" shelf looks the same on every page.
  const signedIn = [...slugs.map((slug) => `/open/${slug}`), '/library', '/library?ok=request', '/account', '/account?ok=profile', '/account?ok=password', '/account?ok=sessions', '/pricing'];

  // 1. A visitor who is not signed in.
  const guest = new Visitor();
  await crawl(guest, 'guest', ['/', '/pricing', '/login', '/register', '/forgot', '/terms', '/privacy', '/refunds', '/contact']);
  save('guest', 'forgot/sent/', (await guest.request('/forgot', { form: { email: STUDENT.email } })).html);
  save('guest', '', (await guest.request('/this-page-does-not-exist')).html, { file: '404.html', absolute: true });

  // 2. The student has just signed up: no access yet.
  const nino = new Visitor();
  await nino.login(STUDENT);
  await crawl(nino, 'new', ['/library?ok=welcome', ...signedIn]);

  // 3. Payment: one declined card, then a successful one.
  const first = await checkout(nino);
  const second = await checkout(nino);
  await snapshot(nino, 'new', `/billing/mock/${first}`, 'new/billing/checkout/');
  await pay(nino, second, 'declined');
  await snapshot(nino, 'new', `/billing/orders/${second}`, 'new/billing/declined/');
  await pay(nino, first, 'approved');
  await snapshot(nino, 'paid', `/billing/orders/${first}`, 'paid/billing/success/');

  // 4. The same student with access. Paying again adds 30 days.
  await crawl(nino, 'paid', signedIn);
  const renewal = await checkout(nino);
  const failed = await checkout(nino);
  await snapshot(nino, 'paid', `/billing/mock/${renewal}`, 'paid/billing/checkout/');
  await pay(nino, failed, 'declined');
  await snapshot(nino, 'paid', `/billing/orders/${failed}`, 'paid/billing/declined/');
  await pay(nino, renewal, 'approved');
  await snapshot(nino, 'paid', `/billing/orders/${renewal}`, 'paid/billing/renewed/');

  // 5. The admin.
  const admin = new Visitor();
  await admin.login(ADMIN);
  await crawl(admin, 'owner', ['/admin', ...signedIn]);

  // ── Write the site ──
  await fsp.rm(out, { recursive: true, force: true });
  await fsp.mkdir(path.join(out, 'static', 'demo'), { recursive: true });
  await fsp.cp(path.join(root, 'public'), path.join(out, 'static'), { recursive: true });
  for (const name of ['demo.js', 'demo.css', 'book.js']) {
    await fsp.copyFile(path.join(import.meta.dirname, name), path.join(out, 'static', 'demo', name));
  }
  if (fs.existsSync(COVERS_DIR)) await fsp.cp(COVERS_DIR, path.join(out, 'covers'), { recursive: true });
  await fsp.writeFile(path.join(out, '.nojekyll'), ''); // serve folders such as _program-3 as they are

  for (const book of db.prepare('SELECT * FROM books WHERE is_published = 1 AND content_version > 0').all()) {
    if (book.base_path && book.base_path !== '/') {
      console.warn(`  skipped book ${book.slug}: it is built for the base path ${book.base_path}`);
      continue;
    }
    const dest = path.join(out, 'books', book.slug);
    await fsp.cp(contentDir(book), dest, { recursive: true });
    for (const name of await fsp.readdir(dest, { recursive: true })) {
      if (!/\.html?$/i.test(name)) continue;
      const file = path.join(dest, name);
      const up = '../'.repeat(path.relative(out, path.dirname(file)).split(path.sep).length);
      await fsp.writeFile(file, addToBook(await fsp.readFile(file, 'utf8'), `${up}static/demo/book.js`));
    }
    copiedBooks.add(book.slug);
  }

  dirs = new Set(saved.filter((p) => !p.absolute).map((p) => p.dir));
  for (const page of saved) {
    const file = path.join(out, page.file);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, finish(page));
  }

  log(`Static demo: ${saved.length} pages and ${copiedBooks.size} books in ${path.relative(root, out) || out}`);
  log(`Preview it with any static server, e.g.  npx serve ${path.relative(root, out) || out}`);
} finally {
  console.log = log;
  server?.closeAllConnections();
  server?.close();
  db?.close();
  await fsp.rm(storage, { recursive: true, force: true }).catch((err) => console.warn(`Could not remove ${storage}: ${err.message}`));
}

// ───────── Pages ─────────

function save(persona, dir, html, { url, file, absolute = false } = {}) {
  saved.push({ persona, dir, html, file: file || `${dir}index.html`, absolute });
  if (url) byUrl.set(`${persona} ${url}`, dir);
}

/** "/library?program=3" → "library/_program-3/" (every page is a folder with an index.html). */
function pagePath(url) {
  const u = new URL(url, origin);
  const parts = u.pathname.split('/').filter(Boolean);
  const query = [...u.searchParams]
    .map(([k, v]) => `${k}-${v}`)
    .join('_')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
  if (query) parts.push(`_${query}`);
  return parts.length ? `${parts.join('/')}/` : '';
}

/** Same URL, same key: no _csrf, sorted query, no #hash. */
function normalize(url) {
  const u = new URL(url, origin);
  u.searchParams.delete('_csrf');
  u.searchParams.sort();
  const query = u.searchParams.toString();
  return u.pathname + (query ? `?${query}` : '');
}

/** A page of this site ("/library?program=3"), a book ("book:<slug>"), or null (another site, #anchor …). */
function classify(href) {
  if (!href) return null;
  const book = bookUrl.exec(href);
  if (book) return `book:${book[1].toLowerCase()}`;
  const local = href.startsWith('/') && !href.startsWith('//');
  if (!local && !href.startsWith(`${origin}/`) && href !== origin) return null;
  return normalize(href);
}

/** Pages linked from a page, plus one page per option of a GET form's <select> (the program switcher). */
function links(html) {
  const found = new Set();
  for (const [, href] of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
    const url = classify(decode(href));
    if (url && !url.startsWith('book:') && !SKIP.test(url)) found.add(url);
  }
  for (const [, attrs, inner] of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)) {
    if ((attr(attrs, 'method') || 'get').toLowerCase() !== 'get') continue;
    const action = decode(attr(attrs, 'action') || '/');
    for (const [, selectAttrs, options] of inner.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
      const name = attr(selectAttrs, 'name');
      for (const [, value] of options.matchAll(/<option\b[^>]*?\svalue="([^"]+)"/g)) {
        found.add(normalize(`${action}?${new URLSearchParams({ [name]: decode(value) })}`));
      }
    }
  }
  return found;
}

/** Folder of the page this persona ends up on at `url` (following redirects), or null. */
function resolve(persona, url, hops = 0) {
  const key = `${persona} ${normalize(url)}`;
  if (byUrl.has(key)) return byUrl.get(key);
  const target = redirects.get(key);
  if (target?.startsWith('book:')) {
    const slug = target.slice(5);
    return copiedBooks.has(slug) ? `books/${slug}/` : null;
  }
  if (target && hops < 5) return resolve(persona, target, hops + 1);
  return null;
}

function finish(page) {
  const to = page.absolute ? (target) => basePath + target : (target) => relative(page.dir, target);
  let html = rewriteForms(page.html, page.persona, to);
  html = rewriteLinks(html, page.persona, to);
  return decorate(html, page.persona, to);
}

/** Every form learns which page to open instead of sending (see demo/demo.js). */
function rewriteForms(html, persona, to) {
  const own = PERSONAS[persona].dir;
  const page = (who, url) => {
    if (!url) return '';
    const dir = resolve(who, url);
    return dir === null ? '' : to(dir);
  };
  const special = (dir) => (dirs.has(dir) ? to(dir) : '');

  return html.replace(/<form\b([^>]*)>([\s\S]*?)<\/form>/g, (all, attrs, inner) => {
    const method = (attr(attrs, 'method') || 'get').toLowerCase();
    const action = new URL(decode(attr(attrs, 'action') || '/'), origin);
    const next = action.searchParams.get('next');
    const data = {};
    let hint = '';

    if (method === 'get') {
      // The library's program switcher: every option knows its page.
      let known = 0;
      inner = inner.replace(/<select\b([^>]*)>([\s\S]*?)<\/select>/g, (select, selectAttrs, options) => {
        const name = attr(selectAttrs, 'name');
        const withTargets = options.replace(/<option\b[^>]*?\svalue="([^"]*)"/g, (option, value) => {
          const target = page(persona, `${action.pathname}?${new URLSearchParams({ [name]: decode(value) })}`);
          if (!target) return option;
          known++;
          return `${option} data-demo-to="${encode(target)}"`;
        });
        return `<select${selectAttrs}>${withTargets}</select>`;
      });
      if (!known) data['demo-note'] = 'ძებნა მხოლოდ სრულ ვერსიაში მუშაობს.';
    } else if (action.pathname === '/login') {
      data['demo-to'] = page('paid', next) || page('paid', '/library');
      data['demo-admin'] = page('owner', '/admin');
      hint = 'დემოში ნებისმიერი ელ-ფოსტა და პაროლი გამოდგება. ადმინის პანელისთვის შეიყვანე <code>admin@shortcut.local</code>.';
    } else if (action.pathname === '/register') {
      data['demo-to'] = page('new', next) || page('new', '/library?ok=welcome');
      hint = 'დემოში ანგარიში არ იქმნება: რეგისტრაციის შემდეგ ნახავ სადემონსტრაციო სტუდენტის ბიბლიოთეკას.';
    } else if (action.pathname === '/forgot') {
      data['demo-to'] = special('forgot/sent/');
    } else if (action.pathname === '/logout') {
      data['demo-to'] = to('');
    } else if (action.pathname === '/requests') {
      data['demo-to'] = page(persona, '/library?ok=request');
    } else if (/^\/account\/(profile|password|sessions)$/.test(action.pathname)) {
      data['demo-to'] = page(persona, `/account?ok=${action.pathname.split('/')[2]}`);
    } else if (action.pathname === '/billing/checkout') {
      data['demo-to'] = special(`${own}billing/checkout/`);
    } else if (action.pathname.startsWith('/billing/mock/')) {
      const approved = persona === 'new' ? 'paid/billing/success/' : `${own}billing/renewed/`;
      inner = inner.replace(/<button\b[^>]*?\svalue="(approved|declined)"/g, (button, result) => {
        const target = special(result === 'approved' ? approved : `${own}billing/declined/`);
        return target ? `${button} data-demo-to="${encode(target)}"` : button;
      });
    }
    // Any other form (the admin's) shows "changes are not saved in the demo".

    const extra = Object.entries(data)
      .filter(([, value]) => value)
      .map(([name, value]) => ` data-${name}="${encode(value)}"`)
      .join('');
    return `<form${attrs}${extra}>${hint ? `<p class="demo-hint">${hint}</p>` : ''}${inner}</form>`;
  });
}

/** href/src: app pages → the saved page for this persona; /static and /covers → the copied files. */
function rewriteLinks(html, persona, to) {
  return html.replace(/(\s(?:href|src)=")([^"]*)"/g, (all, start, raw) => {
    let value = decode(raw);
    if (value === origin || value.startsWith(`${origin}/`)) value = value.slice(origin.length) || '/';
    if (!value.startsWith('/') || value.startsWith('//')) return all; // #anchor, https://…, mailto:…
    const cut = value.indexOf('#');
    const hash = cut === -1 ? '' : value.slice(cut);
    const url = cut === -1 ? value : value.slice(0, cut);
    let target;
    if (/^\/(static|covers)\//.test(url)) {
      const [file, query] = url.slice(1).split('?');
      target = to(file) + (query ? `?${query}` : '');
    } else {
      const dir = resolve(persona, url);
      target = dir === null ? to('404.html') : to(dir);
    }
    return `${start}${encode(target + hash)}"`;
  });
}

/** Demo bar, demo.js / demo.css, and noindex (the demo should not show up in search results). */
function decorate(html, persona, to) {
  const p = PERSONAS[persona];
  const library = p.email ? resolve(persona, '/library') : null;
  const remember = library !== null ? ` data-library="${encode(to(library))}" data-email="${encode(p.email)}"` : '';
  const head = `  <link rel="stylesheet" href="${encode(to('static/demo/demo.css'))}">
  <script src="${encode(to('static/demo/demo.js'))}"${remember} defer></script>
`;
  html = html.replace('<meta charset="utf-8">', () => '<meta charset="utf-8">\n  <meta name="robots" content="noindex">');
  html = html.replace('</head>', () => `${head}</head>`);

  const tabs = Object.entries(PERSONAS)
    .map(([id, who]) => {
      const dir = resolve(id, who.home);
      if (dir === null) return '';
      return `<a href="${encode(to(dir))}"${id === persona ? ' aria-current="true"' : ''}>${who.label}</a>`;
    })
    .join('');
  const bar = `
  <div class="demo-bar">
    <div class="container demo-bar__row">
      <p><strong>სადემონსტრაციო ვერსია.</strong><span class="demo-bar__more"> ანგარიშები და გადახდა ნამდვილი არ არის, ცვლილებები არ ინახება.</span></p>
      <nav class="demo-bar__as" aria-label="ნახე როგორც"><span>ნახე როგორც:</span>${tabs}</nav>
      ${repoUrl ? `<a class="demo-bar__code" href="${encode(repoUrl)}">კოდი GitHub-ზე</a>` : ''}
    </div>
  </div>`;
  // After the "skip to content" link, so that link stays the first thing a keyboard reaches.
  const skip = /<a class="skip"[^>]*>[\s\S]*?<\/a>/.exec(html);
  if (skip) {
    const at = skip.index + skip[0].length;
    return html.slice(0, at) + bar + html.slice(at);
  }
  return html.replace(/<body\b[^>]*>/, (tag) => tag + bar);
}

/** A sample book page: the platform's "ბიბლიოთეკა" button (via book.js), and noindex. */
function addToBook(text, loader) {
  text = text.replace(/<head\b[^>]*>/i, (tag) => `${tag}\n  <meta name="robots" content="noindex">`);
  const tag = `<script src="${loader}" data-app="${encode(appName)}" defer></script>`;
  let index = -1;
  for (const match of text.matchAll(/<\/body\s*>/gi)) index = match.index;
  return index === -1 ? text + tag : text.slice(0, index) + tag + text.slice(index);
}

// ───────── Small helpers ─────────

function relative(from, target) {
  const isDir = target === '' || target.endsWith('/');
  const rel = path.posix.relative(`/${from}`, `/${target}`);
  if (!isDir) return rel;
  return rel ? `${rel}/` : './';
}

function attr(attrs, name) {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;
}

function decode(text) {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]);
}

function encode(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}
