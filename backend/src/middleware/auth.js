const jwt = require('jsonwebtoken');
const db  = require('../config/database');
const { AUTH_COOKIE } = require('../utils/cookies');

/**
 * Read the JWT from either the httpOnly cookie (preferred — XSS-safe) OR the
 * legacy Authorization header (kept for transition / non-browser clients).
 * Cookie takes precedence so a stale Bearer token can't override a fresh login.
 */
const extractToken = (req) => {
  const fromCookie = req.cookies?.[AUTH_COOKIE];
  if (fromCookie) return fromCookie;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.split(' ')[1];

  return null;
};

const authenticate = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await db.query(
      'SELECT id, employee_id, name, email, role, department_id, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (!result.rows[0] || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { authenticate, requireAdmin };
