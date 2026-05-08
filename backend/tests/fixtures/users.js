/**
 * Test fixtures — known seed data each test starts with.
 *
 * Credentials are documented constants so test files can refer to them
 * by name (CREDS.admin.password) instead of hardcoding strings.
 */
const bcrypt = require('bcrypt');
const db     = require('../../src/config/database');

const CREDS = Object.freeze({
  admin: { employee_id: 'TEST-ADMIN', password: 'AdminP@ss123', name: 'Test Admin', email: 'admin@test.local' },
  user:  { employee_id: 'TEST-USER',  password: 'UserP@ss123',  name: 'Test User',  email: 'user@test.local'  },
  user2: { employee_id: 'TEST-USR2',  password: 'UserP@ss123',  name: 'Test User2', email: 'user2@test.local' },
});

const seedDefaultDepartmentsAndUsers = async () => {
  // Single department so every assignment query has something to join on.
  const dept = await db.query(
    `INSERT INTO departments (name, description)
     VALUES ('TEST_DEPT', 'Test department') RETURNING id`
  );
  const deptId = dept.rows[0].id;

  // Hash once, reuse — bcrypt is slow on purpose.
  const hash = await bcrypt.hash(CREDS.admin.password, 4);   // low cost in tests
  const userHash = await bcrypt.hash(CREDS.user.password, 4);

  await db.query(
    `INSERT INTO users (employee_id, name, email, password_hash, role, department_id)
     VALUES ($1, $2, $3, $4, 'admin', $5)`,
    [CREDS.admin.employee_id, CREDS.admin.name, CREDS.admin.email, hash, deptId]
  );
  await db.query(
    `INSERT INTO users (employee_id, name, email, password_hash, role, department_id)
     VALUES ($1, $2, $3, $4, 'user',  $5)`,
    [CREDS.user.employee_id,  CREDS.user.name,  CREDS.user.email,  userHash, deptId]
  );
  await db.query(
    `INSERT INTO users (employee_id, name, email, password_hash, role, department_id)
     VALUES ($1, $2, $3, $4, 'user',  $5)`,
    [CREDS.user2.employee_id, CREDS.user2.name, CREDS.user2.email, userHash, deptId]
  );

  return { deptId };
};

const findUserId = async (employeeId) => {
  const r = await db.query('SELECT id FROM users WHERE employee_id = $1',
    [employeeId.toUpperCase()]);
  return r.rows[0]?.id;
};

module.exports = { CREDS, seedDefaultDepartmentsAndUsers, findUserId };
