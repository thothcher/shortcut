// Safe ZIP extraction: blocks "../" paths, caps file count and total size, skips OS junk files.
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

const JUNK = /(^|\/)(__MACOSX|\.git|node_modules)(\/|$)|(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i;
export const isJunkPath = (relPath) => JUNK.test(relPath.replace(/\\/g, '/'));

export function extractZip(zipPath, destDir, { maxFiles = 20_000, maxBytes = 2 * 1024 ** 3 } = {}) {
  const root = path.resolve(destDir);
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openErr, zip) => {
      if (openErr) return reject(new Error('ფაილი ZIP არქივს არ ჰგავს ან დაზიანებულია.'));
      let files = 0;
      let bytes = 0;
      let failed = false;
      const fail = (err) => {
        if (failed) return;
        failed = true;
        zip.close();
        reject(err);
      };

      zip.on('error', fail);
      zip.on('end', () => !failed && resolve({ files, bytes }));
      zip.on('entry', (entry) => {
        const name = entry.fileName; // yauzl already rejected absolute paths and ".." segments
        if (name.endsWith('/') || isJunkPath(name)) return zip.readEntry();

        const target = path.resolve(root, name);
        if (!target.startsWith(root + path.sep)) return fail(new Error(`სახიფათო ფაილის გზა არქივში: ${name}`));
        if (++files > maxFiles) return fail(new Error(`არქივში ზედმეტად ბევრი ფაილია (მაქს. ${maxFiles}).`));
        bytes += entry.uncompressedSize;
        if (bytes > maxBytes) return fail(new Error('გახსნილი არქივი ზედმეტად დიდია.'));

        zip.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) return fail(streamErr);
          fs.promises
            .mkdir(path.dirname(target), { recursive: true })
            .then(() => pipeline(readStream, fs.createWriteStream(target)))
            .then(() => zip.readEntry(), fail);
        });
      });
      zip.readEntry();
    });
  });
}
