import { Router } from 'express';
import { config } from '../config.js';
import { db } from '../db.js';
import { getBookBySlug, universitiesByBook } from '../books.js';
import { bookSlugFromHost } from '../bookhost.js';
import { sendPage } from '../middleware.js';
import { ctx } from '../views/layout.js';
import { homePage } from '../views/home.js';
import { pricingPage } from '../views/billing.js';
import { contactPage, privacyPage, refundsPage, termsPage } from '../views/static.js';

export const publicRoutes = Router();

publicRoutes.get('/', (req, res) => {
  if (req.user) return res.redirect(302, '/library');
  const books = db
    .prepare('SELECT * FROM books WHERE is_published = 1 AND content_version > 0 ORDER BY is_free DESC, created_at DESC LIMIT 8')
    .all();
  sendPage(res, homePage(ctx(req), { books, unis: universitiesByBook() }));
});

publicRoutes.get('/pricing', (req, res) => {
  const book = typeof req.query.book === 'string' ? getBookBySlug(req.query.book) : null;
  sendPage(res, pricingPage(ctx(req), { book }));
});

publicRoutes.get('/terms', (req, res) => sendPage(res, termsPage(ctx(req))));
publicRoutes.get('/privacy', (req, res) => sendPage(res, privacyPage(ctx(req))));
publicRoutes.get('/refunds', (req, res) => sendPage(res, refundsPage(ctx(req))));
publicRoutes.get('/contact', (req, res) => sendPage(res, contactPage(ctx(req))));

publicRoutes.get('/healthz', (req, res) => {
  db.prepare('SELECT 1').get();
  res.type('text').send('ok');
});

publicRoutes.get('/robots.txt', (req, res) => {
  res.type('text').send(
    ['User-agent: *', 'Disallow: /library', 'Disallow: /open/', 'Disallow: /account', 'Disallow: /billing/', 'Disallow: /admin', ''].join('\n'),
  );
});

// Caddy "on-demand TLS" asks here before getting a certificate for a host (see deploy/Caddyfile).
publicRoutes.get('/__caddy/ask', (req, res) => {
  const domain = String(req.query.domain || '').toLowerCase();
  if (domain === config.appHost) return res.status(200).end();
  const slug = bookSlugFromHost(domain);
  res.status(slug && getBookBySlug(slug) ? 200 : 404).end();
});
