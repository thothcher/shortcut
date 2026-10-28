import express, { Router } from 'express';
import { config } from '../config.js';
import * as flitt from '../payments/flitt.js';
import { applyStatus, createOrder, getOrder, markChecked, setCheckout } from '../payments/orders.js';
import { allow } from '../lib/ratelimit.js';
import { requireUser, sendPage } from '../middleware.js';
import { getUser } from '../users.js';
import { ctx } from '../views/layout.js';
import { mockCheckoutPage, orderPage, pricingPage } from '../views/billing.js';
import { messagePage } from '../views/static.js';

// Routes that Flitt calls. Mounted before the CSRF checks: they are verified by Flitt's signature instead.
export const paymentWebhooks = Router();
const parseAny = [express.json({ limit: '200kb' }), express.urlencoded({ extended: false, limit: '200kb' })];

/** Server-to-server callback with the payment result (Flitt retries until it gets HTTP 200). */
paymentWebhooks.post('/api/payments/flitt/callback', parseAny, (req, res) => {
  const payload = req.body || {};
  if (config.payments.provider !== 'flitt' || !flitt.verify(config.payments.flitt.secretKey, payload) || !flitt.isOurMerchant(payload)) {
    console.warn('Flitt callback rejected (bad signature or merchant)', payload.order_id);
    return res.status(400).type('text').send('invalid signature');
  }
  const p = flitt.normalize(payload);
  const result = applyStatus(p.orderId, { status: p.status, paymentId: p.paymentId, amount: p.amount, currency: p.currency, raw: payload });
  if (!result.ok) console.warn('Flitt callback not applied:', result.reason, p.orderId);
  res.type('text').send('OK');
});

/** Where Flitt sends the student back after paying (POST or GET). */
paymentWebhooks.all('/billing/return', parseAny, (req, res) => {
  const payload = req.method === 'POST' ? req.body || {} : {};
  let orderId = String(req.query.order || payload.order_id || '');
  if (payload.signature && config.payments.provider === 'flitt' && flitt.verify(config.payments.flitt.secretKey, payload) && flitt.isOurMerchant(payload)) {
    const p = flitt.normalize(payload);
    applyStatus(p.orderId, { status: p.status, paymentId: p.paymentId, amount: p.amount, currency: p.currency, raw: payload });
    orderId = p.orderId;
  }
  res.redirect(303, orderId ? `/billing/orders/${encodeURIComponent(orderId)}` : '/library');
});

// ───────── Signed-in billing pages ─────────

export const billingRoutes = Router();

billingRoutes.post('/billing/checkout', requireUser, async (req, res) => {
  const user = req.user;
  if (req.body?.consent !== '1') {
    return sendPage(res, pricingPage(ctx(req), { error: 'გადახდისთვის მონიშნე თანხმობის ველი.' }), 422);
  }
  if (!allow(`checkout:${user.id}`, 10, 60 * 60_000)) {
    return sendPage(res, pricingPage(ctx(req), { error: 'ძალიან ბევრი მცდელობა. სცადე მოგვიანებით.' }), 429);
  }
  const order = createOrder(user);

  if (config.payments.provider === 'mock') return res.redirect(303, `/billing/mock/${order.id}`);

  try {
    const checkout = await flitt.createCheckout({
      order,
      user,
      description: `${config.appName} — წვდომა ${order.days} დღით`,
      returnUrl: `${config.appUrl}/billing/return?order=${order.id}`,
      callbackUrl: `${config.appUrl}/api/payments/flitt/callback`,
    });
    setCheckout(order.id, checkout);
    res.redirect(303, checkout.url);
  } catch (err) {
    console.error('Flitt checkout failed:', err.message);
    sendPage(res, pricingPage(ctx(req), { error: 'გადახდის გვერდი ვერ გაიხსნა. სცადე ცოტა ხანში.' }), 502);
  }
});

function ownOrder(req, res) {
  const order = getOrder(req.params.id);
  if (!order || (order.user_id !== req.user.id && req.user.role !== 'admin')) {
    sendPage(res, messagePage(ctx(req), { title: 'შეკვეთა ვერ მოიძებნა', iconName: 'search' }), 404);
    return null;
  }
  return order;
}

billingRoutes.get('/billing/orders/:id', requireUser, async (req, res) => {
  let order = ownOrder(req, res);
  if (!order) return;

  // The callback usually arrives within seconds. If not, ask Flitt directly (at most every 5 s).
  const pending = order.status === 'created' || order.status === 'processing';
  if (pending && order.provider === 'flitt' && Date.now() - (order.last_checked_at || 0) > 5000) {
    markChecked(order.id);
    try {
      const status = await flitt.fetchStatus(order.id);
      if (status.orderId === order.id) {
        applyStatus(order.id, { status: status.status, paymentId: status.paymentId, amount: status.amount, currency: status.currency });
      }
    } catch (err) {
      console.warn('Flitt status check failed:', err.message);
    }
    order = getOrder(order.id);
  }
  const waitedTooLong = Date.now() - order.created_at > 3 * 60_000;
  sendPage(res, orderPage(ctx(req), { order, user: getUser(order.user_id), waitedTooLong }));
});

// Fake checkout for development (PAYMENT_PROVIDER=mock). Not available once Flitt is configured.
billingRoutes.get('/billing/mock/:id', requireUser, (req, res) => {
  if (config.payments.provider !== 'mock') return res.status(404).end();
  const order = ownOrder(req, res);
  if (order) sendPage(res, mockCheckoutPage(ctx(req), { order }));
});

billingRoutes.post('/billing/mock/:id', requireUser, (req, res) => {
  if (config.payments.provider !== 'mock') return res.status(404).end();
  const order = ownOrder(req, res);
  if (!order) return;
  applyStatus(order.id, { status: req.body?.result === 'approved' ? 'approved' : 'declined', paymentId: `mock-${Date.now()}` });
  res.redirect(303, `/billing/orders/${order.id}`);
});
