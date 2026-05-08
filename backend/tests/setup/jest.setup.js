/**
 * setupFilesAfterEach — runs in EACH test file's context.
 * Provides a clean DB state before every individual test.
 *
 * Why TRUNCATE here instead of in beforeAll?
 *   Each test must start from a known-empty DB so order doesn't matter
 *   (running test B alone or after test A must give the same result).
 *   TRUNCATE … RESTART IDENTITY CASCADE wipes rows AND resets serial PKs,
 *   so id=1 always means "first row inserted in this test".
 */
const db = require('../../src/config/database');
const { seedDefaultDepartmentsAndUsers } = require('../fixtures/users');

beforeEach(async () => {
  // CASCADE follows FKs in the right order so we don't have to enumerate
  // dependency order. RESTART IDENTITY makes IDs deterministic.
  await db.query(`
    TRUNCATE TABLE
      audit_logs,
      signatures,
      document_assignments,
      documents,
      users,
      departments
    RESTART IDENTITY CASCADE
  `);
  // Re-seed the minimum fixtures every test needs (an admin and a user).
  await seedDefaultDepartmentsAndUsers();
});
