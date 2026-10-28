// Book upload API — lets the PDF→website converter (or a CI script) publish a book without the admin panel.
//
//   curl -X PUT "https://konspekti.ge/api/books/cbt/content?title=CBT&publish=1" \
//        -H "Authorization: Bearer $ADMIN_API_TOKEN" -H "Content-Type: application/zip" \
//        --data-binary @site.zip
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { Router } from 'express';
import { config } from '../config.js';
import { db } from '../db.js';
import { TMP_DIR, UserError, createBook, deleteBook, getBookBySlug, importSite, slugError } from '../books.js';
import { randomToken, safeEqual } from '../lib/security.js';

export const apiRoutes = Router();

function requireToken(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (config.apiToken && config.apiToken.length >= 24 && token && safeEqual(token, config.apiToken)) return next();
  res.status(401).json({ ok: false, error: 'Invalid or missing API token (set ADMIN_API_TOKEN, 24+ characters).' });
}

apiRoutes.put('/api/books/:slug/content', requireToken, async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  let book = getBookBySlug(slug);
  if (!book) {
    const problem = slugError(slug);
    if (problem) return res.status(400).json({ ok: false, error: problem });
  }

  // Stream the request body to a temporary file, with a size limit.
  const limit = config.maxUploadMb * 1024 * 1024;
  const tmp = path.join(TMP_DIR, `api-${randomToken(8)}.zip`);
  let size = 0;
  let created = false;
  try {
    await pipeline(
      req,
      new Transform({
        transform(chunk, _enc, done) {
          size += chunk.length;
          done(size > limit ? new UserError('ZIP is larger than MAX_UPLOAD_MB') : null, chunk);
        },
      }),
      fs.createWriteStream(tmp),
    );
    if (!size) throw new UserError('Empty body: send the ZIP file as the request body');

    if (!book) {
      book = createBook({ slug, title: String(req.query.title || slug).slice(0, 120) });
      created = true;
    }
    const info = await importSite(book, { zipPath: tmp });

    const updates = { updated_at: Date.now() };
    if (req.query.title) updates.title = String(req.query.title).slice(0, 120);
    else if (book.title === slug && info.title) updates.title = info.title.slice(0, 120);
    if (req.query.author) updates.author = String(req.query.author).slice(0, 120);
    if (req.query.publish === '1') updates.is_published = 1;
    if (req.query.free === '1') updates.is_free = 1;
    const sets = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE books SET ${sets} WHERE id = @id`).run({ ...updates, id: book.id });

    res.json({ ok: true, book: { ...getBookBySlug(slug), ...{ detectedTitle: info.title } }, files: info.files, basePath: info.basePath });
  } catch (err) {
    if (created) await deleteBook(book); // don't leave an empty book behind
    const status = err instanceof UserError || /ZIP|არქივ/.test(err.message) ? 400 : 500;
    if (status === 500) console.error('API upload failed:', err);
    res.status(status).json({ ok: false, error: err.message });
  } finally {
    fsp.rm(tmp, { force: true }).catch(() => {});
  }
});
