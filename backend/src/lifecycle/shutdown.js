/**
 * Graceful shutdown manager.
 * ──────────────────────────────────────────────────────────────────────
 * Why:
 *   When Docker / Kubernetes wants to stop us they send SIGTERM and then
 *   wait `terminationGracePeriodSeconds` (default 30s) before sending
 *   SIGKILL. If we ignore SIGTERM:
 *     - in-flight HTTP requests get cut → 502s for users
 *     - DB transactions die `idle_in_transaction` → server-side cleanup
 *     - log lines get truncated → debugging nightmare
 *
 * What we do, in order:
 *   1. Flip state to DRAINING. /readiness immediately returns 503 so the
 *      load balancer / k8s service depools us within one probe cycle.
 *   2. Wait `drainDelayMs` so probes have time to notice and stop sending
 *      new traffic before we close the listener.
 *   3. server.close() — refuses new connections, lets existing ones finish.
 *      Bounded by `requestTimeoutMs`; if exceeded we forcibly destroy any
 *      stuck keep-alive sockets so `close` can resolve.
 *   4. pool.end() — closes the PG pool cleanly. Bounded by `dbTimeoutMs`.
 *   5. process.exit(0).
 *
 * Hard limit: `forceExitMs`. If anything above hangs past this overall
 * deadline we log fatal and exit(1) so we don't sit in zombie state.
 *
 * Idempotent: a second SIGTERM (impatient operator hitting Ctrl+C twice)
 * is logged and ignored — the first run is in flight.
 */
const logger = require('../config/logger');

/* ── shutdown state shared with health controller ───────────────────── */
const STATES = Object.freeze({
  RUNNING:  'running',
  DRAINING: 'draining',
  STOPPED:  'stopped',
});
let state = STATES.RUNNING;
const getState     = () => state;
const isShuttingDown = () => state !== STATES.RUNNING;

/* ── timeouts (env-tunable, sensible defaults) ──────────────────────── */
const num = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const cfg = {
  // Time between "mark not-ready" and "stop accepting connections" — must
  // exceed one full readinessProbe cycle so the LB has notice to depool.
  drainDelayMs:    num(process.env.SHUTDOWN_DRAIN_DELAY_MS, 5_000),
  // Max wait for in-flight HTTP requests to finish.
  requestTimeoutMs: num(process.env.SHUTDOWN_REQUEST_TIMEOUT_MS, 10_000),
  // Max wait for the PG pool to drain.
  dbTimeoutMs:      num(process.env.SHUTDOWN_DB_TIMEOUT_MS, 5_000),
  // Overall hard ceiling — process is killed if shutdown hangs past this.
  forceExitMs:      num(process.env.SHUTDOWN_FORCE_EXIT_MS, 20_000),
};

/* ── helpers ────────────────────────────────────────────────────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Race a promise against a timeout; resolves to either { ok } or { timeout }. */
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise.then(() => ({ ok: true })),
    sleep(ms).then(() => ({ timeout: true, label })),
  ]);

/**
 * Close an HTTP server, force-destroying any sockets still hanging on
 * keep-alive after the timeout so the close handler can complete.
 */
const closeHttpServer = (server, timeoutMs) =>
  new Promise((resolve) => {
    let done = false;
    const finish = (info) => {
      if (done) return;
      done = true;
      resolve(info);
    };

    server.close(() => finish({ ok: true }));

    setTimeout(() => {
      if (typeof server.closeAllConnections === 'function') {
        // Node 18.2+ — kill keep-alive sockets that the client never closed.
        server.closeAllConnections();
      }
      finish({ ok: false, forced: true });
    }, timeoutMs).unref();
  });

/**
 * Install signal handlers. Call ONCE from server.js after `app.listen(...)`.
 *
 * @param {http.Server} server  the result of `app.listen(...)`
 * @param {{ end: () => Promise<void> }} pool  the PG pool (or any object with .end())
 */
const install = (server, pool) => {
  const begin = async (signal) => {
    if (isShuttingDown()) {
      logger.warn({ signal, state }, 'shutdown already in progress — ignoring repeat signal');
      return;
    }

    state = STATES.DRAINING;
    logger.info({ signal, cfg }, 'graceful shutdown started');

    // Hard kill timer — if anything below hangs, we exit anyway.
    const hardKill = setTimeout(() => {
      logger.fatal({ signal }, 'shutdown exceeded forceExitMs — force-exiting (1)');
      process.exit(1);
    }, cfg.forceExitMs);
    hardKill.unref();   // do not keep the loop alive ourselves

    try {
      // Step 1: let probes notice we're not ready before we close the door.
      logger.info({ ms: cfg.drainDelayMs }, 'draining: waiting for LB to depool');
      await sleep(cfg.drainDelayMs);

      // Step 2: stop accepting new requests, drain in-flight ones.
      logger.info({ ms: cfg.requestTimeoutMs }, 'closing HTTP server');
      const httpResult = await closeHttpServer(server, cfg.requestTimeoutMs);
      if (httpResult.forced) {
        logger.warn('HTTP server close timed out — force-destroyed keep-alive sockets');
      } else {
        logger.info('HTTP server closed cleanly');
      }

      // Step 3: close the DB pool (bounded).
      logger.info({ ms: cfg.dbTimeoutMs }, 'closing PostgreSQL pool');
      const dbResult = await withTimeout(pool.end(), cfg.dbTimeoutMs, 'pool.end');
      if (dbResult.timeout) {
        logger.error({ label: dbResult.label }, 'PG pool close timed out');
      } else {
        logger.info('PostgreSQL pool closed cleanly');
      }

      state = STATES.STOPPED;
      clearTimeout(hardKill);
      logger.info('shutdown complete — exiting (0)');
      // Allow pino transport one tick to flush, then exit.
      setImmediate(() => process.exit(0));
    } catch (err) {
      clearTimeout(hardKill);
      logger.fatal({ err: { message: err.message, stack: err.stack } },
        'shutdown failed — force-exiting (1)');
      process.exit(1);
    }
  };

  // ── Signal handlers ──
  process.on('SIGTERM', () => begin('SIGTERM'));   // docker stop, k8s
  process.on('SIGINT',  () => begin('SIGINT'));    // Ctrl+C in dev

  // ── Last-resort handlers (replace the ad-hoc ones in server.js) ──
  // An uncaught error during shutdown is fatal; otherwise we still try to
  // shut down gracefully so logs flush and DB tx rollback.
  process.on('uncaughtException', (err) => {
    if (isShuttingDown()) {
      logger.fatal({ err }, 'uncaught exception during shutdown — exiting (1)');
      process.exit(1);
    }
    logger.fatal({ err }, 'uncaught exception — initiating shutdown');
    begin('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
    // Do NOT auto-shutdown on rejections — they're often non-fatal and
    // shutting down on one would be a self-inflicted DoS.
  });

  logger.info({ cfg }, 'graceful shutdown handlers installed');
};

module.exports = { install, getState, isShuttingDown, STATES };
