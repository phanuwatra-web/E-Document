/**
 * Probe routes — mounted at the ROOT, not under /api/.
 *
 * Why root?
 *   - Orchestrators have no token / cookie / CSRF — these endpoints sit
 *     outside the auth + CSRF layers (which all live under /api/*).
 *   - Mounting at root keeps probe traffic out of the business access log
 *     (we already filter /health and /readiness in requestLogger.js's
 *     autoLogging.ignore).
 *   - Conventional path used by every K8s template / Docker example.
 */
const router = require('express').Router();
const { liveness, readiness } = require('../controllers/health.controller');

router.get('/health',    liveness);
router.get('/readiness', readiness);

module.exports = router;
