// Imports a built book site from a folder or a ZIP file.
//
//   npm run import-book -- <slug> <folder-or-zip> [--title "..."] [--author "..."] [--programs 1,2] [--publish] [--free]
//
// Example (an Angular build made for GitHub Pages):
//   npm run import-book -- cbt ../CBT/dist --title "კოგნიტურ-ბიჰევიორული თერაპია" --publish
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { db } from '../src/db.js';
import { createBook, getBookBySlug, importSite, setBookPrograms, slugError } from '../src/books.js';

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    title: { type: 'string' },
    author: { type: 'string' },
    description: { type: 'string' },
    semester: { type: 'string' },
    programs: { type: 'string' },
    publish: { type: 'boolean', default: false },
    free: { type: 'boolean', default: false },
  },
});

const [slug, source] = positionals;
if (!slug || !source) {
  console.error('Usage: npm run import-book -- <slug> <folder-or-zip> [--title "..."] [--programs 1,2] [--publish] [--free]');
  process.exit(1);
}
const sourcePath = path.resolve(source);
if (!fs.existsSync(sourcePath)) {
  console.error(`Not found: ${sourcePath}`);
  process.exit(1);
}

let book = getBookBySlug(slug);
if (!book) {
  const problem = slugError(slug);
  if (problem) {
    console.error(`Bad slug "${slug}": ${problem}`);
    process.exit(1);
  }
  book = createBook({ slug, title: opts.title || slug });
}

const isZip = fs.statSync(sourcePath).isFile();
const info = await importSite(book, isZip ? { zipPath: sourcePath } : { dir: sourcePath });

const updates = {
  title: opts.title || (book.title === slug && info.title ? info.title : book.title),
  author: opts.author ?? book.author,
  description: opts.description ?? book.description,
  semester: opts.semester ? Number(opts.semester) : book.semester,
  is_published: opts.publish ? 1 : book.is_published,
  is_free: opts.free ? 1 : book.is_free,
};
db.prepare(
  'UPDATE books SET title = @title, author = @author, description = @description, semester = @semester, is_published = @is_published, is_free = @is_free WHERE id = @id',
).run({ ...updates, id: book.id });
if (opts.programs) setBookPrograms(book.id, opts.programs.split(',').map(Number).filter(Boolean));

console.log(`Imported "${updates.title}" as ${slug}: ${info.files} files, base path ${info.basePath}, version v${info.version}`);
