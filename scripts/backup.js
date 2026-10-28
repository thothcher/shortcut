// Safe online backup of the database:  npm run backup [-- target-folder]
// Book files live in storage/books and storage/covers — copy those too (or sync the whole storage folder).
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../src/config.js';
import { db } from '../src/db.js';

const dir = path.resolve(process.argv[2] || path.join(config.storageDir, 'backups'));
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `data-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
await db.backup(file);
console.log(`Backup written: ${file}`);

// Keep the 14 newest backups in the default folder.
const old = fs.readdirSync(dir).filter((f) => /^data-.*\.db$/.test(f)).sort().slice(0, -14);
for (const f of old) fs.rmSync(path.join(dir, f));
