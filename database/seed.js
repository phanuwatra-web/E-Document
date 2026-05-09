require('dotenv').config({ path: '../backend/.env' });
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  // Validate env BEFORE touching the DB so a refused run is a true no-op.
  const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
  const USER_PASSWORD  = process.env.SEED_USER_PASSWORD;
  const missing = [];
  if (!ADMIN_PASSWORD) missing.push('SEED_ADMIN_PASSWORD');
  if (!USER_PASSWORD)  missing.push('SEED_USER_PASSWORD');
  if (missing.length > 0) {
    console.error('\n' + '='.repeat(70));
    console.error('  ❌ SEED REFUSED — missing required env vars: ' + missing.join(', '));
    console.error('='.repeat(70));
    console.error('  Re-run with strong passwords, e.g.:');
    console.error('    SEED_ADMIN_PASSWORD=\'YourStrongAdminP@ss2026\' \\');
    console.error('    SEED_USER_PASSWORD=\'YourStrongUserP@ss2026\' \\');
    console.error('    node database/seed.js');
    console.error('='.repeat(70) + '\n');
    process.exit(1);
  }
  if (ADMIN_PASSWORD.length < 12 || USER_PASSWORD.length < 12) {
    console.error('\n  ❌ Seed passwords must be at least 12 chars\n');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      INSERT INTO departments (name, description) VALUES
        ('HR',          'Human Resources Department'),
        ('Finance',     'Finance and Accounting Department'),
        ('Engineering', 'Software Engineering Department'),
        ('Operations',  'Operations and Logistics Department')
      ON CONFLICT (name) DO NOTHING
    `);
    console.log('✓ Departments seeded');

    const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const userHash  = await bcrypt.hash(USER_PASSWORD,  12);

    await client.query(`
      INSERT INTO users (employee_id, name, email, password_hash, role)
      VALUES ($1, $2, $3, $4, 'admin')
      ON CONFLICT (employee_id) DO NOTHING
    `, ['3619', 'System Administrator', 'admin@company.com', adminHash]);
    console.log('✓ Admin seeded  → 3619');

    const depts = await client.query('SELECT id, name FROM departments');
    const deptMap = {};
    depts.rows.forEach(d => { deptMap[d.name] = d.id; });

    const users = [
      { id: '3686', name: 'Phanuwat',  email: 'phanuwat@company.com',   dept: 'HR' },
      { id: '3687', name: 'Bob Smith',       email: 'bob@company.com',     dept: 'HR' },
      { id: '3688', name: 'Charlie Brown',   email: 'charlie@company.com', dept: 'Finance' },
      { id: '3689', name: 'Diana Prince',    email: 'diana@company.com',   dept: 'Finance' },
      { id: '3690', name: 'Eve Wilson',      email: 'eve@company.com',     dept: 'Engineering' },
      { id: '3691', name: 'Frank Miller',    email: 'frank@company.com',   dept: 'Engineering' },
      { id: '3692', name: 'Grace Lee',       email: 'grace@company.com',   dept: 'Operations' },
      { id: '3693', name: 'Henry Davis',       email: 'henry@company.com',   dept: 'Operations' },
    ];

    for (const u of users) {
      await client.query(`
        INSERT INTO users (employee_id, name, email, password_hash, role, department_id)
        VALUES ($1, $2, $3, $4, 'user', $5)
        ON CONFLICT (employee_id) DO NOTHING
      `, [u.id, u.name, u.email, userHash, deptMap[u.dept]]);
    }
    console.log('✓ Users seeded  →  3686..3693');

    await client.query('COMMIT');
    console.log('\nSeed completed successfully!');
    console.log('\n' + '='.repeat(70));
    console.log('  ⚠  SECURITY WARNING                                                  ');
    console.log('='.repeat(70));
    console.log('  Passwords were supplied via env vars (not stored in source).');
    console.log('  Recommended: every seeded user should change their password');
    console.log('  on first login at /account/change-password');
    console.log('  Distribute the temporary passwords through a secure channel,');
    console.log('  not chat / email / commit messages.');
    console.log('='.repeat(70) + '\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
