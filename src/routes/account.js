import { Router } from 'express';
import { db } from '../db.js';
import { getProgram, universitiesWithPrograms } from '../catalog.js';
import { verifyPassword } from '../lib/security.js';
import { requireUser, sendPage } from '../middleware.js';
import { deleteUserSessions, getUser, setPassword, userSessions } from '../users.js';
import { ctx } from '../views/layout.js';
import { accountPage } from '../views/account.js';

export const accountRoutes = Router();

function render(req, res, extra = {}, status = 200) {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  sendPage(
    res,
    accountPage(ctx(req), { universities: universitiesWithPrograms(), orders, sessions: userSessions(req.user.id), ...extra }),
    status,
  );
}

accountRoutes.get('/account', requireUser, (req, res) => render(req, res));

accountRoutes.post('/account/profile', requireUser, (req, res) => {
  const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
  const program = getProgram(req.body?.program_id);
  const errors = {};
  if (name.length < 2 || name.length > 80) errors.name = 'შეიყვანე სახელი და გვარი.';
  if (!program) errors.program_id = 'აირჩიე პროგრამა.';
  if (Object.keys(errors).length) return render(req, res, { profileErrors: errors, values: { name } }, 422);
  db.prepare('UPDATE users SET name = ?, program_id = ? WHERE id = ?').run(name, program.id, req.user.id);
  res.redirect(303, '/account?ok=profile');
});

accountRoutes.post('/account/password', requireUser, async (req, res) => {
  const user = getUser(req.user.id);
  const password = String(req.body?.password || '');
  const errors = {};
  if (!(await verifyPassword(String(req.body?.current || ''), user.password_hash))) errors.current = 'მიმდინარე პაროლი არასწორია.';
  if (password.length < 8 || password.length > 128) errors.password = 'პაროლი უნდა შეიცავდეს 8–128 სიმბოლოს.';
  if (Object.keys(errors).length) return render(req, res, { passwordErrors: errors }, 422);
  await setPassword(user.id, password);
  deleteUserSessions(user.id, req.user.session_id); // stay signed in here, sign out everywhere else
  res.redirect(303, '/account?ok=password');
});

accountRoutes.post('/account/sessions', requireUser, (req, res) => {
  deleteUserSessions(req.user.id, req.user.session_id);
  res.redirect(303, '/account?ok=sessions');
});
