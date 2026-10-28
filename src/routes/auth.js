import { Router } from 'express';
import { config } from '../config.js';
import { getProgram, universitiesWithPrograms } from '../catalog.js';
import { allow } from '../lib/ratelimit.js';
import { DUMMY_HASH, safeLocalPath, verifyPassword } from '../lib/security.js';
import { sendEmail } from '../lib/email.js';
import { sendPage, setCookie } from '../middleware.js';
import {
  SESSION_COOKIE,
  createPasswordReset,
  createSession,
  createUser,
  deleteSession,
  deleteUserSessions,
  findPasswordReset,
  getUserByEmail,
  markPasswordResetUsed,
  setPassword,
} from '../users.js';
import { ctx } from '../views/layout.js';
import { forgotPage, loginPage, registerPage, resetPage } from '../views/auth.js';

export const authRoutes = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TOO_MANY = 'ძალიან ბევრი მცდელობა. სცადე რამდენიმე წუთში.';

function signIn(req, res, user) {
  const token = createSession(user, req);
  setCookie(res, SESSION_COOKIE, token, { maxAgeMs: config.sessionDays * 24 * 60 * 60 * 1000 });
}

const nextParam = (req) => safeLocalPath(req.query.next, '');

// ───────── Login ─────────

authRoutes.get('/login', (req, res) => {
  if (req.user) return res.redirect(302, nextParam(req) || '/library');
  sendPage(res, loginPage(ctx(req), { next: nextParam(req) }));
});

authRoutes.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const next = nextParam(req);
  const view = (errors, status = 422) => sendPage(res, loginPage(ctx(req), { values: { email }, errors, next }), status);

  if (!allow(`login:ip:${req.ip}`, 30, 15 * 60_000) || !allow(`login:email:${email}`, 8, 15 * 60_000)) {
    return view({ _form: TOO_MANY }, 429);
  }
  const user = getUserByEmail(email);
  const valid = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
  if (!user || !valid) return view({ _form: 'ელ-ფოსტა ან პაროლი არასწორია.' });
  if (user.is_blocked) return res.redirect(303, '/login?err=blocked');

  signIn(req, res, user);
  res.redirect(303, next || '/library');
});

// ───────── Register ─────────

authRoutes.get('/register', (req, res) => {
  if (req.user) return res.redirect(302, '/library');
  sendPage(res, registerPage(ctx(req), { universities: universitiesWithPrograms(), next: nextParam(req) }));
});

authRoutes.post('/register', async (req, res) => {
  const b = req.body || {};
  const values = {
    name: String(b.name || '').trim().replace(/\s+/g, ' '),
    email: String(b.email || '').trim().toLowerCase(),
    university_id: b.university_id,
    program_id: b.program_id,
    terms: b.terms === '1',
  };
  const password = String(b.password || '');
  const next = nextParam(req);
  const errors = {};

  if (values.name.length < 2) errors.name = 'შეიყვანე სახელი და გვარი.';
  else if (values.name.length > 80) errors.name = 'სახელი ძალიან გრძელია.';
  if (!EMAIL_RE.test(values.email) || values.email.length > 254) errors.email = 'შეიყვანე სწორი ელ-ფოსტა.';
  if (password.length < 8) errors.password = 'პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს.';
  else if (password.length > 128) errors.password = 'პაროლი ძალიან გრძელია.';
  const program = getProgram(values.program_id);
  if (!program) errors.program_id = 'აირჩიე უნივერსიტეტი და პროგრამა.';
  if (!values.terms) errors.terms = 'რეგისტრაციისთვის საჭიროა წესებზე თანხმობა.';
  if (!errors.email && getUserByEmail(values.email)) {
    errors.email = 'ეს ელ-ფოსტა უკვე რეგისტრირებულია. სცადე შესვლა ან პაროლის აღდგენა.';
  }
  if (!Object.keys(errors).length && !allow(`register:${req.ip}`, 10, 60 * 60_000)) errors._form = TOO_MANY;

  if (Object.keys(errors).length) {
    return sendPage(res, registerPage(ctx(req), { universities: universitiesWithPrograms(), values, errors, next }), 422);
  }

  const user = await createUser({ name: values.name, email: values.email, password, programId: program.id });
  signIn(req, res, user);
  res.redirect(303, next || '/library?ok=welcome');
});

// ───────── Logout ─────────

authRoutes.post('/logout', (req, res) => {
  if (req.user) deleteSession(req.user.session_id);
  setCookie(res, SESSION_COOKIE, '', { maxAgeMs: 0 });
  res.redirect(303, '/');
});

// ───────── Password reset ─────────

authRoutes.get('/forgot', (req, res) => sendPage(res, forgotPage(ctx(req))));

authRoutes.post('/forgot', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return sendPage(res, forgotPage(ctx(req), { values: { email }, errors: { email: 'შეიყვანე სწორი ელ-ფოსტა.' } }), 422);
  }
  if (!allow(`forgot:ip:${req.ip}`, 10, 60 * 60_000) || !allow(`forgot:email:${email}`, 3, 60 * 60_000)) {
    return sendPage(res, forgotPage(ctx(req), { values: { email }, errors: { _form: TOO_MANY } }), 429);
  }
  const user = getUserByEmail(email);
  if (user && !user.is_blocked) {
    const link = `${config.appUrl}/reset/${createPasswordReset(user.id)}`;
    await sendEmail({
      to: user.email,
      subject: `${config.appName} — პაროლის აღდგენა`,
      text: `გამარჯობა, ${user.name}!\n\nახალი პაროლის დასაყენებლად გადადი ბმულზე (მოქმედებს 1 საათი):\n${link}\n\nთუ პაროლის აღდგენა არ მოგითხოვია, უბრალოდ დააიგნორე ეს წერილი.\n\n${config.appName}`,
    }).catch((err) => console.error('Password reset e-mail failed:', err.message));
  }
  // Same answer whether or not the e-mail exists, so nobody can check who is registered.
  sendPage(res, forgotPage(ctx(req), { values: { email }, sent: true }));
});

authRoutes.get('/reset/:token', (req, res) => {
  if (!findPasswordReset(req.params.token)) return res.redirect(303, '/forgot?err=reset-invalid');
  sendPage(res, resetPage(ctx(req), { token: req.params.token }));
});

authRoutes.post('/reset/:token', async (req, res) => {
  const reset = findPasswordReset(req.params.token);
  if (!reset) return res.redirect(303, '/forgot?err=reset-invalid');
  const password = String(req.body?.password || '');
  const errors = {};
  if (password.length < 8) errors.password = 'პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს.';
  else if (password.length > 128) errors.password = 'პაროლი ძალიან გრძელია.';
  else if (password !== String(req.body?.password2 || '')) errors.password2 = 'პაროლები არ ემთხვევა.';
  if (Object.keys(errors).length) return sendPage(res, resetPage(ctx(req), { token: req.params.token, errors }), 422);

  await setPassword(reset.user_id, password);
  markPasswordResetUsed(reset.id);
  deleteUserSessions(reset.user_id); // sign out everywhere: whoever knew the old password is out
  setCookie(res, SESSION_COOKIE, '', { maxAgeMs: 0 });
  res.redirect(303, '/login?ok=reset');
});
