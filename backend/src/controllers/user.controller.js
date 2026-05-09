const bcrypt = require('bcrypt');
const db     = require('../config/database');
const audit  = require('../services/audit.service');
const { validatePassword } = require('../utils/password');

// Opt-in pagination. Pass ?page=1&limit=20 to get { items, total, page, limit, totalPages }.
// No page param → returns array (legacy). See document.controller for rationale.
const getUsers = async (req, res, next) => {
  try {
    const wantsPaginated = req.query.page !== undefined;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const baseSql = `SELECT u.id, u.employee_id, u.name, u.email, u.role, u.is_active, u.created_at,
              d.id AS department_id, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       ORDER BY u.created_at DESC`;

    if (!wantsPaginated) {
      const result = await db.query(baseSql);
      return res.json(result.rows);
    }

    const countRes = await db.query(`SELECT COUNT(*)::int AS n FROM users`);
    const total = countRes.rows[0].n;

    const result = await db.query(`${baseSql} LIMIT $1 OFFSET $2`, [limit, offset]);
    res.json({
      items:      result.rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
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

    audit.log({
      req,
      action:       audit.ACTIONS.USER_CREATE,
      resourceType: 'user',
      resourceId:   result.rows[0].id,
      metadata:     { employee_id: result.rows[0].employee_id, role: result.rows[0].role },
    });

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

    audit.log({
      req,
      action:       audit.ACTIONS.USER_TOGGLE,
      resourceType: 'user',
      resourceId:   parseInt(id),
      metadata:     { employee_id: result.rows[0].employee_id, is_active: result.rows[0].is_active },
    });

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

// Update editable user fields. employee_id is intentionally NOT editable —
// it's the login anchor + appears in every audit row, changing it would
// orphan history. For role changes we block (a) demoting yourself and
// (b) demoting the last active admin.
const updateUser = async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id);
    const { name, email, department_id, role } = req.body || {};

    const provided = { name, email, department_id, role };
    const keys = Object.keys(provided).filter(k => provided[k] !== undefined);
    if (keys.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    if (role !== undefined && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'role must be "admin" or "user"' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const target = await client.query(
        'SELECT id, role FROM users WHERE id = $1',
        [targetId]
      );
      if (!target.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      if (role !== undefined && targetId === req.user.id && role !== req.user.role) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cannot change your own role' });
      }

      if (role === 'user' && target.rows[0].role === 'admin') {
        const remaining = await client.query(
          `SELECT COUNT(*)::int AS n FROM users
           WHERE role = 'admin' AND is_active = true AND id <> $1`,
          [targetId]
        );
        if (remaining.rows[0].n === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Cannot demote the last active admin' });
        }
      }

      const sets = [];
      const params = [];
      const push = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
      if (name !== undefined)          push('name',          name.trim());
      if (email !== undefined)         push('email',         email.trim().toLowerCase());
      if (department_id !== undefined) push('department_id', department_id || null);
      if (role !== undefined)          push('role',          role);
      sets.push('updated_at = NOW()');
      params.push(targetId);

      const result = await client.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}
         RETURNING id, employee_id, name, email, role, department_id, is_active`,
        params
      );

      await client.query('COMMIT');

      audit.log({
        req,
        action:       audit.ACTIONS.USER_UPDATE,
        resourceType: 'user',
        resourceId:   targetId,
        metadata:     { fields: keys, employee_id: result.rows[0].employee_id },
      });

      res.json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
};

// Admin sets a new password for any user. Same policy as createUser /
// change-password. The user can keep using the new password until they
// open /account/change-password and pick their own.
const resetUserPassword = async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id);
    const { new_password } = req.body || {};

    if (!new_password) {
      return res.status(400).json({ error: 'new_password is required' });
    }

    const target = await db.query(
      'SELECT id, employee_id FROM users WHERE id = $1',
      [targetId]
    );
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });

    const validation = validatePassword(new_password, {
      employeeId: target.rows[0].employee_id,
    });
    if (!validation.ok) {
      return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
    }

    const hash = await bcrypt.hash(new_password, 12);
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, targetId]
    );

    audit.log({
      req,
      action:       audit.ACTIONS.USER_RESET_PASSWORD,
      resourceType: 'user',
      resourceId:   targetId,
      metadata:     { employee_id: target.rows[0].employee_id },
    });

    res.json({ ok: true, message: 'Password reset successfully' });
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

module.exports = {
  getUsers, getDepartments, createUser, toggleUserStatus, deleteUser,
  updateUser, resetUserPassword,
};
