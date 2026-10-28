import { Router } from 'express';
import { db } from '../db.js';
import { booksForProgram, freeBooks, getBookBySlug, recentBooks, recordOpen, universitiesByBook } from '../books.js';
import { getProgram, universitiesWithPrograms } from '../catalog.js';
import { handoffUrl } from '../bookhost.js';
import { allow } from '../lib/ratelimit.js';
import { requireUser, sendPage } from '../middleware.js';
import { canOpenBook } from '../users.js';
import { ctx } from '../views/layout.js';
import { libraryPage } from '../views/library.js';
import { messagePage } from '../views/static.js';

export const libraryRoutes = Router();

libraryRoutes.get('/library', requireUser, (req, res) => {
  const user = req.user;
  const program = getProgram(req.query.program) || getProgram(user.program_id);
  const books = program ? booksForProgram(program.id, { includeHidden: user.role === 'admin' }) : [];
  sendPage(
    res,
    libraryPage(ctx(req), {
      universities: universitiesWithPrograms(),
      program,
      isOwnProgram: program?.id === user.program_id,
      books,
      recent: recentBooks(user.id),
      free: freeBooks(books.map((b) => b.id)),
      unis: universitiesByBook(),
    }),
  );
});

/** Opens a book: checks access, remembers it for "continue studying", signs the user into the book's subdomain. */
libraryRoutes.get('/open/:slug', requireUser, (req, res) => {
  const book = getBookBySlug(req.params.slug);
  const visible = book && book.content_version && (book.is_published || req.user.role === 'admin');
  if (!visible) {
    return sendPage(res, messagePage(ctx(req), { title: 'მასალა ვერ მოიძებნა', text: 'შესაძლოა, წაიშალა ან დროებით დამალულია.', iconName: 'search' }), 404);
  }
  if (!canOpenBook(req.user, book)) return res.redirect(303, `/pricing?book=${encodeURIComponent(book.slug)}`);
  recordOpen(req.user.id, book.id);
  res.redirect(303, handoffUrl(book, req.user, typeof req.query.to === 'string' ? req.query.to : ''));
});

libraryRoutes.post('/requests', requireUser, (req, res) => {
  const text = String(req.body?.text || '').trim().replace(/\s+/g, ' ').slice(0, 300);
  if (text.length >= 2 && allow(`request:${req.user.id}`, 20, 24 * 60 * 60_000)) {
    const program = getProgram(req.body?.program_id);
    db.prepare('INSERT INTO subject_requests (user_id, program_id, text, created_at) VALUES (?, ?, ?, ?)').run(
      req.user.id,
      program?.id ?? req.user.program_id ?? null,
      text,
      Date.now(),
    );
  }
  const program = getProgram(req.body?.program_id);
  res.redirect(303, `/library?ok=request${program && program.id !== req.user.program_id ? `&program=${program.id}` : ''}`);
});
