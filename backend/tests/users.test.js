const request = require('supertest');
const app     = require('../src/app');
const { CREDS, findUserId } = require('./fixtures/users');
const { loginAs } = require('./helpers/auth');
const { waitForAuditRow } = require('./helpers/audit');

describe('GET /api/users (RBAC)', () => {
  it('admin can list all users', async () => {
    const { agent } = await loginAs(app, CREDS.admin);
    const res = await agent.get('/api/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  it('regular user is forbidden (403)', async () => {
    const { agent } = await loginAs(app, CREDS.user);
    const res = await agent.get('/api/users');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });

  it('anonymous request is unauthorised (401)', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/users (admin create)', () => {
  it('admin can create a new user', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.admin);
    const res = await agent
      .post('/api/users')
      .set('X-CSRF-Token', csrf)
      .send({
        employee_id:   'NEW-001',
        name:          'New Hire',
        email:         'new@test.local',
        password:      'NewP@ss123',
        role:          'user',
        department_id: null,
      });

    expect(res.status).toBe(201);
    expect(res.body.employee_id).toBe('NEW-001');
  });

  it('regular user cannot create users (403)', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.user);
    const res = await agent
      .post('/api/users')
      .set('X-CSRF-Token', csrf)
      .send({ employee_id: 'X', name: 'x', email: 'x@x', password: 'p' });

    expect(res.status).toBe(403);
  });

  it('rejects duplicate employee_id (409)', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.admin);
    const res = await agent
      .post('/api/users')
      .set('X-CSRF-Token', csrf)
      .send({
        employee_id: CREDS.user.employee_id,   // already exists from seed
        name:        'dup',
        email:       'dup@test.local',
        password:    'DupP@ss123',
      });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/users/:id', () => {
  it('admin can delete a user with no uploaded documents', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.admin);
    const targetId = await findUserId(CREDS.user2.employee_id);

    const res = await agent
      .delete(`/api/users/${targetId}`)
      .set('X-CSRF-Token', csrf);

    expect(res.status).toBe(200);

    // Audit row written
    const row = await waitForAuditRow({
      action:       'user.delete',
      resourceType: 'user',
      resourceId:   targetId,
    });
    expect(row.metadata.employee_id).toBe(CREDS.user2.employee_id.toUpperCase());
  });

  it('refuses to delete the calling admin (last-admin protection)', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.admin);
    const adminId = await findUserId(CREDS.admin.employee_id);

    const res = await agent
      .delete(`/api/users/${adminId}`)
      .set('X-CSRF-Token', csrf);

    // Self-delete is blocked first (400) before last-admin check fires.
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own account/i);
  });

  it('regular user cannot delete (403)', async () => {
    const { agent, csrf } = await loginAs(app, CREDS.user);
    const targetId = await findUserId(CREDS.user2.employee_id);

    const res = await agent
      .delete(`/api/users/${targetId}`)
      .set('X-CSRF-Token', csrf);

    expect(res.status).toBe(403);
  });
});
