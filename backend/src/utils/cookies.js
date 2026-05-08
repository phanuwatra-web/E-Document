/**
 * Cookie helpers — keep flag policy in ONE place so we can never accidentally
 * ship a non-secure cookie or forget SameSite. All auth-related cookies must
 * go through these helpers.
 */
const isProd = () => process.env.NODE_ENV === 'production';

const AUTH_COOKIE = 'auth_token';   // httpOnly: JWT — frontend never reads this
const CSRF_COOKIE = 'csrf_token';   // readable: random token — frontend echoes in header

/**
 * 8 hours by default — matches JWT_EXPIRES_IN. We keep cookie maxAge slightly
 * shorter so the cookie expires before the JWT, never after.
 */
const ACCESS_TOKEN_MAX_AGE_MS = 8 * 60 * 60 * 1000;

/**
 * Base attributes shared by both cookies. Promote `secure` only in production
 * because dev runs on http://localhost (no HTTPS) and Secure cookies are dropped.
 *
 * SameSite policy:
 *   - 'lax'  : default, sent on top-level navigation; blocks the typical
 *              CSRF form-submit-from-evil-site attack.
 *   - 'strict' is overkill for an internal app and breaks "click email link
 *              into the app" UX.
 */
const baseAttrs = () => ({
  secure:   isProd(),
  sameSite: 'lax',
  path:     '/',
});

const setAuthCookie = (res, token) => {
  res.cookie(AUTH_COOKIE, token, {
    ...baseAttrs(),
    httpOnly: true,                     // JS cannot read — XSS-safe
    maxAge:   ACCESS_TOKEN_MAX_AGE_MS,
  });
};

const setCsrfCookie = (res, token) => {
  res.cookie(CSRF_COOKIE, token, {
    ...baseAttrs(),
    httpOnly: false,                    // frontend MUST read this and echo in header
    maxAge:   ACCESS_TOKEN_MAX_AGE_MS,
  });
};

const clearAuthCookies = (res) => {
  // Clear both with the same flags they were set with — otherwise some browsers
  // ignore the clear (cookies must match all attributes to be overwritten).
  res.clearCookie(AUTH_COOKIE, { ...baseAttrs(), httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...baseAttrs(), httpOnly: false });
};

module.exports = {
  AUTH_COOKIE, CSRF_COOKIE,
  setAuthCookie, setCsrfCookie, clearAuthCookies,
};
