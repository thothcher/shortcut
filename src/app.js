import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { COVERS_DIR } from './books.js';
import { bookSlugFromHost, handleBookRequest } from './bookhost.js';
import { csrfCheck, loadSession, originCheck, securityHeaders, sendPage } from './middleware.js';
import { publicRoutes } from './routes/public.js';
import { authRoutes } from './routes/auth.js';
import { libraryRoutes } from './routes/library.js';
import { billingRoutes, paymentWebhooks } from './routes/billing.js';
import { accountRoutes } from './routes/account.js';
import { adminRoutes } from './routes/admin.js';
import { apiRoutes } from './routes/api.js';
import { ctx } from './views/layout.js';
import { messagePage } from './views/static.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  // 1. Requests for <slug>.<BOOKS_DOMAIN> are book sites, not platform pages.
  app.use((req, res, next) => {
    const slug = bookSlugFromHost(req.headers.host);
    if (slug === null) return next();
    handleBookRequest(req, res, slug).catch(next);
  });

  // 2. The platform.
  app.use(securityHeaders);
  app.use('/static', express.static(path.join(config.root, 'public'), { maxAge: config.isProd ? '365d' : 0, index: false }));
  app.use('/covers', express.static(COVERS_DIR, { maxAge: '365d', immutable: true, index: false }));

  app.use(paymentWebhooks); // verified by Flitt's signature, so no session/CSRF here
  app.use(apiRoutes); // verified by the bearer token

  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(loadSession);
  app.use(originCheck, csrfCheck);

  app.use(publicRoutes);
  app.use(authRoutes);
  app.use(libraryRoutes);
  app.use(billingRoutes);
  app.use(accountRoutes);
  app.use(adminRoutes);

  app.use((req, res) => {
    sendPage(res, messagePage(ctx(req), { title: 'გვერდი ვერ მოიძებნა', text: 'ბმული შეიძლება მოძველებული იყოს.', iconName: 'search' }), 404);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return;
    const status = err.status || err.statusCode || 500;
    if (status < 500) return res.status(status).type('text').send(err.expose ? err.message : 'Bad request');
    sendPage(res, messagePage(ctx(req), { title: 'რაღაც შეცდომა მოხდა', text: 'სცადე ცოტა ხანში. თუ პრობლემა განმეორდა, მოგვწერე.' }), 500);
  });

  return app;
}
