// Makes an existing user an admin:  npm run make-admin -- you@example.com
// (Register on the site first, then run this on the server.)
import { db } from '../src/db.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run make-admin -- you@example.com');
  process.exit(1);
}
const result = db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email.trim());
if (!result.changes) {
  console.error(`No user with e-mail ${email}. Register on the site first.`);
  process.exit(1);
}
console.log(`${email} is now an admin.`);
