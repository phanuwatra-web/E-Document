require('dotenv').config();

const logger = require('./config/logger');

// Fail fast if critical env is missing — don't let the server start in a half-broken state.
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  logger.fatal({ missing }, 'missing required environment variables');
  process.exit(1);
}
// JWT_SECRET length: blocking in production (a short secret is brute-forceable
// in minutes). In dev/test we still allow short secrets but warn loudly so
// developers don't ship a weak value by accident.
if (process.env.JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    logger.fatal(
      { length: process.env.JWT_SECRET.length },
      'JWT_SECRET must be at least 32 chars in production. ' +
      'Generate with: openssl rand -hex 32'
    );
    process.exit(1);
  }
  logger.warn('JWT_SECRET is shorter than 32 chars — fine for dev, BLOCKED in production');
}

const app      = require('./app');
const db       = require('./config/database');
const shutdown = require('./lifecycle/shutdown');

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' },
    `DocSign API listening on http://localhost:${PORT}`);
});

// Tune keep-alive so server.close() can drain quickly. Defaults are fine
// but explicit values document intent and survive future Node default changes.
server.keepAliveTimeout = 5_000;
server.headersTimeout   = 6_000;

// Install graceful shutdown LAST, after the server is listening and the DB
// pool exists. This also installs the uncaughtException / unhandledRejection
// handlers — DO NOT register them elsewhere or they'll race.
shutdown.install(server, db);
