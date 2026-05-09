const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db     = require('../config/database');
const audit  = require('../services/audit.service');
const { setAuthCookie, setCsrfCookie, clearAuthCookies } = require('../utils/cookies');
const { generateCsrfToken } = require('../middleware/csrf');
const { validatePassword } = require('../utils/password');

const loginValidation = [
  body('employee_id').trim().notEmpty().withMessage('Employee ID is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { employee_id, password } = req.body;

    const result = await db.query(
      `SELECT u.*, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.employee_id = $1 AND u.is_active = true`,
      [employee_id.trim().toUpperCase()]
    );

    const user = result.rows[0];
    // Use same generic message for both "not found" and "wrong password" to avoid enumeration
    const invalid = (reason) => {
      audit.log({
        req,
        action:   audit.ACTIONS.LOGIN_FAILURE,
        status:   'failure',
        metadata: { employee_id: employee_id.trim().toUpperCase(), reason },
      });
      return res.status(401).json({ error: 'Invalid employee ID or password' });
    };

    if (!user) return invalid('user_not_found');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return invalid('wrong_password');

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    audit.log({
      req,
      actor:    user,                 // req.user not set yet — pass explicitly
      action:   audit.ACTIONS.LOGIN_SUCCESS,
      metadata: { role: user.role },
    });

    // === Auth cookies ===
    // The JWT goes into an httpOnly cookie so JavaScript (and therefore any
    // XSS payload) cannot read it. We also issue a fresh CSRF token on every
    // login — this defeats session-fixation-style CSRF where an attacker
    // pre-plants a known token before login.
    setAuthCookie(res, token);
    const csrfToken = generateCsrfToken();
    setCsrfCookie(res, csrfToken);

    res.json({
      // `token` is intentionally NOT in the body anymore. Cookies handle it.
      // `csrfToken` IS returned so SPA can attach it to the next header
      // immediately, without an extra round-trip to read document.cookie.
      csrfToken,
      user: {
        id:                  user.id,
        employee_id:         user.employee_id,
        name:                user.name,
        email:               user.email,
        role:                user.role,
        department_id:       user.department_id,
        department_name:     user.department_name,
        // Drives the consent modal — null means "show it on next page".
        privacy_accepted_at: user.privacy_accepted_at,
      },
    });
  } catch (err) {
    next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.employee_id, u.name, u.email, u.role, u.department_id,
              u.privacy_accepted_at,
              d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

/**
 * Change the caller's own password. Requires:
 *   - active session (cookie auth)
 *   - CSRF token (state-changing)
 *   - the CURRENT password (proof-of-presence — defends against an attacker
 *     who got hold of a live session via XSS or stolen device)
 *   - a new password that passes the policy in utils/password.js
 *
 * On success we issue a FRESH JWT + rotate the CSRF token, so the user
 * keeps working without having to log in again. This is the friendly choice
 * for an internal tool. If you ever care about killing zombie sessions on
 * other devices, switch back to clearAuthCookies(res) here.
 */
const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};

    if (!current_password || !new_password) {
      return res.status(400).json({
        error: 'current_password and new_password are required',
      });
    }

    // Same-value short-circuit — done before bcrypt to save the round trip
    // AND before validatePassword so the user gets the more useful message.
    if (current_password === new_password) {
      return res.status(400).json({
        error: 'New password must differ from your current password',
      });
    }

    const validation = validatePassword(new_password, {
      employeeId:      req.user.employee_id,
      currentPassword: current_password,
    });
    if (!validation.ok) {
      // Verbose: tell the user EXACTLY which rules failed so the UI can
      // render a checklist. Authenticated request → no enumeration concern.
      return res.status(400).json({
        error:  validation.errors[0],
        errors: validation.errors,
      });
    }

    // Re-fetch the password_hash; the auth middleware doesn't include it
    // in req.user (it should never be passed around in memory).
    const r = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(current_password, r.rows[0].password_hash);
    if (!valid) {
      audit.log({
        req,
        action:   audit.ACTIONS.PASSWORD_CHANGE_FAILURE,
        status:   'failure',
        metadata: { reason: 'wrong_current_password' },
      });
      // Generic message — don't hint whether current was close, recently
      // changed, etc. 401 because the proof-of-presence failed.
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await db.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, req.user.id]
    );

    audit.log({
      req,
      action:       audit.ACTIONS.PASSWORD_CHANGE,
      resourceType: 'user',
      resourceId:   req.user.id,
    });

    // Issue a fresh JWT + rotate CSRF so the session stays alive. The
    // previous JWT remains valid until its expiry (we can't revoke a
    // stateless token without a denylist) — acceptable for internal use.
    const freshToken = jwt.sign(
      { userId: req.user.id, role: req.user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    setAuthCookie(res, freshToken);
    const csrfToken = generateCsrfToken();
    setCsrfCookie(res, csrfToken);

    res.json({
      ok:        true,
      message:   'Password changed successfully',
      csrfToken,                   // rotated — frontend should adopt for next requests
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Mark that the calling user has accepted the current Privacy Notice.
 * This is what PDPA calls a "data subject's record of consent" — we keep
 * a UTC timestamp + IP/user-agent (in audit_logs) to prove acceptance.
 *
 * Idempotent on purpose: if the user clicks accept twice we keep the FIRST
 * acceptance time (more accurate evidence). If you ever publish a new
 * privacy policy version, manually `UPDATE users SET privacy_accepted_at=NULL`
 * and the modal will reappear.
 */
const acceptPrivacy = async (req, res, next) => {
  try {
    const r = await db.query(
      `UPDATE users
         SET privacy_accepted_at = COALESCE(privacy_accepted_at, NOW())
         WHERE id = $1
         RETURNING privacy_accepted_at`,
      [req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'User not found' });

    audit.log({
      req,
      action:       audit.ACTIONS.PRIVACY_ACCEPTED,
      resourceType: 'user',
      resourceId:   req.user.id,
      metadata:     { accepted_at: r.rows[0].privacy_accepted_at },
    });

    res.json({ ok: true, privacy_accepted_at: r.rows[0].privacy_accepted_at });
  } catch (err) {
    next(err);
  }
};

/**
 * Issue a CSRF token without requiring authentication. The SPA calls this on
 * boot so it can include X-CSRF-Token in the very first POST (login).
 * Setting the cookie here AND returning the value lets the client choose
 * whichever it prefers — they will be identical.
 */
const getCsrfToken = (req, res) => {
  const csrfToken = generateCsrfToken();
  setCsrfCookie(res, csrfToken);
  res.json({ csrfToken });
};

/**
 * Clear both auth cookies. CSRF-protected so an attacker cannot remotely
 * log a user out (would be annoying, not catastrophic, but still avoidable).
 */
const logout = (req, res) => {
  clearAuthCookies(res);
  res.json({ ok: true });
};

module.exports = {
  login, loginValidation, getMe, getCsrfToken, logout, changePassword, acceptPrivacy,
};
