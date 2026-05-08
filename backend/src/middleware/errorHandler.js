const logger = require('../config/logger');

const errorHandler = (err, req, res, _next) => {
  const isProd = process.env.NODE_ENV === 'production';

  // Prefer the request-scoped logger so this error line shares reqId/userId
  // with the surrounding access log. Fall back to root logger if pino-http
  // hasn't attached one (e.g. very early in the chain).
  const log = req?.log || logger;

  // In dev: full stack for fast debugging.
  // In prod: message only — stack traces are operationally useless to ship
  // and can leak code paths if mis-routed.
  if (isProd) {
    log.error({ err: { message: err.message, code: err.code, name: err.name } },
      'request failed');
  } else {
    log.error({ err }, 'request failed');
  }

  if (err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'File size exceeds 10 MB limit'
      : err.message;
    return res.status(400).json({ error: msg });
  }

  if (err.message === 'Only PDF files are allowed') {
    return res.status(400).json({ error: err.message });
  }

  // PostgreSQL constraint violations
  if (err.code === '23505') return res.status(409).json({ error: 'Record already exists' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced record not found' });

  const status = err.statusCode || 500;
  res.status(status).json({
    error:    status === 500 ? 'Internal server error' : err.message,
    // Help users reference this exact failure when reporting.
    requestId: req?.id,
  });
};

module.exports = errorHandler;
