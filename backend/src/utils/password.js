/**
 * Password policy + validator.
 *
 * Tuned for an INTERNAL TOOL (intranet, trusted users) — favours usability
 * over maximum entropy. The guardrails are intentionally minimal:
 *
 *   - 8-128 characters
 *   - not all whitespace
 *   - not equal to employee_id (catches the obvious mistake)
 *   - not equal to current password (catches the no-op change)
 *
 * What we DROPPED on purpose (and why):
 *
 *   - "must contain uppercase / lowercase / digit / symbol"
 *       Class rules push users toward predictable patterns ("Password1!")
 *       and a Post-it on the monitor. NIST SP 800-63B explicitly
 *       discourages composition rules in favour of length + breach checks.
 *   - common-word blocklist
 *       For an internal app the threat model is "annoying co-worker", not
 *       a credential-stuffing botnet. Audit log + rate limit handle it.
 *
 * If the threat model changes (extranet, customer-facing, MFA-less),
 * re-introduce the class rules + a real breach check (HIBP k-anonymity API).
 */

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;   // bcrypt truncates >72; cap well above for usability

const POLICY = Object.freeze({
  minLength: MIN_LENGTH,
  maxLength: MAX_LENGTH,
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
  if (pw.trim().length === 0) {
    errors.push('Password must not be only whitespace');
  }

  if (ctx.employeeId && pw.toLowerCase() === String(ctx.employeeId).toLowerCase()) {
    errors.push('Password must not equal your employee ID');
  }

  if (ctx.currentPassword && pw === ctx.currentPassword) {
    errors.push('New password must differ from your current password');
  }

  return { ok: errors.length === 0, errors };
};

module.exports = { validatePassword, POLICY };
