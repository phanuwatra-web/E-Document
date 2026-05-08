const { Pool } = require('pg');
const logger   = require('./logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// An idle-client error should NOT crash the whole API.
// Log it and let the pool reconnect on the next query.
pool.on('error', (err) => {
  logger.error({ err: { message: err.message, code: err.code } },
    'unexpected PostgreSQL idle client error');
});

// Verify required columns at startup so we can warn the operator instead of failing
// later inside controllers with a confusing 500.
const verifySchema = async () => {
  const required = [
    { table: 'signatures', column: 'page_num' },
    { table: 'signatures', column: 'x_pct' },
    { table: 'signatures', column: 'y_pct' },
    { table: 'signatures', column: 'width_pct' },
  ];
  try {
    for (const { table, column } of required) {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = $1 AND column_name = $2`,
        [table, column]
      );
      if (r.rowCount === 0) {
        logger.error({ table, column },
          'DB schema out of date — run `npm run migrate`');
      }
    }
  } catch (err) {
    logger.warn({ err: { message: err.message } }, 'schema check skipped');
  }
};
verifySchema();

module.exports = {
  query:     (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  // Exposed for the graceful-shutdown manager. Wraps pool.end() so callers
  // get a single Promise interface and can't accidentally re-create it.
  end:       () => pool.end(),
};
