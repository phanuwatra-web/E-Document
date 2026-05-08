/**
 * Health & Readiness probes for orchestrators (Docker, Kubernetes, ECS).
 *
 * /health      — liveness:  "is the process alive?" (no I/O, always 200 unless event-loop is broken)
 * /readiness   — readiness: "is the process ready to serve traffic?" (checks DB)
 *
 * Why split?
 *   Liveness failure → orchestrator KILLS the container.
 *   Readiness failure → orchestrator REMOVES the pod from the load balancer
 *                        but keeps it running.
 *   If we merged them and DB had a brief hiccup, the orchestrator would kill
 *   every pod simultaneously and we'd hit a crash loop. Keeping them separate
 *   lets the system self-heal during transient dependency outages.
 */
const db = require('../config/database');
const { isShuttingDown, getState } = require('../lifecycle/shutdown');

/**
 * Run any async check with a hard timeout. We never want a probe handler
 * to hang waiting for a stuck dependency — orchestrators have their own
 * timeouts but they're typically generous (5s+) and we want fail-fast.
 */
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('check_timeout')), ms),
    ),
  ]);

/**
 * GET /health
 * Liveness probe. Stays cheap and synchronous. Never fails unless the event
 * loop itself is broken (in which case Express wouldn't even reach here).
 */
const liveness = (req, res) => {
  res.json({
    status:    'ok',
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
    requestId: req.id,
  });
};

/**
 * GET /readiness
 * Probes every dependency the app needs to serve real requests.
 * Returns 200 if all checks pass, 503 otherwise.
 *
 * Strict by design: only essential dependencies (DB). Email is intentionally
 * NOT included here — a flaky SMTP must not cause the LB to depool the pod.
 */
const readiness = async (req, res) => {
  // ─── Shutdown short-circuit ────────────────────────────────────────
  // Once the shutdown manager flips state to "draining" we MUST report
  // 503 immediately, even before checking dependencies, so the LB stops
  // routing new traffic in the same probe cycle. Skipping the DB query
  // also means we don't lengthen our own shutdown by waiting on it.
  if (isShuttingDown()) {
    return res.status(503).json({
      status:    'shutting_down',
      state:     getState(),
      timestamp: new Date().toISOString(),
      requestId: req.id,
    });
  }

  const checks = {};
  let allOk    = true;

  // ─── Database check ────────────────────────────────────────────────
  // `SELECT 1` is the cheapest possible round-trip — confirms the pool can
  // hand out a working connection AND the server responds.
  // 2s ceiling so a stuck DB never holds the probe handler.
  const dbStart = Date.now();
  try {
    await withTimeout(db.query('SELECT 1'), 2000);
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
  } catch (err) {
    allOk = false;
    checks.database = { status: 'fail', latencyMs: Date.now() - dbStart };
    // Log the real reason on the server side; never leak it to the response.
    req.log.warn(
      { err: { message: err.message, code: err.code }, latencyMs: Date.now() - dbStart },
      'readiness: database check failed'
    );
  }

  const body = {
    status:    allOk ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
    requestId: req.id,
  };

  res.status(allOk ? 200 : 503).json(body);
};

module.exports = { liveness, readiness };
