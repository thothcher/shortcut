// Orders: one row per payment attempt. Access is added exactly once, when an order becomes "approved".
import crypto from 'node:crypto';
import { db } from '../db.js';
import { config, DAY } from '../config.js';
import { extendAccess, getUser } from '../users.js';

export const getOrder = (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(String(id));

export function createOrder(user, { provider = config.payments.provider, days = config.plan.days, amount = config.plan.amount, note = null } = {}) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const id = `SC-${stamp}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO orders (id, user_id, provider, amount, currency, days, status, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, ?)`,
  ).run(id, user.id, provider, amount, config.plan.currency, days, note, now, now);
  return getOrder(id);
}

export function setCheckout(orderId, { url, paymentId }) {
  db.prepare('UPDATE orders SET checkout_url = ?, payment_id = ?, updated_at = ? WHERE id = ?').run(url, paymentId, Date.now(), orderId);
}

/**
 * Applies a status reported by the payment provider. Safe to call many times with the same data
 * (Flitt retries callbacks, and the browser return + status check can report the same payment).
 *
 *   approved → add the order's days to the user (once)
 *   reversed → take those days back (refund)
 *   anything else → just record it (an approved order is never downgraded)
 */
export const applyStatus = db.transaction((orderId, { status, paymentId = null, amount, currency, raw = null }) => {
  const order = getOrder(orderId);
  if (!order) return { ok: false, reason: 'unknown-order' };
  if (amount !== undefined && (Number(amount) !== order.amount || currency !== order.currency)) {
    return { ok: false, reason: 'amount-mismatch', order };
  }

  const now = Date.now();
  const rawJson = raw ? JSON.stringify(raw).slice(0, 20_000) : order.raw;

  if (order.status === 'reversed') return { ok: true, order };
  if (order.status === 'approved' && status !== 'reversed') return { ok: true, order };

  if (status === 'approved' && !order.granted_at) {
    extendAccess(order.user_id, order.days, now);
    db.prepare('UPDATE orders SET status = ?, payment_id = COALESCE(?, payment_id), granted_at = ?, updated_at = ?, raw = ? WHERE id = ?').run(
      'approved',
      paymentId,
      now,
      now,
      rawJson,
      order.id,
    );
  } else if (status === 'reversed' && order.granted_at) {
    const user = getUser(order.user_id);
    const until = Math.max(now, (user.access_until || now) - order.days * DAY);
    db.prepare('UPDATE users SET access_until = ? WHERE id = ?').run(until, user.id);
    db.prepare('UPDATE orders SET status = ?, updated_at = ?, raw = ? WHERE id = ?').run('reversed', now, rawJson, order.id);
  } else if (['created', 'processing', 'declined', 'expired', 'reversed'].includes(status)) {
    db.prepare('UPDATE orders SET status = ?, payment_id = COALESCE(?, payment_id), updated_at = ?, raw = ? WHERE id = ?').run(
      status,
      paymentId,
      now,
      rawJson,
      order.id,
    );
  }
  return { ok: true, order: getOrder(order.id) };
});

/** Manual access from the admin panel (cash, bank transfer, testers). Recorded as an order for history. */
export function grantManually(user, days, note) {
  const order = createOrder(user, { provider: 'manual', days, amount: 0, note });
  applyStatus(order.id, { status: 'approved' });
  return getOrder(order.id);
}

export const markChecked = (orderId) => db.prepare('UPDATE orders SET last_checked_at = ? WHERE id = ?').run(Date.now(), orderId);
