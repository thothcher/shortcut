// SQLite database: one file (storage/data.db), no separate server to run.
// Times are stored as integer milliseconds (Date.now()).
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

export const db = new Database(path.join(config.storageDir, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

// Append new migrations to the end of this list. Never edit one that already ran.
const migrations = [
  `
  CREATE TABLE universities (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE programs (
    id INTEGER PRIMARY KEY,
    university_id INTEGER NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    UNIQUE (university_id, name)
  );

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    access_until INTEGER,
    is_blocked INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,               -- sha256 of the cookie token, never the token itself
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    user_agent TEXT,
    ip TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE password_resets (
    id TEXT PRIMARY KEY,               -- sha256 of the token in the e-mail link
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );

  CREATE TABLE books (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    author TEXT,
    description TEXT,
    semester INTEGER,
    cover TEXT,
    base_path TEXT NOT NULL DEFAULT '/',
    is_free INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 0,
    content_version INTEGER NOT NULL DEFAULT 0,   -- 0 means no site uploaded yet
    content_files INTEGER NOT NULL DEFAULT 0,
    content_bytes INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE book_programs (
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, program_id)
  );
  CREATE INDEX book_programs_program ON book_programs(program_id);

  CREATE TABLE book_opens (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    opens INTEGER NOT NULL DEFAULT 1,
    last_opened_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, book_id)
  );

  CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    provider TEXT NOT NULL,            -- flitt | mock | manual
    amount INTEGER NOT NULL,           -- tetri (1000 = 10 GEL)
    currency TEXT NOT NULL,
    days INTEGER NOT NULL,
    status TEXT NOT NULL,              -- created | processing | approved | declined | expired | reversed
    payment_id TEXT,
    checkout_url TEXT,
    granted_at INTEGER,                -- set once, when the days were added to the user
    note TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_checked_at INTEGER,
    raw TEXT
  );
  CREATE INDEX orders_user ON orders(user_id);
  CREATE INDEX orders_status ON orders(status, created_at);

  CREATE TABLE subject_requests (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  `,
];

function migrate() {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

// Starting list. Edit it in the admin panel (Admin → Universities); this only runs on an empty database.
const SEED = [
  {
    code: 'tsu',
    name: 'ივანე ჯავახიშვილის სახელობის თბილისის სახელმწიფო უნივერსიტეტი',
    short: 'თსუ',
    programs: ['ფსიქოლოგია', 'სამართალი', 'ეკონომიკა', 'ბიზნესის ადმინისტრირება', 'ჟურნალისტიკა'],
  },
  {
    code: 'iliauni',
    name: 'ილიას სახელმწიფო უნივერსიტეტი',
    short: 'ილიაუნი',
    programs: ['ფსიქოლოგია', 'სამართალი', 'ბიზნესის ადმინისტრირება', 'კომპიუტერული მეცნიერება'],
  },
  {
    code: 'btu',
    name: 'ბიზნესისა და ტექნოლოგიების უნივერსიტეტი',
    short: 'BTU',
    programs: ['ბიზნესის ადმინისტრირება', 'კომპიუტერული მეცნიერება', 'ინფორმაციული ტექნოლოგიები'],
  },
];

function seed() {
  if (db.prepare('SELECT COUNT(*) AS n FROM universities').get().n > 0) return;
  const addUni = db.prepare('INSERT INTO universities (code, name, short_name, position) VALUES (?, ?, ?, ?)');
  const addProgram = db.prepare('INSERT INTO programs (university_id, name, position) VALUES (?, ?, ?)');
  db.transaction(() => {
    SEED.forEach((u, i) => {
      const uniId = addUni.run(u.code, u.name, u.short, i).lastInsertRowid;
      u.programs.forEach((p, j) => addProgram.run(uniId, p, j));
      addProgram.run(uniId, 'სხვა პროგრამა', 999); // "other program", so nobody is stuck at sign-up
    });
  })();
}

migrate();
seed();
