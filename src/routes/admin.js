import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { db } from '../db.js';
import {
  BOOKS_DIR,
  TMP_DIR,
  UserError,
  bookProgramIds,
  createBook,
  deleteBook,
  getBook,
  imageType,
  importSite,
  normalizeBasePath,
  removeCover,
  saveCover,
  setBookPrograms,
  slugError,
} from '../books.js';
import { universitiesWithPrograms } from '../catalog.js';
import { grantManually } from '../payments/orders.js';
import { requireAdmin, sendPage } from '../middleware.js';
import { deleteUserSessions, getUser, userProgram, userSessions } from '../users.js';
import { ctx } from '../views/layout.js';
import * as views from '../views/admin.js';
import { messagePage } from '../views/static.js';

export const adminRoutes = Router();
adminRoutes.use('/admin', requireAdmin);

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 200 },
  defParamCharset: 'utf8',
}).single('cover');

const zipUpload = multer({
  dest: TMP_DIR,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  defParamCharset: 'utf8',
}).single('zip');

/** Runs a multer middleware and returns a readable error message instead of throwing. */
function parseUpload(upload, req, res) {
  return new Promise((resolve) => {
    upload(req, res, (err) => {
      if (!err) return resolve(null);
      if (err.code === 'LIMIT_FILE_SIZE') return resolve('ფაილი ძალიან დიდია.');
      resolve('ფაილის ატვირთვა ვერ მოხერხდა.');
    });
  });
}

const notFound = (req, res) => sendPage(res, messagePage(ctx(req), { title: 'ვერ მოიძებნა', iconName: 'search' }), 404);

/** Start of the current month in Tbilisi time (UTC+4, no daylight saving). */
function monthStart() {
  const tbilisi = new Date(Date.now() + 4 * 3600_000);
  return Date.UTC(tbilisi.getUTCFullYear(), tbilisi.getUTCMonth(), 1) - 4 * 3600_000;
}

// ───────── Overview ─────────

adminRoutes.get('/admin', (req, res) => {
  const now = Date.now();
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const month = monthStart();
  const stats = {
    users: one('SELECT COUNT(*) n FROM users').n,
    usersWeek: one('SELECT COUNT(*) n FROM users WHERE created_at > ?', now - 7 * 86_400_000).n,
    active: one("SELECT COUNT(*) n FROM users WHERE role = 'student' AND access_until > ?", now).n,
    revenueMonth: one("SELECT COALESCE(SUM(amount), 0) s FROM orders WHERE status = 'approved' AND provider != 'manual' AND granted_at >= ?", month).s,
    ordersMonth: one("SELECT COUNT(*) n FROM orders WHERE status = 'approved' AND provider != 'manual' AND granted_at >= ?", month).n,
    books: one('SELECT COUNT(*) n FROM books').n,
    booksLive: one('SELECT COUNT(*) n FROM books WHERE is_published = 1 AND content_version > 0').n,
  };
  const recentOrders = db
    .prepare('SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 6')
    .all();
  const topBooks = db
    .prepare(
      `SELECT b.id, b.title, COUNT(o.user_id) AS readers, SUM(o.opens) AS opens
       FROM book_opens o JOIN books b ON b.id = o.book_id GROUP BY b.id ORDER BY readers DESC, opens DESC LIMIT 6`,
    )
    .all();
  sendPage(res, views.overviewPage(ctx(req), { stats, recentOrders, topBooks, requests: latestRequests(6) }));
});

function latestRequests(limit) {
  return db
    .prepare(
      `SELECT r.*, p.name AS program, un.short_name AS uni, u.email
       FROM subject_requests r
       LEFT JOIN programs p ON p.id = r.program_id
       LEFT JOIN universities un ON un.id = p.university_id
       LEFT JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at DESC LIMIT ?`,
    )
    .all(limit);
}

// ───────── Books ─────────

adminRoutes.get('/admin/books', (req, res) => {
  const books = db
    .prepare(
      `SELECT b.*, (SELECT COUNT(*) FROM book_programs bp WHERE bp.book_id = b.id) AS program_count
       FROM books b ORDER BY b.created_at DESC`,
    )
    .all();
  sendPage(res, views.booksPage(ctx(req), { books }));
});

adminRoutes.get('/admin/books/new', (req, res) => {
  sendPage(res, views.bookFormPage(ctx(req), { book: null, universities: universitiesWithPrograms() }));
});

function readBookForm(body, bookId = 0) {
  const values = {
    title: String(body.title || '').trim(),
    slug: String(body.slug || '').trim().toLowerCase(),
    author: String(body.author || '').trim() || null,
    description: String(body.description || '').trim() || null,
    semester: body.semester ? Number(body.semester) : null,
    is_free: body.is_free === '1' ? 1 : 0,
    is_published: body.is_published === '1' ? 1 : 0,
  };
  const known = new Set(db.prepare('SELECT id FROM programs').all().map((p) => p.id));
  const programIds = [].concat(body.program_ids ?? []).map(Number).filter((id) => known.has(id));
  const errors = {};
  if (!values.title || values.title.length > 120) errors.title = 'სათაური სავალდებულოა (მაქს. 120 სიმბოლო).';
  const slugProblem = slugError(values.slug, bookId);
  if (slugProblem) errors.slug = slugProblem;
  if (values.semester !== null && !(Number.isInteger(values.semester) && values.semester >= 1 && values.semester <= 12)) values.semester = null;
  if (values.author && values.author.length > 120) values.author = values.author.slice(0, 120);
  if (values.description && values.description.length > 600) values.description = values.description.slice(0, 600);
  return { values, programIds, errors };
}

adminRoutes.post('/admin/books', async (req, res) => {
  const uploadError = await parseUpload(coverUpload, req, res);
  const { values, programIds, errors } = readBookForm(req.body || {});
  if (uploadError) errors._form = uploadError;
  if (req.file && !imageType(req.file.buffer)) errors._form = 'ყდა უნდა იყოს JPG, PNG, WEBP ან AVIF სურათი.';
  const rerender = (status = 422) =>
    sendPage(res, views.bookFormPage(ctx(req), { book: null, universities: universitiesWithPrograms(), programIds, values, errors }), status);
  if (Object.keys(errors).length) return rerender();

  const book = createBook({ ...values, isFree: values.is_free, isPublished: values.is_published });
  setBookPrograms(book.id, programIds);
  if (req.file) await saveCover(book, req.file.buffer);
  res.redirect(303, `/admin/books/${book.id}?ok=saved`);
});

adminRoutes.get('/admin/books/:id', (req, res) => {
  const book = getBook(req.params.id);
  if (!book) return notFound(req, res);
  sendPage(res, views.bookFormPage(ctx(req), { book, universities: universitiesWithPrograms(), programIds: bookProgramIds(book.id) }));
});

adminRoutes.post('/admin/books/:id', async (req, res) => {
  const book = getBook(req.params.id);
  if (!book) return notFound(req, res);
  const uploadError = await parseUpload(coverUpload, req, res);
  const { values, programIds, errors } = readBookForm(req.body || {}, book.id);
  if (uploadError) errors._form = uploadError;
  if (req.file && !imageType(req.file.buffer)) errors._form = 'ყდა უნდა იყოს JPG, PNG, WEBP ან AVIF სურათი.';

  let coverBuffer = null;
  if (!Object.keys(errors).length && req.file) coverBuffer = req.file.buffer;
  if (Object.keys(errors).length) {
    return sendPage(res, views.bookFormPage(ctx(req), { book, universities: universitiesWithPrograms(), programIds, values, errors }), 422);
  }

  if (values.slug !== book.slug && fs.existsSync(path.join(BOOKS_DIR, book.slug))) {
    await fsp.rename(path.join(BOOKS_DIR, book.slug), path.join(BOOKS_DIR, values.slug));
  }
  db.prepare(
    `UPDATE books SET title = ?, slug = ?, author = ?, description = ?, semester = ?, is_free = ?, is_published = ?, updated_at = ?
     WHERE id = ?`,
  ).run(values.title, values.slug, values.author, values.description, values.semester, values.is_free, values.is_published, Date.now(), book.id);
  setBookPrograms(book.id, programIds);

  const updated = getBook(book.id);
  try {
    if (req.body?.remove_cover === '1') await removeCover(updated);
    if (coverBuffer) await saveCover(getBook(book.id), coverBuffer);
  } catch (err) {
    if (!(err instanceof UserError)) throw err;
    return sendPage(
      res,
      views.bookFormPage(ctx(req), { book: getBook(book.id), universities: universitiesWithPrograms(), programIds, errors: { _form: err.message } }),
      422,
    );
  }
  res.redirect(303, `/admin/books/${book.id}?ok=saved`);
});

adminRoutes.post('/admin/books/:id/content', async (req, res) => {
  const book = getBook(req.params.id);
  if (!book) return notFound(req, res);
  const render = (extra, status = 200) =>
    sendPage(res, views.bookFormPage(ctx(req), { book: getBook(book.id), universities: universitiesWithPrograms(), programIds: bookProgramIds(book.id), ...extra }), status);

  const uploadError = await parseUpload(zipUpload, req, res);
  if (uploadError || !req.file) return render({ uploadError: uploadError || 'აირჩიე ZIP ფაილი.' }, 422);
  try {
    const info = await importSite(book, { zipPath: req.file.path });
    render({ uploadInfo: info });
  } catch (err) {
    console.error('Book upload failed:', err.message);
    render({ uploadError: err instanceof UserError || /ZIP|არქივ/.test(err.message) ? err.message : `ატვირთვა ვერ მოხერხდა: ${err.message}` }, 422);
  } finally {
    fsp.rm(req.file.path, { force: true }).catch(() => {});
  }
});

adminRoutes.post('/admin/books/:id/base-path', (req, res) => {
  const book = getBook(req.params.id);
  if (!book) return notFound(req, res);
  db.prepare('UPDATE books SET base_path = ?, updated_at = ? WHERE id = ?').run(normalizeBasePath(req.body?.base_path), Date.now(), book.id);
  res.redirect(303, `/admin/books/${book.id}?ok=saved`);
});

adminRoutes.post('/admin/books/:id/delete', async (req, res) => {
  const book = getBook(req.params.id);
  if (!book) return notFound(req, res);
  await deleteBook(book);
  res.redirect(303, '/admin/books?ok=deleted');
});

// ───────── Universities & programs ─────────

const isUnique = (err) => String(err?.code).startsWith('SQLITE_CONSTRAINT');

function universitiesView(req, res, error = '', status = 200) {
  const universities = universitiesWithPrograms().map((u) => ({
    ...u,
    programs: u.programs.map((p) => ({
      ...p,
      students: db.prepare('SELECT COUNT(*) n FROM users WHERE program_id = ?').get(p.id).n,
      books: db.prepare('SELECT COUNT(*) n FROM book_programs WHERE program_id = ?').get(p.id).n,
    })),
  }));
  sendPage(res, views.universitiesPage(ctx(req), { universities, error }), status);
}

adminRoutes.get('/admin/universities', (req, res) => universitiesView(req, res));

adminRoutes.post('/admin/universities', (req, res) => {
  const code = String(req.body?.code || '').trim().toLowerCase();
  const shortName = String(req.body?.short_name || '').trim();
  const name = String(req.body?.name || '').trim();
  if (!/^[a-z0-9-]{2,20}$/.test(code) || !shortName || !name) return universitiesView(req, res, 'შეავსე ყველა ველი (კოდი — ლათინური ასოებით).', 422);
  try {
    const position = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 p FROM universities').get().p;
    db.prepare('INSERT INTO universities (code, name, short_name, position) VALUES (?, ?, ?, ?)').run(code, name, shortName, position);
  } catch (err) {
    if (isUnique(err)) return universitiesView(req, res, 'ასეთი კოდით უნივერსიტეტი უკვე არსებობს.', 422);
    throw err;
  }
  res.redirect(303, '/admin/universities?ok=saved');
});

adminRoutes.post('/admin/universities/:id', (req, res) => {
  const shortName = String(req.body?.short_name || '').trim();
  const name = String(req.body?.name || '').trim();
  if (!shortName || !name) return universitiesView(req, res, 'სახელი არ შეიძლება იყოს ცარიელი.', 422);
  db.prepare('UPDATE universities SET short_name = ?, name = ? WHERE id = ?').run(shortName, name, Number(req.params.id));
  res.redirect(303, '/admin/universities?ok=saved');
});

adminRoutes.post('/admin/programs', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const universityId = Number(req.body?.university_id);
  if (!name || !db.prepare('SELECT 1 FROM universities WHERE id = ?').get(universityId)) return universitiesView(req, res, 'შეიყვანე პროგრამის სახელი.', 422);
  try {
    const position = db.prepare("SELECT COALESCE(MAX(position), 0) + 1 p FROM programs WHERE university_id = ? AND name != 'სხვა პროგრამა'").get(universityId).p;
    db.prepare('INSERT INTO programs (university_id, name, position) VALUES (?, ?, ?)').run(universityId, name, position);
  } catch (err) {
    if (isUnique(err)) return universitiesView(req, res, 'ასეთი პროგრამა ამ უნივერსიტეტში უკვე არსებობს.', 422);
    throw err;
  }
  res.redirect(303, '/admin/universities?ok=saved');
});

adminRoutes.post('/admin/programs/:id', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return universitiesView(req, res, 'სახელი არ შეიძლება იყოს ცარიელი.', 422);
  try {
    db.prepare('UPDATE programs SET name = ? WHERE id = ?').run(name, Number(req.params.id));
  } catch (err) {
    if (isUnique(err)) return universitiesView(req, res, 'ასეთი პროგრამა ამ უნივერსიტეტში უკვე არსებობს.', 422);
    throw err;
  }
  res.redirect(303, '/admin/universities?ok=saved');
});

adminRoutes.post('/admin/programs/:id/delete', (req, res) => {
  db.prepare('DELETE FROM programs WHERE id = ?').run(Number(req.params.id));
  res.redirect(303, '/admin/universities?ok=deleted');
});

// ───────── Users ─────────

adminRoutes.get('/admin/users', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const like = `%${q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
  const users = db
    .prepare(
      `SELECT u.*, p.name AS program, un.short_name AS uni FROM users u
       LEFT JOIN programs p ON p.id = u.program_id LEFT JOIN universities un ON un.id = p.university_id
       WHERE (? = '' OR u.email LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')
       ORDER BY u.created_at DESC LIMIT 200`,
    )
    .all(q, like, like);
  const total = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  sendPage(res, views.usersPage(ctx(req), { users, q, total }));
});

adminRoutes.get('/admin/users/:id', (req, res) => {
  const u = getUser(req.params.id);
  if (!u) return notFound(req, res);
  const orders = db.prepare('SELECT o.*, ? AS email FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC').all(u.email, u.id);
  const opens = db.prepare('SELECT COUNT(*) n FROM book_opens WHERE user_id = ?').get(u.id).n;
  sendPage(res, views.userPage(ctx(req), { u, program: userProgram(u), orders, sessions: userSessions(u.id), opens }));
});

adminRoutes.post('/admin/users/:id/grant', (req, res) => {
  const u = getUser(req.params.id);
  if (!u) return notFound(req, res);
  const days = Math.min(365, Math.max(1, Math.floor(Number(req.body?.days) || 0)));
  const note = String(req.body?.note || '').trim().slice(0, 200) || `ხელით დაამატა: ${req.user.email}`;
  grantManually(u, days, note);
  res.redirect(303, `/admin/users/${u.id}?ok=granted`);
});

adminRoutes.post('/admin/users/:id/block', (req, res) => {
  const u = getUser(req.params.id);
  if (!u) return notFound(req, res);
  if (u.id === req.user.id) return res.redirect(303, `/admin/users/${u.id}`);
  const blocked = u.is_blocked ? 0 : 1;
  db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(blocked, u.id);
  if (blocked) deleteUserSessions(u.id);
  res.redirect(303, `/admin/users/${u.id}?ok=saved`);
});

adminRoutes.post('/admin/users/:id/logout', (req, res) => {
  const u = getUser(req.params.id);
  if (!u) return notFound(req, res);
  deleteUserSessions(u.id, u.id === req.user.id ? req.user.session_id : '');
  res.redirect(303, `/admin/users/${u.id}?ok=sessions`);
});

// ───────── Orders & requests ─────────

const ORDER_FILTERS = {
  approved: "o.status = 'approved'",
  created: "o.status IN ('created', 'processing')",
  declined: "o.status IN ('declined', 'expired')",
  reversed: "o.status = 'reversed'",
};

adminRoutes.get('/admin/orders', (req, res) => {
  const status = ORDER_FILTERS[req.query.status] ? String(req.query.status) : '';
  const orders = db
    .prepare(
      `SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id
       ${status ? `WHERE ${ORDER_FILTERS[status]}` : ''} ORDER BY o.created_at DESC LIMIT 300`,
    )
    .all();
  sendPage(res, views.ordersPage(ctx(req), { orders, status }));
});

adminRoutes.get('/admin/requests', (req, res) => {
  sendPage(res, views.requestsPage(ctx(req), { requests: latestRequests(300) }));
});
