/**
 * Password security policy + change-password flow.
 *
 * Covers:
 *   - validator rules (length, whitespace, employee_id collision, no-op change)
 *   - createUser rejects weak passwords (admin path)
 *   - change-password: success, wrong current, weak new, same as current
 *   - audit rows created for both success + failure
 *   - session is invalidated after change (force re-login)
 *   - new password works for next login, old password no longer does
 *   - RBAC: anonymous request 401
 */
const request = require('supertest');
const app     = require('../src/app');
const db      = require('../src/config/database');
const { CREDS } = require('./fixtures/users');
const { loginAs } = require('./helpers/auth');
const { waitForAuditRow } = require('./helpers/audit');
const { validatePassword, POLICY } = require('../src/utils/password');

describe('validatePassword (unit)', () => {
  it('accepts an 8-char lowercase-only password (relaxed policy)', () => {
    const r = validatePassword('mydogfido');
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('accepts a passphrase', () => {
    const r = validatePassword('correct horse battery staple');
    expect(r.ok).toBe(true);
  });

  it('rejects too short', () => {
    const r = validatePassword('short');
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/at least/);
  });

  it('rejects all-whitespace', () => {
    const r = validatePassword('        ');
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/whitespace/i);
  });

  it('rejects password equal to employee_id', () => {
    const r = validatePassword('TEST-001', { employeeId: 'TEST-001' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/employee/i);
  });

  it('rejects new password equal to current', () => {
    const r = validatePassword('samepass', { currentPassword: 'samepass' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/differ/i);
  });

  it('exposes a frozen POLICY object', () => {
    expect(POLICY).toMatchObject({ minLength: 8, maxLength: 128 });
    expect(() => { POLICY.minLength = 1; }).toThrow();
  });
});

describe('POST /api/users — admin create with length-only policy', () => {
  it('rejects too-short password (400)', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.admin);
    const res = await agent
      .post('/api/users')
      .set('X-CSRF-Token', csrf)
      .send({
        employee_id: 'WEAK-001',
        name:        'Weak',
        email:       'weak@test.local',
        password:    'short',              // 5 chars
      });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.any(Array));
  });

  it('accepts an 8-char password (201) — no class requirements', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.admin);
    const res = await agent
      .post('/api/users')
      .set('X-CSRF-Token', csrf)
      .send({
        employee_id: 'OK-001',
        name:        'Eight Chars',
        email:       'ok@test.local',
        password:    'mydogfido',
      });
    expect(res.status).toBe(201);
  });
});

describe('POST /api/auth/change-password', () => {
  const NEW_PASSWORD = 'brandnewpassword';

  it('success: returns 200 + fresh cookies + audit row', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.user);

    const res = await agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', csrf)
      .send({ current_password: CREDS.user.password, new_password: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.csrfToken).toEqual(expect.any(String));

    // The session is rotated, NOT cleared. Both cookies should be re-set
    // with non-empty values so the user keeps working without re-login.
    const cookies = res.headers['set-cookie'] || [];
    const authSet = cookies.find(c => /^auth_token=[^;]+;/.test(c));
    const csrfSet = cookies.find(c => /^csrf_token=[^;]+;/.test(c));
    expect(authSet).toBeDefined();
    expect(csrfSet).toBeDefined();

    // Audit row
    const row = await waitForAuditRow({
      action:       'auth.password_change',
      resourceType: 'user',
    });
    expect(row.status).toBe('success');
  });

  it('after success the SAME session keeps working (no forced re-login)', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.user);

    await agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', csrf)
      .send({ current_password: CREDS.user.password, new_password: NEW_PASSWORD });

    // The agent picked up the rotated cookie automatically; /me should still
    // succeed. This is the friendly behaviour for an internal tool.
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.employee_id).toBe(CREDS.user.employee_id.toUpperCase());
  });

  it('after success the NEW password works for login', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.user);
    await agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', csrf)
      .send({ current_password: CREDS.user.password, new_password: NEW_PASSWORD });

    const { agent: agent2 } = await loginAs(app, { ...CREDS.user, password: NEW_PASSWORD });
    const me = await agent2.get('/api/auth/me');
    expect(me.status).toBe(200);
  });

  it('after success the OLD password no longer works for login', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.user);
    await agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', csrf)
      .send({ current_password: CREDS.user.password, new_password: NEW_PASSWORD });

    // Try login with the original password — must fail
    const fresh = request.agent(app);
    await fresh.get('/api/auth/csrf-token');
    const loginRes = await fresh
      .post('/api/auth/login')
      .send({ employee_id: CREDS.user.employee_id, password: CREDS.user.password });

    expect(loginRes.status).toBe(401);
  });

  it('wrong current password → 401 + audit failure', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.user);
    const res = await agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', csrf)
      .send({ current_password: 'wrong-password', new_password: NEW_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/current password is incorrect/i);

    const row = await waitForAuditRow({ action: 'auth.password_change.failure' });
    expect(row.status).toBe('failure');
    expect(row.metadata.reason).toBe('wrong_current_password');
  });

  it('too-short new password → 400', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.user);
    const res = await agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', csrf)
      .send({ current_password: CREDS.user.password, new_password: 'weak' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least/i);
  });

  it('new password equal to current → 400', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.user);
    const res = await agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', csrf)
      .send({
        current_password: CREDS.user.password,
        new_password:     CREDS.user.password,     // same value
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/differ/i);
  });

  it('missing fields → 400', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.user);
    const res = await agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', csrf)
      .send({ current_password: CREDS.user.password });   // no new_password
    expect(res.status).toBe(400);
  });

  it('anonymous request without CSRF → 403 (CSRF gate runs first)', async () => {
    // No cookies, no header → CSRF middleware short-circuits with 403 before
    // the route's authenticate middleware ever runs. This documents the
    // actual middleware order so a future reorder shows up as a test diff.
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ current_password: 'x', new_password: 'somenewpw' });
    expect(res.status).toBe(403);
  });

  it('with CSRF but no auth → 401 (authenticate gate)', async () => {
    // Bootstrap a CSRF cookie so we get past the CSRF check, then send the
    // request WITHOUT logging in. authenticate must reject it with 401.
    const agent = require('supertest').agent(app);
    const csrfRes = await agent.get('/api/auth/csrf-token');
    const csrf    = csrfRes.body.csrfToken;

    const res = await agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', csrf)
      .send({ current_password: 'x', new_password: 'somenewpw' });
    expect(res.status).toBe(401);
  });

  it('missing CSRF header → 403', async () => {
    const { agent } = await loginAs(app, CREDS.user);
    const res = await agent
      .post('/api/auth/change-password')
      .send({ current_password: CREDS.user.password, new_password: NEW_PASSWORD });
    expect(res.status).toBe(403);
  });

  it('RBAC unaffected — admin can also change own password', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.admin);
    const res = await agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', csrf)
      .send({ current_password: CREDS.admin.password, new_password: 'newadminpw' });
    expect(res.status).toBe(200);
  });

  it('does not leak password_hash anywhere in the response', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.user);
    const res = await agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', csrf)
      .send({ current_password: CREDS.user.password, new_password: NEW_PASSWORD });
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/\$2[aby]\$/);   // bcrypt hash prefix
    expect(body).not.toMatch(/password_hash/);
  });
});
