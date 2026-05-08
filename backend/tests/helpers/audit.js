/**
 * Audit log helpers.
 *
 * The audit service writes via setImmediate so the row may not exist by
 * the time the HTTP response returns. waitForAuditRow polls (max 1s) for
 * the row matching the given criteria — that way tests don't sleep
 * unconditionally and they fail fast if the row never appears.
 */
const db = require('../../src/config/database');

/**
 * @param {object} criteria
 * @param {string} [criteria.action]
 * @param {string} [criteria.status]
 * @param {number} [criteria.userId]
 * @param {string} [criteria.resourceType]
 * @param {number} [criteria.resourceId]
 * @param {number} [timeoutMs=1000]
 * @returns {Promise<object>} the audit row
 */
const waitForAuditRow = async (criteria, timeoutMs = 1000) => {
  const where  = [];
  const params = [];
  const push = (clause, value) => {
    params.push(value);
    where.push(clause.replace('$$', `$${params.length}`));
  };
  if (criteria.action)       push('action = $$',        criteria.action);
  if (criteria.status)       push('status = $$',        criteria.status);
  if (criteria.userId)       push('user_id = $$',       criteria.userId);
  if (criteria.resourceType) push('resource_type = $$', criteria.resourceType);
  if (criteria.resourceId)   push('resource_id = $$',   criteria.resourceId);

  const sql = `
    SELECT id, user_id, actor_label, action, resource_type, resource_id,
           status, ip_address, metadata, created_at
    FROM audit_logs
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY id DESC
    LIMIT 1
  `;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await db.query(sql, params);
    if (r.rows[0]) return r.rows[0];
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`audit row not found within ${timeoutMs}ms: ${JSON.stringify(criteria)}`);
};

const countAuditRows = async (criteria = {}) => {
  const where  = [];
  const params = [];
  const push = (clause, value) => {
    params.push(value);
    where.push(clause.replace('$$', `$${params.length}`));
  };
  if (criteria.action) push('action = $$', criteria.action);
  if (criteria.userId) push('user_id = $$', criteria.userId);

  const sql = `SELECT COUNT(*)::int AS n FROM audit_logs
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  const r = await db.query(sql, params);
  return r.rows[0].n;
};

module.exports = { waitForAuditRow, countAuditRows };
