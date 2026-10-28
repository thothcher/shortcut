// Users, sessions, password resets and the access rules.
import { db } from './db.js';
import { config, DAY } from './config.js';
import { hashPassword, randomToken, sha256 } from './lib/security.js';

export const SESSION_COOKIE = config.secureCookies ? '__Host-sid' : 'sid';

// ───────── Users ─────────

export const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
export const getUserByEmail = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim());

export async function createUser({ name, email, password, programId }) {
  const now = Date.now();
  const id = db
    .prepare('INSERT INTO users (email, name, password_hash, program_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(email.trim().toLowerCase(), name.trim(), await hashPassword(password), programId, now).lastInsertRowid;
  return getUser(id);
}

export async function setPassword(userId, password) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), userId);
}

/** Program + university of a user, for display. */
export function userProgram(user) {
  if (!user?.program_id) return null;
  return db
    .prepare(
      `SELECT p.id, p.name, u.id AS university_id, u.short_name, u.name AS university_name
       FROM programs p JOIN universities u ON u.id = p.university_id WHERE p.id = ?`,
    )
    .get(user.program_id);
}

// ───────── Access ─────────

/** Paid (or admin) access right now? */
export const hasAccess = (user, now = Date.now()) =>
  Boolean(user && (user.role === 'admin' || (user.access_until && user.access_until > now)));

export function canOpenBook(user, book) {
  if (!user || user.is_blocked || !book) return false;
  if (user.role === 'admin') return true; // admins can preview unpublished books
  if (!book.is_published || !book.content_version) return false;
  return Boolean(book.is_free) || hasAccess(user);
}

/** Adds days to a user's access, starting from today or from the current end date if still active. */
export function extendAccess(userId, days, now = Date.now()) {
  const user = getUser(userId);
  const from = Math.max(now, user.access_until || 0);
  const until = from + days * DAY;
  db.prepare('UPDATE users SET access_until = ? WHERE id = ?').run(until, userId);
  return until;
}

// ───────── Sessions ─────────

/** Creates a login session and returns the cookie token. Keeps at most N sessions per user. */
export function createSession(user, req) {
  const token = randomToken(32);
  const now = Date.now();
  db.transaction(() => {
    const keep = Math.max(0, config.maxSessionsPerUser - 1);
    db.prepare(
      `DELETE FROM sessions WHERE user_id = ? AND id NOT IN (
         SELECT id FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT ?)`,
    ).run(user.id, user.id, keep);
    db.prepare(
      `INSERT INTO sessions (id, user_id, csrf, created_at, expires_at, last_seen_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sha256(token),
      user.id,
      randomToken(24),
      now,
      now + config.sessionDays * DAY,
      now,
      String(req.get('user-agent') || '').slice(0, 300),
      req.ip,
    );
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, user.id);
  })();
  return token;
}

/** Session + user for a session id (the sha256 stored in the database). */
export function sessionById(sessionId, now = Date.now()) {
  return db
    .prepare(
      `SELECT s.id AS session_id, s.csrf, s.expires_at, s.last_seen_at, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(sessionId, now);
}

export const sessionByToken = (token) => (token ? sessionById(sha256(token)) : undefined);

/** Sliding expiry: active users stay signed in. Written at most every 10 minutes. */
export function touchSession(row, now = Date.now()) {
  if (now - row.last_seen_at < 10 * 60 * 1000) return false;
  db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(
    now,
    now + config.sessionDays * DAY,
    row.session_id,
  );
  return true;
}

export const deleteSession = (sessionId) => db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
export const deleteUserSessions = (userId, exceptId = '') =>
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, exceptId);
export const userSessions = (userId) =>
  db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC').all(userId);

// ───────── Password reset ─────────

export function createPasswordReset(userId) {
  const token = randomToken(32);
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
  db.prepare('INSERT INTO password_resets (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    userId,
    Date.now() + 60 * 60 * 1000,
  );
  return token;
}

export const findPasswordReset = (token) =>
  db
    .prepare('SELECT * FROM password_resets WHERE id = ? AND used_at IS NULL AND expires_at > ?')
    .get(sha256(String(token)), Date.now());

export const markPasswordResetUsed = (id) =>
  db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(Date.now(), id);

// Housekeeping: drop expired sessions and reset links once an hour.
setInterval(() => {
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM password_resets WHERE expires_at < ?').run(now - DAY);
}, 60 * 60 * 1000).unref();
