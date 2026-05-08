/**
 * Express app factory.
 * ──────────────────────────────────────────────────────────────────────
 * server.js boots and listens; this file only assembles the middleware
 * stack and exports `app`. Splitting them lets supertest grab `app`
 * directly without binding a port (no listen, no port collisions, no
 * cleanup needed in tests).
 */
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const authRoutes      = require('./routes/auth.routes');
const documentRoutes  = require('./routes/document.routes');
const signatureRoutes = require('./routes/signature.routes');
const userRoutes      = require('./routes/user.routes');
const auditRoutes     = require('./routes/audit.routes');
const healthRoutes    = require('./routes/health.routes');
const errorHandler    = require('./middleware/errorHandler');
const httpLogger      = require('./middleware/requestLogger');
const { csrfProtection } = require('./middleware/csrf');

const isTest = process.env.NODE_ENV === 'test';

const app = express();

// trust proxy: how many proxy hops sit in front of us. Read X-Forwarded-*
// from this many trusted hops; ignore the rest. Get this RIGHT or
// rate-limit will see the proxy IP instead of the real client and either
// rate-limit nobody (too high) or rate-limit everyone via a shared IP (too low).
//
// Examples:
//   1  — direct nginx/Traefik in front (default, was previous behaviour)
//   2  — Cloudflare → ALB → app
//   0  — local dev, no proxy
//
// Accepts a number (hops) or 'true' (trust all — NEVER use in production).
const TRUST_PROXY_RAW = process.env.TRUST_PROXY ?? '1';
const trustProxy = TRUST_PROXY_RAW === 'true' ? true : (parseInt(TRUST_PROXY_RAW, 10) || 0);
app.set('trust proxy', trustProxy);

app.use(helmet());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// HTTP request logger + correlation ID. MUST come before any handler that
// might log, so req.log carries reqId/userId in every downstream message.
app.use(httpLogger);

// Probe endpoints — mounted BEFORE /api/* limiters and CSRF/cookie layers
// so orchestrators (Docker / K8s) can reach them with no auth or token.
app.use('/', healthRoutes);

// Rate limits — relaxed for an internal tool. The point isn't to defend
// against credential-stuffing botnets (intranet, no public exposure) but
// to catch a misbehaving script or someone bashing their keyboard. Numbers
// chosen so a normal busy user never trips them.
//
// Rate limits are also skipped entirely in tests so repeated logins don't
// turn passing suites into flaky ones.
const rateLimitSkip = () => isTest;
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      500,                        // was 200
  skip:     rateLimitSkip,
}));
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      30,                         // was 15
  message:  { error: 'Too many login attempts. Please try again in 15 minutes.' },
  skip:     rateLimitSkip,
}));
app.use('/api/auth/change-password', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,                         // was 5
  message:  { error: 'Too many password change attempts. Please try again in 15 minutes.' },
  skip:     rateLimitSkip,
}));

app.use(express.json({ limit: '15mb' })); // allow base64 signature data
app.use(express.urlencoded({ extended: true }));

// Cookie parsing must come before any middleware that reads req.cookies.
app.use(cookieParser());

// CSRF protection on all state-changing requests under /api/*.
// EXEMPT_PATHS in middleware/csrf.js skips login + csrf-token bootstrap.
app.use('/api/', csrfProtection);

// Routes
app.use('/api/auth',       authRoutes);
app.use('/api/documents',  documentRoutes);
app.use('/api/signatures', signatureRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/audit-logs', auditRoutes);

app.use(errorHandler);

module.exports = app;
