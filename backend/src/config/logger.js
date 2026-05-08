/**
 * Centralised pino logger.
 *
 * Why pino?
 *   - Fastest Node.js logger by ~5×; safe to call on the request hot path.
 *   - JSON-first output → ready for Loki / ELK / CloudWatch with no parsing.
 *   - Built-in redaction of sensitive fields.
 *   - Child loggers carry context (reqId, userId) without manual plumbing.
 *
 * Usage:
 *   const logger = require('./config/logger');
 *   logger.info({ userId }, 'user logged in');
 *
 *   // Inside a request handler — prefer the request-scoped logger which
 *   // already has reqId attached:
 *   req.log.warn({ reason }, 'rate limit hit');
 */
const pino = require('pino');

const isProd = process.env.NODE_ENV === 'production';

// In dev, pretty-print for human eyes. In prod, plain JSON to stdout so a
// log shipper (Docker JSON driver, Promtail, Filebeat …) can parse cleanly.
const transport = isProd
  ? undefined
  : {
      target: 'pino-pretty',
      options: {
        colorize:      true,
        translateTime: 'HH:MM:ss.l',
        ignore:        'pid,hostname,service,env',
        singleLine:    false,
      },
    };

const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),

  // Static fields stamped on every log line — useful when many services ship
  // to the same Loki/ELK index.
  base: {
    service: 'docsign-api',
    env:     process.env.NODE_ENV || 'development',
  },

  // Redact secrets before they reach the transport. Faster than .replace()
  // because pino skips the path entirely instead of serialising then editing.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'req.body.password',
      'req.body.signature_data',     // base64 PNG, huge and sensitive
      'res.headers["set-cookie"]',
      '*.password',
      '*.password_hash',
      '*.token',
    ],
    censor: '[REDACTED]',
  },

  // Standard field name for ms-since-epoch. ISO date if a human will read.
  timestamp: pino.stdTimeFunctions.isoTime,

  transport,
});

module.exports = logger;
