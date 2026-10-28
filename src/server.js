import { config, bookOrigin } from './config.js';
import { db } from './db.js';
import { createApp } from './app.js';

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`\n  ${config.appName} is running`);
  console.log(`  Platform:  ${config.appUrl}`);
  console.log(`  Books:     ${bookOrigin('<slug>')}`);
  console.log(`  Payments:  ${config.payments.provider}${config.payments.provider === 'mock' ? ' (test mode, no real money)' : ''}\n`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
