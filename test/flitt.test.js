import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { sign, verify } = await import('../src/payments/flitt.js');

test('signature matches the published worked example', () => {
  // https://docs.flitt.com/api/building-signature/ shows signature 91ea7da4… next to a GEL / 1549901 example,
  // but that value was carried over from the older Fondy docs (USD, merchant 1396424). Both checks below
  // use the documented algorithm; a live call to the Flitt sandbox with it returned a checkout_url.
  const params = {
    order_id: 'TestOrder2',
    merchant_id: 1396424,
    order_desc: 'Test payment',
    amount: 1000,
    currency: 'USD',
    server_callback_url: 'http://myshop/callback/',
  };
  assert.equal(sign('test', params), '91ea7da493a8367410fe3d7f877fb5e0ed666490');
  assert.equal(sign('test', { ...params, merchant_id: 1549901, currency: 'GEL' }), 'cd0edb710cbbdb6c2a4d965cdb91fdfabc343215');
});

test('empty values are skipped, zero is kept, signature fields are ignored', () => {
  const base = { a: 'x', b: 0 };
  const withExtras = { ...base, c: '', d: null, signature: 'zzz', response_signature_string: 'yyy' };
  assert.equal(sign('k', withExtras), sign('k', base));
  assert.notEqual(sign('k', { a: 'x' }), sign('k', base));
});

test('verify accepts a correctly signed callback and rejects a tampered one', () => {
  const payload = { order_id: 'KP-1', merchant_id: '1549901', amount: '1000', currency: 'GEL', order_status: 'approved' };
  payload.signature = sign('test', payload);
  assert.equal(verify('test', payload), true);
  assert.equal(verify('test', { ...payload, amount: '1' }), false);
  assert.equal(verify('wrong-key', payload), false);
  assert.equal(verify('test', { ...payload, signature: undefined }), false);
});
