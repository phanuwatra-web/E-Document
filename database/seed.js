require('dotenv').config({ path: '../backend/.env' });
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
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

    // Defaults that PASS the password policy (Phase 8). Override via env vars
    // when the script is run in CI / staging, e.g.:
    //   SEED_ADMIN_PASSWORD='S0me$tr0ng!' node seed.js
    // These are still PUBLISHED defaults — operators MUST change them after
    // first login. The big banner below makes that explicit.
    const ADMIN_DEFAULT = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!Admin2026';
    const USER_DEFAULT  = process.env.SEED_USER_PASSWORD  || 'ChangeMe!User2026';

    const adminHash = await bcrypt.hash(ADMIN_DEFAULT, 12);
    const userHash  = await bcrypt.hash(USER_DEFAULT,  12);

    await client.query(`
      INSERT INTO users (employee_id, name, email, password_hash, role)
      VALUES ($1, $2, $3, $4, 'admin')
      ON CONFLICT (employee_id) DO NOTHING
    `, ['3619', 'System Administrator', 'admin@company.com', adminHash]);
    console.log(`✓ Admin seeded  → 3619 / ${ADMIN_DEFAULT}`);

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
    console.log(`✓ Users seeded  →  3686..3693 / ${USER_DEFAULT}`);

    await client.query('COMMIT');
    console.log('\nSeed completed successfully!');
    console.log('\n' + '='.repeat(70));
    console.log('  ⚠  SECURITY WARNING                                                  ');
    console.log('='.repeat(70));
    console.log('  Default passwords are PUBLIC knowledge. Before going live:');
    console.log('    1. Login with admin                3619 / ' + ADMIN_DEFAULT);
    console.log('    2. Open /account/change-password and pick a strong password');
    console.log('    3. Tell every seeded user to do the same');
    console.log('       OR run: node database/change-password.js');
    console.log('  Skipping this step is the #1 cause of compromised deployments.');
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
