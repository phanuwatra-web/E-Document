require('dotenv').config({ path: '../backend/.env' });
const { Pool } = require('pg');
const bcrypt   = require('bcrypt');

// ========================================
// แก้ไขตรงนี้
const EMPLOYEE_ID  = 'EMP-001';   // Employee ID ที่ต้องการเปลี่ยน
const NEW_PASSWORD = 'NewPass@123'; // รหัสผ่านใหม่
// ========================================

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function changePassword() {
  const client = await pool.connect();
  try {
    // ตรวจสอบว่ามี user นี้อยู่
    const check = await client.query(
      'SELECT id, name, employee_id FROM users WHERE employee_id = $1',
      [EMPLOYEE_ID.toUpperCase()]
    );

    if (check.rows.length === 0) {
      console.error(`❌ ไม่พบ employee ID: ${EMPLOYEE_ID}`);
      process.exit(1);
    }

    const user = check.rows[0];
    const hash = await bcrypt.hash(NEW_PASSWORD, 12);

    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, user.id]
    );

    console.log(`✓ เปลี่ยนรหัสสำเร็จ`);
    console.log(`  Employee : ${user.employee_id} — ${user.name}`);
    console.log(`  Password : ${NEW_PASSWORD}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

changePassword();
