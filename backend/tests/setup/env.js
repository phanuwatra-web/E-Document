/**
 * Runs in `setupFiles` — BEFORE the test framework or any app code loads.
 * Responsibilities:
 *   1. Force NODE_ENV=test so app.js disables rate limits, cookies allow
 *      plain HTTP, etc.
 *   2. Load .env.test if present (otherwise rely on the surrounding env,
 *      which is what CI uses).
 *   3. Mute pino — verbose access logs would drown the test reporter.
 *   4. Refuse to run if DATABASE_URL doesn't look like a test database.
 *      This is the LAST line of defence against accidentally truncating
 *      a real database.
 */
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

// Best-effort load of .env.test; CI typically injects env directly so a
// missing file is not fatal.
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });
} catch { /* dotenv missing or no file — that's fine */ }

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set for tests. Copy .env.test.example to .env.test ' +
    'or pass DATABASE_URL via the environment.'
  );
}

// Hard guard: refuse to touch any database whose name does not contain "test".
// Truncates run before EVERY test — pointing this at a real DB would erase
// live data within seconds.
const dbName = (() => {
  try { return new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ''); }
  catch { return ''; }
})();
if (!/test/i.test(dbName)) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL points at "${dbName}" which does not ` +
    `contain "test". Create a dedicated test database (e.g. docsign_test).`
  );
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long-for-tests';
}
