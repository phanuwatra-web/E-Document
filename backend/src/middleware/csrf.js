/**
 * CSRF Protection — Double-Submit Cookie Pattern.
 *
 * Background:
 *   Cookies are sent automatically by the browser on every request — including
 *   forged requests originating from another site. We block that by requiring
 *   a token that lives in BOTH the cookie AND a request header. An attacker
 *   on evil.com can trigger requests carrying our cookie but cannot READ the
 *   cookie (Same-Origin Policy), so they cannot forge the matching header.
 *
 * Strategy:
 *   - GET / HEAD / OPTIONS    → safe methods, no check (per RFC 7231)
 *   - POST / PUT / PATCH / DELETE → must include `X-CSRF-Token` header that
 *                                   matches the `csrf_token` cookie
 *   - The /api/auth/login and /api/auth/csrf-token endpoints are exempt
 *     because they bootstrap the token (no cookie exists yet).
 *
 * Constant-time comparison prevents timing attacks against the comparison.
 */
const crypto = require('crypto');
const { CSRF_COOKIE } = require('../utils/cookies');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/csrf-token',
]);

const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method))   return next();
  if (EXEMPT_PATHS.has(req.path))     return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  // Lengths must match before timingSafeEqual (otherwise it throws).
  // A length mismatch by itself already means tokens don't match.
  if (cookieToken.length !== headerToken.length) {
    return res.status(403).json({ error: 'CSRF token mismatch' });
  }

  const equal = crypto.timingSafeEqual(
    Buffer.from(cookieToken),
    Buffer.from(headerToken),
  );
  if (!equal) {
    return res.status(403).json({ error: 'CSRF token mismatch' });
  }

  next();
};

const generateCsrfToken = () => crypto.randomBytes(32).toString('hex');

module.exports = { csrfProtection, generateCsrfToken };
