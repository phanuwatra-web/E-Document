/**
 * Audit Log Service
 * ──────────────────────────────────────────────────────────────────────
 * Append-only, fire-and-forget audit trail. Controllers call `audit.log(...)`
 * after a business operation completes; the call returns immediately and the
 * INSERT happens on the next tick. If the INSERT fails we log the error to
 * stderr but NEVER throw — auditing must not break the business path.
 *
 * Action naming: dot-notation, lower case
 *   <domain>.<action>[.<outcome>]
 *   examples: auth.login.success, document.sign, user.delete
 */
const db     = require('../config/database');
const logger = require('../config/logger');

// Re-usable action constants so callers don't typo strings.
const ACTIONS = Object.freeze({
  // Auth
  LOGIN_SUCCESS:           'auth.login.success',
  LOGIN_FAILURE:           'auth.login.failure',
  PASSWORD_CHANGE:         'auth.password_change',
  PASSWORD_CHANGE_FAILURE: 'auth.password_change.failure',

  // Document
  DOCUMENT_UPLOAD:         'document.upload',
  DOCUMENT_DELETE:         'document.delete',
  DOCUMENT_DOWNLOAD:       'document.download',
  DOCUMENT_VIEW:           'document.view',

  // Signature
  SIGNATURE_SIGN:          'signature.sign',
  SIGNATURE_UNSIGN:        'signature.unsign',
  SIGNATURE_UPDATE_POS:    'signature.update_position',

  // User
  USER_CREATE:             'user.create',
  USER_DELETE:             'user.delete',
  USER_TOGGLE:             'user.toggle',
});

/**
 * Build an actor label from a user-like object. Used so that even if user_id
 * is later nulled (account deleted), we still know who acted.
 */
const buildActorLabel = (user) => {
  if (!user) return null;
  const id   = user.employee_id || user.id;
  const name = user.name;
  return name ? `${id} — ${name}` : String(id);
};

/**
 * Extract IP + user-agent from an Express request.
 * Centralised so all callers produce identical shape.
 */
const extractContext = (req) => {
  if (!req) return { ip: null, userAgent: null };
  const ip = req.ip
    || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || null;
  const userAgent = (req.headers?.['user-agent'] || '').slice(0, 500) || null;
  return { ip, userAgent };
};

/**
 * Insert one audit row. Never throws. Returns void.
 *
 * @param {object} entry
 * @param {object} [entry.req]            Express request (for IP, UA, user)
 * @param {object} [entry.actor]          Override req.user (e.g. for failed logins where req.user is unset)
 * @param {string}  entry.action          One of ACTIONS.*
 * @param {string} [entry.resourceType]   'document' | 'user' | 'signature' | null
 * @param {number} [entry.resourceId]
 * @param {'success'|'failure'} [entry.status='success']
 * @param {object} [entry.metadata]       Extra JSON detail
 */
const log = (entry) => {
  // Defer to the next tick so we never block the response.
  setImmediate(() => _writeAuditRow(entry).catch(_logFailure));
};

const _writeAuditRow = async ({
  req,
  actor,
  action,
  resourceType = null,
  resourceId   = null,
  status       = 'success',
  metadata     = null,
}) => {
  if (!action) throw new Error('audit.log: action is required');

  const user             = actor || req?.user || null;
  const { ip, userAgent } = extractContext(req);

  // Stamp reqId into metadata so ops can join an audit row to the HTTP/access
  // log line (which carries the same reqId in every field).
  const enrichedMeta = req?.id
    ? { ...(metadata || {}), reqId: req.id }
    : metadata;

  await db.query(
    `INSERT INTO audit_logs
       (user_id, actor_label, action, resource_type, resource_id,
        status, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      user?.id           || null,
      buildActorLabel(user),
      action,
      resourceType,
      resourceId,
      status,
      ip,
      userAgent,
      enrichedMeta ? JSON.stringify(enrichedMeta) : null,
    ]
  );
};

const _logFailure = (err) => {
  // Auditing failures must NEVER throw — they only emit a structured warning
  // so ops can alert on `level=warn AND msg='audit log write failed'`.
  logger.warn({ err: { message: err.message, code: err.code } },
    'audit log write failed');
};

/**
 * Query helper for the admin UI. Supports filtering by user, action prefix,
 * resource, date range, and pagination.
 */
const query = async ({
  userId,
  actionPrefix,
  resourceType,
  resourceId,
  status,
  fromDate,
  toDate,
  limit  = 50,
  offset = 0,
} = {}) => {
  const where  = [];
  const params = [];

  const push = (clause, value) => {
    params.push(value);
    where.push(clause.replace('$$', `$${params.length}`));
  };

  if (userId)       push('user_id = $$',                  userId);
  if (actionPrefix) push('action LIKE $$',                `${actionPrefix}%`);
  if (resourceType) push('resource_type = $$',            resourceType);
  if (resourceId)   push('resource_id = $$',              resourceId);
  if (status)       push('status = $$',                   status);
  if (fromDate)     push('created_at >= $$',              fromDate);
  if (toDate)       push('created_at <  $$',              toDate);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(Math.min(limit, 500));   // cap at 500 to protect server
  params.push(offset);

  const sql = `
    SELECT id, user_id, actor_label, action, resource_type, resource_id,
           status, ip_address, user_agent, metadata, created_at
    FROM audit_logs
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await db.query(sql, params);
  return result.rows;
};

module.exports = { log, query, ACTIONS };
