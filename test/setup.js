// Point the app at a throw-away storage folder before any module touches the database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'shortcut-test-'));
