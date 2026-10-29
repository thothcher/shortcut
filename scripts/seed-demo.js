// Demo data so the platform works right after cloning:  npm run seed
// Builds the sample books in examples/books/*.json with the tiny engine in examples/book-template,
// and creates three accounts. Safe to run again (books get a new version, existing accounts are kept).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { db } from '../src/db.js';
import { createBook, getBookBySlug, importSite, setBookPrograms } from '../src/books.js';
import { createUser, getUserByEmail } from '../src/users.js';
import { grantManually } from '../src/payments/orders.js';

if (config.isProd) {
  console.error('Demo data is for development only (NODE_ENV=production is set).');
  process.exit(1);
}

const examples = path.join(config.root, 'examples');

/** "all" or [{ university: 'btu', program: 'კომპიუტერული მეცნიერება' }] → program ids */
function programIds(spec) {
  if (spec === 'all') return db.prepare('SELECT id FROM programs').all().map((r) => r.id);
  const find = db.prepare('SELECT p.id FROM programs p JOIN universities u ON u.id = p.university_id WHERE u.code = ? AND p.name = ?');
  return spec.map(({ university, program }) => find.get(university, program)?.id).filter(Boolean);
}

// ── Books ──
const booksDir = path.join(examples, 'books');
for (const file of fs.readdirSync(booksDir).filter((f) => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(booksDir, file), 'utf8'));
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'shortcut-book-'));
  try {
    await fsp.cp(path.join(examples, 'book-template'), work, { recursive: true });
    await fsp.cp(path.join(config.root, 'public', 'fonts'), path.join(work, 'fonts'), { recursive: true });
    await fsp.writeFile(path.join(work, 'book.json'), JSON.stringify(data, null, 2));

    const book = getBookBySlug(data.slug) || createBook({ slug: data.slug, title: data.title });
    const info = await importSite(book, { dir: work });
    db.prepare('UPDATE books SET title = ?, author = ?, description = ?, is_free = ?, is_published = 1, updated_at = ? WHERE id = ?').run(
      data.title,
      data.author,
      data.description,
      data.free ? 1 : 0,
      Date.now(),
      book.id,
    );
    setBookPrograms(book.id, programIds(data.programs));
    console.log(`Book: ${data.title} (${data.slug}, ${info.files} files${data.free ? ', free' : ''})`);
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
  }
}

// ── Accounts ──
const [btuCs] = programIds([{ university: 'btu', program: 'კომპიუტერული მეცნიერება' }]);
const [tsuPsychology] = programIds([{ university: 'tsu', program: 'ფსიქოლოგია' }]);
const accounts = [
  { email: 'admin@shortcut.local', password: 'shortcut-admin', name: 'ადმინისტრატორი', programId: btuCs, admin: true },
  { email: 'student@shortcut.local', password: 'shortcut-demo', name: 'ნინო ბერიძე', programId: btuCs, days: 30 },
  { email: 'new@shortcut.local', password: 'shortcut-demo', name: 'ლუკა კაპანაძე', programId: tsuPsychology },
];
for (const a of accounts) {
  if (getUserByEmail(a.email)) {
    console.log(`Account already exists: ${a.email}`);
    continue;
  }
  const user = await createUser({ name: a.name, email: a.email, password: a.password, programId: a.programId });
  if (a.admin) db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
  if (a.days) grantManually(user, a.days, 'სადემონსტრაციო წვდომა');
  console.log(`Account: ${a.email} / ${a.password}${a.admin ? '  (admin)' : a.days ? `  (${a.days} days of access)` : '  (no access yet)'}`);
}

console.log('\nDone. Start the site with  npm run dev  and open http://localhost:3000');
