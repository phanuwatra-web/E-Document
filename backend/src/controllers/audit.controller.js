/**
 * Audit Log read API.
 * Admin-only — see routes/audit.routes.js for the requireAdmin guard.
 */
const audit = require('../services/audit.service');

const listAuditLogs = async (req, res, next) => {
  try {
    const {
      user_id, action_prefix, resource_type, resource_id,
      status, from, to, limit, offset,
    } = req.query;

    // Coerce + sanitise. Reject invalid status to avoid silently filtering wrong.
    if (status && !['success', 'failure'].includes(status)) {
      return res.status(400).json({ error: 'status must be success or failure' });
    }

    const rows = await audit.query({
      userId:       user_id       ? parseInt(user_id)     : undefined,
      actionPrefix: action_prefix || undefined,
      resourceType: resource_type || undefined,
      resourceId:   resource_id   ? parseInt(resource_id) : undefined,
      status:       status        || undefined,
      fromDate:     from          ? new Date(from)        : undefined,
      toDate:       to            ? new Date(to)          : undefined,
      limit:        limit         ? Math.min(parseInt(limit), 500) : 50,
      offset:       offset        ? parseInt(offset)      : 0,
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
};

module.exports = { listAuditLogs };
