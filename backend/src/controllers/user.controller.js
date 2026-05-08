const bcrypt = require('bcrypt');
const db     = require('../config/database');
const audit  = require('../services/audit.service');
const { validatePassword } = require('../utils/password');

const getUsers = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.employee_id, u.name, u.email, u.role, u.is_active, u.created_at,
              d.id AS department_id, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

const getDepartments = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT d.*, COUNT(u.id) AS user_count
       FROM departments d
       LEFT JOIN users u ON d.id = u.department_id AND u.is_active = true
       GROUP BY d.id
       ORDER BY d.name`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { employee_id, name, email, password, role, department_id } = req.body;
    if (!employee_id || !name || !email || !password) {
      return res.status(400).json({ error: 'employee_id, name, email and password are required' });
    }

    // Same policy as /auth/change-password — never accept a weak password,
    // even from admin. Tells the admin which rules failed so they can pick
    // a strong one without guessing.
    const validation = validatePassword(password, { employeeId: employee_id });
    if (!validation.ok) {
      return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO users (employee_id, name, email, password_hash, role, department_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, employee_id, name, email, role, department_id, created_at`,
      [
        employee_id.trim().toUpperCase(),
        name.trim(),
        email.trim().toLowerCase(),
        password_hash,
        role || 'user',
        department_id || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

const toggleUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }
    const result = await db.query(
      `UPDATE users SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1
       RETURNING id, employee_id, name, is_active`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

// Hard-delete a user along with their signatures and document assignments.
// Refuses if:
//   - admin tries to delete their own account
//   - the target is the last active admin (would lock everyone out)
//   - the target has uploaded documents (those still belong to them — admin
//     must transfer or delete those documents first to avoid orphaning)
const deleteUser = async (req, res, next) => {
  const { id } = req.params;

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const target = await client.query(
      'SELECT id, role, employee_id, name FROM users WHERE id = $1',
      [id]
    );
    if (!target.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    const targetUser = target.rows[0];

    // Don't allow removing the last admin
    if (targetUser.role === 'admin') {
      const remaining = await client.query(
        `SELECT COUNT(*)::int AS n FROM users
         WHERE role = 'admin' AND is_active = true AND id <> $1`,
        [id]
      );
      if (remaining.rows[0].n === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cannot delete the last admin' });
      }
    }

    // Block delete if they own (uploaded) documents — those would be orphaned.
    const owned = await client.query(
      'SELECT COUNT(*)::int AS n FROM documents WHERE uploaded_by = $1',
      [id]
    );
    if (owned.rows[0].n > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `User has uploaded ${owned.rows[0].n} document(s). Delete or reassign those first.`,
      });
    }

    // Cascade clean up rows that belong to this user
    await client.query('DELETE FROM signatures WHERE user_id = $1', [id]);
    await client.query('DELETE FROM document_assignments WHERE user_id = $1', [id]);
    await client.query('DELETE FROM users WHERE id = $1', [id]);

    await client.query('COMMIT');

    audit.log({
      req,
      action:       audit.ACTIONS.USER_DELETE,
      resourceType: 'user',
      resourceId:   parseInt(id),
      metadata: {
        employee_id: targetUser.employee_id,
        name:        targetUser.name,
        role:        targetUser.role,
      },
    });

    res.json({ ok: true, message: 'User deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { getUsers, getDepartments, createUser, toggleUserStatus, deleteUser };
