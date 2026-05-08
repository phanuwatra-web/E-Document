#!/usr/bin/env node
/**
 * Audit log retention cleanup.
 *
 * Deletes rows from audit_logs older than AUDIT_RETENTION_DAYS (default 365).
 * Idempotent — running it twice is harmless. Designed to be invoked from
 * cron (or a Kubernetes CronJob) on a schedule like once a day.
 *
 *   # cron — daily at 03:30
 *   30 3 * * *   node /app/scripts/audit-cleanup.js >> /var/log/audit-cleanup.log 2>&1
 *
 * Why retention at all?
 *   - PDPA: keep personal data only as long as needed for the stated purpose.
 *     Internal audit purpose for general documents = ~1 year is reasonable.
 *   - Performance: rows grow O(actions × days). Clip the tail before it
 *     dominates query plans.
 *
 * Override the window per-run:
 *   AUDIT_RETENTION_DAYS=730 node scripts/audit-cleanup.js
 *
 * Dry-run (count only, no DELETE):
 *   AUDIT_DRY_RUN=1 node scripts/audit-cleanup.js
 */
require('dotenv').config();
const { Client } = require('pg');
const logger = require('../src/config/logger');

const RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS, 10) || 365;
const DRY_RUN        = process.env.AUDIT_DRY_RUN === '1';

(async () => {
  if (!process.env.DATABASE_URL) {
    logger.fatal('DATABASE_URL not set');
    process.exit(1);
  }
  if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS < 30) {
    // 30-day floor — refuse silly values like 0 that would wipe everything.
    logger.fatal({ RETENTION_DAYS },
      'AUDIT_RETENTION_DAYS must be >= 30 (refusing to wipe recent logs)');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // Count first so we always log a meaningful number, even on dry-run.
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM audit_logs
       WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [RETENTION_DAYS]
    );
    const expired = countResult.rows[0].n;

    logger.info({ retentionDays: RETENTION_DAYS, expired, dryRun: DRY_RUN },
      'audit cleanup starting');

    if (expired === 0) {
      logger.info('nothing to delete');
      return;
    }

    if (DRY_RUN) {
      logger.info({ wouldDelete: expired }, 'DRY RUN — no rows deleted');
      return;
    }

    // Delete in one go. The table's index on created_at makes this efficient
    // even at millions of rows. For very large tables we'd batch with LIMIT,
    // but PG doesn't support LIMIT on DELETE without a CTE; cross that bridge
    // when audit_logs > 10M rows (very unlikely for an internal app).
    const delResult = await client.query(
      `DELETE FROM audit_logs
       WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [RETENTION_DAYS]
    );

    logger.info({ deleted: delResult.rowCount }, 'audit cleanup complete');
  } catch (err) {
    logger.error({ err: { message: err.message, code: err.code } },
      'audit cleanup failed');
    process.exit(1);
  } finally {
    await client.end();
  }
})();
