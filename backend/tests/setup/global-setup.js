/**
 * Jest globalSetup — runs ONCE before any test file.
 *
 * Applies the schema to the test database. Schema is idempotent
 * (CREATE TABLE IF NOT EXISTS …) so re-running between runs is safe and
 * we don't have to drop the database first.
 *
 * This file runs in its own Node process — re-loads env from .env.test.
 */
const path = require('path');
const fs   = require('fs');
const { Client } = require('pg');

module.exports = async () => {
  // Re-load env vars in the globalSetup process (it doesn't share env with
  // the test runner main process by default).
  process.env.NODE_ENV = 'test';
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });
  } catch { /* ok */ }

  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`schema.sql not found at ${schemaPath}`);
  }
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
};
