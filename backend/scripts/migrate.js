#!/usr/bin/env node
/**
 * Apply database/schema.sql to the database pointed to by DATABASE_URL.
 * Schema is idempotent (CREATE TABLE IF NOT EXISTS, ALTER TABLE … ADD COLUMN IF NOT EXISTS),
 * so it's safe to run repeatedly.
 *
 * Usage:  node scripts/migrate.js
 *         npm run migrate
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');
const logger = require('../src/config/logger');

const SCHEMA_PATH = path.resolve(__dirname, '..', '..', 'database', 'schema.sql');

(async () => {
  if (!process.env.DATABASE_URL) {
    logger.fatal('DATABASE_URL is not set. Configure backend/.env first.');
    process.exit(1);
  }
  if (!fs.existsSync(SCHEMA_PATH)) {
    logger.fatal({ path: SCHEMA_PATH }, 'schema.sql not found');
    process.exit(1);
  }

  const sql    = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    logger.info({ file: path.basename(SCHEMA_PATH) }, 'running migration');
    await client.query(sql);
    logger.info('migration complete');
  } catch (err) {
    logger.fatal({ err: { message: err.message, code: err.code } }, 'migration failed');
    process.exit(1);
  } finally {
    await client.end();
  }
})();
