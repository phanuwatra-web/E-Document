const request = require('supertest');
const app     = require('../src/app');
const { CREDS } = require('./fixtures/users');
const { loginAs } = require('./helpers/auth');
const { waitForAuditRow } = require('./helpers/audit');

const cookieByName = (cookies, name) =>
  (cookies || []).find(c => c.startsWith(`${name}=`));

describe('GET /api/auth/csrf-token', () => {
  it('issues a csrf cookie + returns the token in body', async () => {
    const res = await request(app).get('/api/auth/csrf-token');

    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toEqual(expect.any(String));
    expect(res.body.csrfToken.length).toBeGreaterThan(20);

    const csrfCookie = cookieByName(res.headers['set-cookie'], 'csrf_token');
    expect(csrfCookie).toBeDefined();
    // Must be readable by JS so the SPA can echo it back as a header.
    expect(csrfCookie.toLowerCase()).not.toContain('httponly');
  });
});

describe('POST /api/auth/login', () => {
  it('200 + sets httpOnly auth cookie + rotates csrf', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/auth/csrf-token');
    const csrf = csrfRes.body.csrfToken;

    const res = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ employee_id: CREDS.admin.employee_id, password: CREDS.admin.password });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      employee_id: CREDS.admin.employee_id.toUpperCase(),
      role:        'admin',
    });
    // Token must NEVER be in body anymore (Phase 2 contract).
    expect(res.body.token).toBeUndefined();

    const cookies = res.headers['set-cookie'] || [];
    const auth = cookieByName(cookies, 'auth_token');
    const csrfNew = cookieByName(cookies, 'csrf_token');

    expect(auth).toBeDefined();
    expect(auth.toLowerCase()).toContain('httponly');     // XSS-proof
    expect(auth.toLowerCase()).toContain('samesite=lax'); // CSRF defence

    expect(csrfNew).toBeDefined();
    expect(csrfNew.toLowerCase()).not.toContain('httponly'); // SPA reads this
  });

  it('401 with generic message on wrong password (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ employee_id: CREDS.admin.employee_id, password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid employee ID or password');
  });

  it('401 with same message on unknown user (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ employee_id: 'NOT-EXIST', password: 'whatever' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid employee ID or password');
  });

  it('400 when payload is missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ employee_id: CREDS.admin.employee_id });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  it('writes auth.login.success audit row', async () => {
    await loginAs(app, CREDS.admin);
    const row = await waitForAuditRow({ action: 'auth.login.success' });
    expect(row.actor_label).toContain(CREDS.admin.employee_id.toUpperCase());
    expect(row.status).toBe('success');
  });

  it('writes auth.login.failure audit row on bad password', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ employee_id: CREDS.admin.employee_id, password: 'wrong' });
    const row = await waitForAuditRow({ action: 'auth.login.failure' });
    expect(row.status).toBe('failure');
    expect(row.metadata.reason).toBe('wrong_password');
  });
});

describe('GET /api/auth/me', () => {
  it('200 with current user info when authenticated', async () => {
    const { agent } = await loginAs(app, CREDS.user);
    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.employee_id).toBe(CREDS.user.employee_id.toUpperCase());
    expect(res.body.role).toBe('user');
  });

  it('401 when no cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears both auth cookies', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.user);

    const res = await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', csrf);

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] || [];
    // Both cookies should be sent with an expired/zero Max-Age to clear them.
    const auth = cookieByName(cookies, 'auth_token');
    const csrfClear = cookieByName(cookies, 'csrf_token');
    expect(auth).toBeDefined();
    expect(auth.toLowerCase()).toMatch(/max-age=0|expires=/i);
    expect(csrfClear).toBeDefined();
  });

  it('invalidates the session — /auth/me returns 401 after logout', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.user);
    await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf);
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('CSRF protection', () => {
  it('403 when state-changing request omits X-CSRF-Token', async () => {
    const { agent } = await loginAs(app, CREDS.user);
    // Skip CSRF header on a POST that needs it
    const res = await agent.post('/api/auth/logout');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/csrf/i);
  });

  it('403 when X-CSRF-Token does not match the cookie', async () => {
    const { agent } = await loginAs(app, CREDS.user);
    const res = await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', 'wrong-value');
    expect(res.status).toBe(403);
  });

  it('GET requests bypass CSRF (safe method)', async () => {
    const { agent } = await loginAs(app, CREDS.user);
    // No X-CSRF-Token header on a GET — must still succeed.
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
  });
});
