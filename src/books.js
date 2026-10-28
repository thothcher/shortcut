// Books: database queries plus the files of each book site on disk.
//
// Disk layout:  storage/books/<slug>/v<N>/index.html ...   (N = content_version)
// Uploading a new version extracts to v<N+1>, switches the database row, then deletes v<N>.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';
import { extractZip, isJunkPath } from './lib/zip.js';
import { randomToken } from './lib/security.js';

export const BOOKS_DIR = path.join(config.storageDir, 'books');
export const COVERS_DIR = path.join(config.storageDir, 'covers');
export const TMP_DIR = path.join(config.storageDir, 'tmp');
for (const dir of [BOOKS_DIR, COVERS_DIR, TMP_DIR]) fs.mkdirSync(dir, { recursive: true });

/** A user-facing error (shown in the admin form instead of a 500 page). */
export class UserError extends Error {}

// ───────── Slugs ─────────

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
// The slug becomes a subdomain (<slug>.konspekti.ge), so names used by the platform itself are blocked.
const RESERVED = new Set(
  'www app api admin mail smtp static cdn assets read books help support blog docs status dev test staging localhost'.split(' '),
);

export function slugError(slug, ignoreBookId = 0) {
  if (!SLUG_RE.test(slug)) return 'მხოლოდ ლათინური პატარა ასოები, ციფრები და ტირე (მაგ. cbt ან social-psychology).';
  if (RESERVED.has(slug)) return 'ეს სახელი დაკავებულია პლატფორმისთვის, აირჩიე სხვა.';
  const taken = db.prepare('SELECT id FROM books WHERE slug = ? AND id != ?').get(slug, ignoreBookId);
  if (taken) return 'ასეთი მისამართით წიგნი უკვე არსებობს.';
  return null;
}

// ───────── Queries ─────────

export const getBook = (id) => db.prepare('SELECT * FROM books WHERE id = ?').get(id);
export const getBookBySlug = (slug) => db.prepare('SELECT * FROM books WHERE slug = ?').get(slug);

const VISIBLE = 'b.is_published = 1 AND b.content_version > 0';

export function booksForProgram(programId, { includeHidden = false } = {}) {
  return db
    .prepare(
      `SELECT b.* FROM books b JOIN book_programs bp ON bp.book_id = b.id
       WHERE bp.program_id = ? ${includeHidden ? '' : `AND ${VISIBLE}`}
       ORDER BY COALESCE(b.semester, 99), b.title`,
    )
    .all(programId);
}

export function freeBooks(excludeIds = []) {
  const rows = db.prepare(`SELECT b.* FROM books b WHERE ${VISIBLE} AND b.is_free = 1 ORDER BY b.title`).all();
  return rows.filter((b) => !excludeIds.includes(b.id));
}

export function recentBooks(userId, limit = 4) {
  return db
    .prepare(
      `SELECT b.* FROM book_opens o JOIN books b ON b.id = o.book_id
       WHERE o.user_id = ? AND ${VISIBLE} ORDER BY o.last_opened_at DESC LIMIT ?`,
    )
    .all(userId, limit);
}

export function recordOpen(userId, bookId) {
  db.prepare(
    `INSERT INTO book_opens (user_id, book_id, opens, last_opened_at) VALUES (?, ?, 1, ?)
     ON CONFLICT (user_id, book_id) DO UPDATE SET opens = opens + 1, last_opened_at = excluded.last_opened_at`,
  ).run(userId, bookId, Date.now());
}

/** University short names per book, e.g. "თსუ · ილიაუნი" (for the card meta line). */
export function universitiesByBook() {
  const rows = db
    .prepare(
      `SELECT bp.book_id, GROUP_CONCAT(DISTINCT u.short_name) AS unis
       FROM book_programs bp JOIN programs p ON p.id = bp.program_id JOIN universities u ON u.id = p.university_id
       GROUP BY bp.book_id`,
    )
    .all();
  return new Map(rows.map((r) => [r.book_id, r.unis.split(',').join(' · ')]));
}

export const bookProgramIds = (bookId) =>
  db.prepare('SELECT program_id FROM book_programs WHERE book_id = ?').all(bookId).map((r) => r.program_id);

export function setBookPrograms(bookId, programIds) {
  db.transaction(() => {
    db.prepare('DELETE FROM book_programs WHERE book_id = ?').run(bookId);
    const add = db.prepare('INSERT OR IGNORE INTO book_programs (book_id, program_id) VALUES (?, ?)');
    for (const id of programIds) add.run(bookId, id);
  })();
}

export function createBook({ slug, title, author = null, description = null, semester = null, isFree = 0, isPublished = 0 }) {
  const now = Date.now();
  const id = db
    .prepare(
      `INSERT INTO books (slug, title, author, description, semester, is_free, is_published, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(slug, title, author, description, semester, isFree ? 1 : 0, isPublished ? 1 : 0, now, now).lastInsertRowid;
  return getBook(id);
}

export async function deleteBook(book) {
  db.prepare('DELETE FROM books WHERE id = ?').run(book.id);
  await fsp.rm(path.join(BOOKS_DIR, book.slug), { recursive: true, force: true }).catch(() => {});
  if (book.cover) await fsp.rm(path.join(COVERS_DIR, book.cover), { force: true }).catch(() => {});
}

// ───────── Site files ─────────

export const contentDir = (book) => path.join(BOOKS_DIR, book.slug, `v${book.content_version}`);

/**
 * Imports a built website (a ZIP file or a folder) as the new content of a book.
 * Accepts the build folder at any depth (e.g. a ZIP of "dist" with dist/app/browser/index.html inside).
 */
export async function importSite(book, { zipPath, dir }) {
  const work = await fsp.mkdtemp(path.join(TMP_DIR, `${book.slug}-`));
  try {
    if (zipPath) {
      await extractZip(zipPath, work, { maxBytes: Math.max(1024, config.maxUploadMb * 4) * 1024 * 1024 });
    } else {
      await fsp.cp(dir, work, { recursive: true, filter: (src) => !isJunkPath(path.relative(dir, src)) });
    }

    const siteRoot = await findSiteRoot(work);
    const info = await inspectSite(siteRoot);

    const version = book.content_version + 1;
    const target = path.join(BOOKS_DIR, book.slug, `v${version}`);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.rm(target, { recursive: true, force: true });
    await moveDir(siteRoot, target);

    db.prepare(
      'UPDATE books SET content_version = ?, base_path = ?, content_files = ?, content_bytes = ?, updated_at = ? WHERE id = ?',
    ).run(version, info.basePath, info.files, info.bytes, Date.now(), book.id);

    if (!book.cover && info.coverFile) await saveCover(book, await fsp.readFile(path.join(target, info.coverFile)));
    removeOldVersions(book.slug, version);
    return { ...info, version };
  } finally {
    await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Finds the shallowest folder that has an index.html and is a build output (not project source code). */
async function findSiteRoot(dir) {
  let level = [dir];
  let sawSource = false;
  for (let depth = 0; depth < 5 && level.length; depth++) {
    const next = [];
    for (const current of level) {
      const index = path.join(current, 'index.html');
      if (fs.existsSync(index)) {
        const text = await fsp.readFile(index, 'utf8');
        // Vite/CRA source folders have an index.html that points at /src/main.tsx etc.
        if (/<script[^>]+src=["'][^"']*\.(tsx?|jsx)["']/i.test(text) || /src=["']\/src\//i.test(text)) sawSource = true;
        else return current;
      }
      const entries = await fsp.readdir(current, { withFileTypes: true });
      for (const e of entries) if (e.isDirectory() && !isJunkPath(e.name)) next.push(path.join(current, e.name));
    }
    level = next.sort();
  }
  throw new UserError(
    sawSource
      ? 'ეს პროექტის საწყისი კოდია და არა build. გაუშვი `npm run build` და ატვირთე მიღებული საქაღალდე (dist, out ან build).'
      : 'არქივში index.html ვერ მოიძებნა. ატვირთე საიტის build საქაღალდე (dist, out ან build), რომელშიც index.html დევს.',
  );
}

async function inspectSite(siteRoot) {
  const indexHtml = await fsp.readFile(path.join(siteRoot, 'index.html'), 'utf8');
  const rootEntries = new Set(await fsp.readdir(siteRoot));
  let files = 0;
  let bytes = 0;
  for (const entry of await fsp.readdir(siteRoot, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      files++;
      bytes += (await fsp.stat(path.join(entry.parentPath, entry.name))).size;
    }
  }
  const coverFile = ['cover.webp', 'cover.jpg', 'cover.jpeg', 'cover.png'].find((f) => rootEntries.has(f)) || null;
  return {
    basePath: detectBasePath(indexHtml, (rel) => fs.existsSync(path.join(siteRoot, rel))),
    title: extractTitle(indexHtml),
    files,
    bytes,
    coverFile,
  };
}

/**
 * Works out which URL path a build expects to live at.
 *   <base href="/CBT/">                      → "/CBT/"   (Angular built for GitHub Pages)
 *   href="/body-lang/_next/static/x.css"     → "/body-lang/" (Next.js basePath)
 *   href="/assets/x.js" or relative "css/x"  → "/"
 * `exists(relPath)` tells whether a file exists inside the site folder.
 */
export function detectBasePath(indexHtml, exists) {
  const baseTag = indexHtml.match(/<base\s[^>]*href\s*=\s*["']([^"']*)["']/i);
  if (baseTag) {
    const href = baseTag[1].trim();
    return href.startsWith('/') && !href.startsWith('//') ? normalizeBasePath(href) : '/';
  }
  const paths = [...indexHtml.matchAll(/\b(?:src|href)\s*=\s*["'](\/(?!\/)[^"'?#]*)/gi)].map((m) => m[1]);
  const votes = new Map();
  for (const p of paths) {
    const [, first, ...rest] = p.split('/');
    if (!first || exists(first) || !rest.length) continue; // already resolves at the root
    if (exists(rest.join('/'))) votes.set(first, (votes.get(first) || 0) + 1);
  }
  const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? `/${best[0]}/` : '/';
}

export function normalizeBasePath(value) {
  const parts = String(value || '').split('/').filter(Boolean);
  return parts.length ? `/${parts.join('/')}/` : '/';
}

function extractTitle(indexHtml) {
  const m = indexHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!m) return '';
  return m[1]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}

/** rename() can fail on Windows while antivirus scans fresh files; retry, then fall back to copy. */
async function moveDir(from, to) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fsp.rename(from, to);
    } catch (err) {
      if (!['EPERM', 'EBUSY', 'EACCES', 'EXDEV'].includes(err.code)) throw err;
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }
  await fsp.cp(from, to, { recursive: true });
}

function removeOldVersions(slug, keepVersion) {
  const dir = path.join(BOOKS_DIR, slug);
  for (const name of fs.readdirSync(dir)) {
    if (/^v\d+$/.test(name) && name !== `v${keepVersion}`) {
      // Small delay so requests that already started on the old version can finish.
      setTimeout(() => fsp.rm(path.join(dir, name), { recursive: true, force: true }).catch(() => {}), 30_000).unref();
    }
  }
}

// ───────── Covers ─────────

export function imageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (buf.length > 12 && buf.toString('latin1', 4, 8) === 'ftyp' && /^avi[fs]$/.test(buf.toString('latin1', 8, 12))) return 'avif';
  return null;
}

export async function saveCover(book, buffer) {
  const ext = imageType(buffer);
  if (!ext) throw new UserError('ყდა უნდა იყოს JPG, PNG, WEBP ან AVIF სურათი.');
  const name = `${book.slug}-${randomToken(6)}.${ext}`;
  await fsp.writeFile(path.join(COVERS_DIR, name), buffer);
  db.prepare('UPDATE books SET cover = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), book.id);
  if (book.cover) await fsp.rm(path.join(COVERS_DIR, book.cover), { force: true }).catch(() => {});
  return name;
}

export async function removeCover(book) {
  if (!book.cover) return;
  db.prepare('UPDATE books SET cover = NULL, updated_at = ? WHERE id = ?').run(Date.now(), book.id);
  await fsp.rm(path.join(COVERS_DIR, book.cover), { force: true }).catch(() => {});
}
