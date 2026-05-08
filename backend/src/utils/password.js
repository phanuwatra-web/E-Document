/**
 * Password policy + validator.
 *
 * Centralised so every place that accepts a new password (createUser,
 * change-password, future reset-password) enforces the same rules.
 *
 * Why hand-rolled instead of zod / Joi?
 *   - The rule set is small and stable; zero new dependencies.
 *   - Returns ALL violations so the UI can render a checklist instead of
 *     surfacing one error at a time.
 *   - The same rule list is mirrored client-side (frontend renders live
 *     feedback) — keeping it as plain JS makes that easy to share/copy.
 */

// bcrypt silently truncates input >72 bytes — a 1 MB "password" both wastes
// CPU and is meaningless. Cap well under 72 bytes' worth of typical UTF-8.
const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

// Anything outside ASCII letters/digits we treat as a "symbol". Keeps the
// rule passphrase-friendly (Thai characters count as symbols, fine).
const UPPER_RE = /[A-Z]/;
const LOWER_RE = /[a-z]/;
const DIGIT_RE = /[0-9]/;
const SYMBOL_RE = /[^A-Za-z0-9]/;

// Top weak passwords. Not a full breach corpus — just blocks the embarrassing
// 'Password1!' / 'Qwerty123!' that pass complexity rules but are trivially
// guessed. For real production, plug in the HaveIBeenPwned API or k-anon hash.
const WEAK_PASSWORDS = new Set([
  'password',   'password1',   'password123', 'password1!', 'password!',
  'qwerty',     'qwerty123',   'qwerty1!',
  'admin',      'admin123',    'admin1!',     'administrator',
  'welcome',    'welcome1',    'welcome123',  'welcome1!',
  'letmein',    'letmein1!',   'changeme',    'changeme1!',
  'iloveyou',   'monkey',      'dragon',      'master',
  '12345678',   '123456789',   '1234567890',
  'abc12345',   'abc123!@#',
]);

const POLICY = Object.freeze({
  minLength: MIN_LENGTH,
  maxLength: MAX_LENGTH,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit:     true,
  requireSymbol:    true,
});

/**
 * Validate a candidate password.
 *
 * @param {string} pw
 * @param {object} [ctx]
 * @param {string} [ctx.employeeId]      — block "PASSWORD == EMP-001"
 * @param {string} [ctx.currentPassword] — block "no-op change to same value"
 * @returns {{ ok: boolean, errors: string[] }}
 */
const validatePassword = (pw, ctx = {}) => {
  const errors = [];

  if (typeof pw !== 'string' || pw.length === 0) {
    return { ok: false, errors: ['Password is required'] };
  }

  if (pw.length < MIN_LENGTH) {
    errors.push(`Password must be at least ${MIN_LENGTH} characters long`);
  }
  if (pw.length > MAX_LENGTH) {
    errors.push(`Password must not exceed ${MAX_LENGTH} characters`);
  }
  if (!UPPER_RE.test(pw)) errors.push('Password must contain an uppercase letter');
  if (!LOWER_RE.test(pw)) errors.push('Password must contain a lowercase letter');
  if (!DIGIT_RE.test(pw)) errors.push('Password must contain a digit');
  if (!SYMBOL_RE.test(pw)) errors.push('Password must contain a symbol');

  // All-whitespace passes the regexes above only by accident with weird
  // unicode; explicit check is cheap and bullet-proof.
  if (pw.trim().length === 0) {
    errors.push('Password must not be only whitespace');
  }

  const lower = pw.toLowerCase();
  if (WEAK_PASSWORDS.has(lower)) {
    errors.push('Password is too common — choose something unique to you');
  }

  if (ctx.employeeId && lower === String(ctx.employeeId).toLowerCase()) {
    errors.push('Password must not equal your employee ID');
  }

  if (ctx.currentPassword && pw === ctx.currentPassword) {
    errors.push('New password must differ from your current password');
  }

  return { ok: errors.length === 0, errors };
};

module.exports = { validatePassword, POLICY };
