/**
 * Notifications — pending work for the calling user.
 *
 * For regular users: documents assigned to them but not yet signed.
 * For admins: documents they uploaded that still have pending signatures.
 *
 * Cheap query — bounded by `LIMIT` so polling every 60s is safe.
 */
const db = require('../config/database');

const LIMIT = 20;

const getMyNotifications = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';

    const sql = isAdmin
      ? `SELECT d.id, d.title, d.created_at,
                dept.name AS department_name,
                COUNT(da.id) FILTER (WHERE da.status = 'pending') AS pending_count,
                COUNT(da.id)                                       AS total_count
         FROM documents d
         LEFT JOIN departments dept ON d.department_id = dept.id
         LEFT JOIN document_assignments da ON da.document_id = d.id
         WHERE d.uploaded_by = $1
         GROUP BY d.id, dept.name
         HAVING COUNT(da.id) FILTER (WHERE da.status = 'pending') > 0
         ORDER BY d.created_at DESC
         LIMIT ${LIMIT}`
      : `SELECT d.id, d.title, d.created_at,
                dept.name AS department_name,
                u.name    AS uploaded_by_name
         FROM documents d
         JOIN document_assignments da ON da.document_id = d.id
         LEFT JOIN departments dept ON d.department_id = dept.id
         LEFT JOIN users u          ON d.uploaded_by   = u.id
         WHERE da.user_id = $1 AND da.status = 'pending'
         ORDER BY d.created_at DESC
         LIMIT ${LIMIT}`;

    const result = await db.query(sql, [req.user.id]);

    res.json({
      count: result.rows.length,
      items: result.rows,
      role:  req.user.role,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMyNotifications };
