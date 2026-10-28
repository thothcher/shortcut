// Flitt (https://docs.flitt.com) — hosted checkout ("redirect" integration).
//
// 1. We POST the order to /api/checkout/url and get a checkout_url.
// 2. The student pays on Flitt's page (card / Apple Pay / Google Pay).
// 3. Flitt POSTs the result (JSON) to server_callback_url and sends the student back to response_url.
// Every request and response is signed: sha1(secret | values of all non-empty params sorted by key).
import crypto from 'node:crypto';
import { config } from '../config.js';

const flitt = config.payments.flitt;

export function sign(secret, params) {
  const values = Object.keys(params)
    .filter((k) => k !== 'signature' && k !== 'response_signature_string')
    .filter((k) => params[k] !== null && params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => (typeof params[k] === 'object' ? JSON.stringify(params[k]) : String(params[k])));
  return crypto.createHash('sha1').update([secret, ...values].join('|'), 'utf8').digest('hex');
}

export function verify(secret, params) {
  if (!params || typeof params.signature !== 'string') return false;
  const expected = Buffer.from(sign(secret, params));
  const actual = Buffer.from(params.signature.toLowerCase());
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function call(path, request) {
  request.signature = sign(flitt.secretKey, request);
  const res = await fetch(`${flitt.apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ request }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  const response = data.response || {};
  if (response.response_status !== 'success') {
    throw new Error(`Flitt ${path} failed: ${response.error_code || res.status} ${response.error_message || ''}`.trim());
  }
  return response;
}

/** Creates the order at Flitt and returns the page the student should be sent to. */
export async function createCheckout({ order, user, description, returnUrl, callbackUrl }) {
  const response = await call('/checkout/url', {
    order_id: order.id,
    merchant_id: Number(flitt.merchantId),
    order_desc: description,
    amount: order.amount,
    currency: order.currency,
    response_url: returnUrl,
    server_callback_url: callbackUrl,
    sender_email: user.email,
    product_id: `access-${order.days}d`,
    lang: 'ka',
  });
  if (!response.checkout_url) throw new Error('Flitt did not return checkout_url');
  return { url: response.checkout_url, paymentId: response.payment_id ? String(response.payment_id) : null };
}

/** Asks Flitt for the current status of an order (used when the callback is late). */
export async function fetchStatus(orderId) {
  const response = await call('/status/order_id', { order_id: orderId, merchant_id: Number(flitt.merchantId) });
  if (!verify(flitt.secretKey, response)) throw new Error('Flitt status response has an invalid signature');
  return normalize(response);
}

/** Turns a signed Flitt payload (callback, return or status) into our format. */
export function normalize(payload) {
  return {
    orderId: String(payload.order_id || ''),
    status: String(payload.order_status || ''),
    paymentId: payload.payment_id ? String(payload.payment_id) : null,
    amount: Number(payload.amount),
    currency: String(payload.currency || ''),
    merchantId: String(payload.merchant_id || ''),
  };
}

export const isOurMerchant = (payload) => String(payload.merchant_id) === String(flitt.merchantId);
