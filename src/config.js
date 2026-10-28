// All settings come from environment variables (see .env.example).
// Defaults are chosen so `npm run dev` works with zero configuration.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const env = process.env;
const root = path.resolve(import.meta.dirname, '..');
const isProd = env.NODE_ENV === 'production';
const port = Number(env.PORT || 3000);

const appUrl = new URL(env.APP_URL || `http://localhost:${port}`);
const storageDir = path.resolve(root, env.STORAGE_DIR || 'storage');
fs.mkdirSync(storageDir, { recursive: true });

// Books are served from their own subdomain: <slug>.<BOOKS_DOMAIN>.
// Every book site then lives at the root of its own origin, so builds made with
// Next.js, Angular, Vite or plain HTML work without being rebuilt.
const booksDomain = (env.BOOKS_DOMAIN || appUrl.host).toLowerCase();

function loadSecret() {
  if (env.SESSION_SECRET) {
    if (env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
    return env.SESSION_SECRET;
  }
  if (isProd) throw new Error('Set SESSION_SECRET in production (any random string, 32+ characters)');
  // Development: create one secret and keep it, so restarts do not log everybody out.
  const file = path.join(storageDir, '.dev-secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(file, 'utf8').trim();
}

const flittMerchantId = (env.FLITT_MERCHANT_ID || '').trim();
const paymentProvider = (env.PAYMENT_PROVIDER || (flittMerchantId ? 'flitt' : 'mock')).toLowerCase();
if (isProd && paymentProvider === 'mock') {
  throw new Error('PAYMENT_PROVIDER=mock is for development only. Configure Flitt for production.');
}

export const config = {
  root,
  isProd,
  port,
  appName: env.APP_NAME || 'Konspekti',
  appUrl: appUrl.origin,
  appHost: appUrl.host.toLowerCase(),
  protocol: appUrl.protocol,
  secureCookies: appUrl.protocol === 'https:',
  booksDomain,
  storageDir,
  secret: loadSecret(),
  trustProxy: env.TRUST_PROXY ? (/^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY) : false,

  // One plan: pay once, get N days. 1000 tetri = 10 GEL.
  plan: {
    amount: Number(env.PRICE_TETRI || 1000),
    currency: 'GEL',
    days: Number(env.ACCESS_DAYS || 30),
  },

  // A new login on a 3rd device signs out the oldest one (limits account sharing).
  maxSessionsPerUser: Number(env.MAX_SESSIONS_PER_USER || 2),
  sessionDays: 30,
  watermark: env.WATERMARK !== 'off',
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 400),

  payments: {
    provider: paymentProvider, // 'flitt' | 'mock'
    flitt: {
      merchantId: flittMerchantId,
      secretKey: (env.FLITT_SECRET_KEY || '').trim(),
      apiBase: env.FLITT_API_BASE || 'https://pay.flitt.com/api',
      checkoutHost: 'https://pay.flitt.com',
    },
  },

  email: {
    resendApiKey: env.RESEND_API_KEY || '',
    from: env.EMAIL_FROM || `${env.APP_NAME || 'Konspekti'} <no-reply@${appUrl.hostname}>`,
  },

  // Shown in the footer, legal pages and receipts. Flitt asks for these before approving a merchant.
  company: {
    name: env.COMPANY_NAME || '[კომპანიის / ი/მ-ის სახელი]',
    idCode: env.COMPANY_ID || '[საიდენტიფიკაციო კოდი]',
    address: env.COMPANY_ADDRESS || '[იურიდიული მისამართი]',
    email: env.CONTACT_EMAIL || 'support@example.ge',
    phone: env.CONTACT_PHONE || '[ტელეფონი]',
  },

  // Bearer token for the book upload API (lets the PDF converter publish books automatically).
  apiToken: env.ADMIN_API_TOKEN || '',
};

if (config.payments.provider === 'flitt' && (!config.payments.flitt.merchantId || !config.payments.flitt.secretKey)) {
  throw new Error('PAYMENT_PROVIDER=flitt needs FLITT_MERCHANT_ID and FLITT_SECRET_KEY');
}

export const DAY = 24 * 60 * 60 * 1000;

/** Origin of a book site, e.g. https://cbt.konspekti.ge */
export const bookOrigin = (slug) => `${config.protocol}//${slug}.${config.booksDomain}`;
