/**
 * Request tracing + HTTP access log.
 *
 * Each incoming request gets:
 *   - A correlation ID (reqId) — UUID v4 unless the upstream proxy already
 *     set X-Request-Id, in which case we honour it (so an end-to-end trace
 *     across services keeps one ID).
 *   - The reqId is echoed back in the X-Request-Id response header so clients
 *     and ops can quote it when reporting bugs.
 *   - A child logger (req.log) with reqId + userId attached, so every log
 *     emitted during the request is automatically correlated.
 *
 * On response close, pino-http emits one structured line with method, url,
 * statusCode, responseTime — that's our access log.
 */
const pinoHttp  = require('pino-http');
const { v4: uuidv4 } = require('uuid');
const logger    = require('../config/logger');

const httpLogger = pinoHttp({
  logger,

  // Reuse upstream X-Request-Id if present (e.g. behind nginx with
  // `proxy_set_header X-Request-Id $request_id;`). Otherwise mint one.
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id = (typeof incoming === 'string' && incoming.length <= 100)
      ? incoming
      : uuidv4();
    res.setHeader('x-request-id', id);
    return id;
  },

  // Map status to log level so noisy 4xx don't pollute "info" feeds and
  // 5xx surface as proper "error" entries.
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400)        return 'warn';
    if (res.statusCode >= 300)        return 'info';
    return 'info';
  },

  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} → ${res.statusCode}`,

  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} → ${res.statusCode} (${err.message})`,

  // Trim the auto-generated req/res payload to only what's useful in logs.
  // Skipping headers + body keeps each line small AND avoids re-running
  // redaction on already-handled data.
  serializers: {
    req: (req) => ({
      id:       req.id,
      method:   req.method,
      url:      req.url,
      // userId may be set by authenticate() further down the chain. By the
      // time the response is emitted it's available.
      userId:   req.raw?.user?.id || undefined,
      ip:       req.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },

  // Don't log healthchecks / static assets at info level — they create noise
  // and aren't useful for debugging real requests.
  autoLogging: {
    ignore: (req) =>
      req.url === '/health'
      || req.url === '/readiness'
      || req.url?.startsWith('/favicon'),
  },
});

module.exports = httpLogger;
