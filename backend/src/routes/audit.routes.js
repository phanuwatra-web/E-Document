const router = require('express').Router();
const { listAuditLogs } = require('../controllers/audit.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Admin-only. RBAC enforced via requireAdmin middleware.
router.get('/', authenticate, requireAdmin, listAuditLogs);

module.exports = router;
