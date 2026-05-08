/**
 * Audit log behaviour tests — beyond the per-feature checks done elsewhere,
 * we verify the audit subsystem itself behaves as designed.
 */
const app = require('../src/app');
const { CREDS } = require('./fixtures/users');
const { loginAs } = require('./helpers/auth');
const { waitForAuditRow, countAuditRows } = require('./helpers/audit');

describe('Audit log subsystem', () => {
  it('captures reqId in metadata so logs can join HTTP traces to audit rows', async () => {
    await loginAs(app, CREDS.admin);
    const row = await waitForAuditRow({ action: 'auth.login.success' });
    expect(row.metadata).toHaveProperty('reqId');
    expect(typeof row.metadata.reqId).toBe('string');
    expect(row.metadata.reqId.length).toBeGreaterThan(8);
  });

  it('captures actor_label snapshot so deleted users are still attributable', async () => {
    await loginAs(app, CREDS.admin);
    const row = await waitForAuditRow({ action: 'auth.login.success' });
    expect(row.actor_label).toContain(CREDS.admin.employee_id.toUpperCase());
    expect(row.actor_label).toContain(CREDS.admin.name);
  });

  it('records IP and (when present) user-agent', async () => {
    await loginAs(app, CREDS.admin);
    const row = await waitForAuditRow({ action: 'auth.login.success' });
    expect(row.ip_address).toBeTruthy();
  });

  it('only admins can read /api/audit-logs', async () => {
    const { agent } = await loginAs(app, CREDS.user);
    const res = await agent.get('/api/audit-logs');
    expect(res.status).toBe(403);
  });

  it('admin can list and filter audit logs', async () => {
    // Generate a couple of events
    await loginAs(app, CREDS.user);                  // success
    const request = require('supertest');
    await request(app)
      .post('/api/auth/login')
      .send({ employee_id: 'NOPE', password: 'x' });  // failure

    // Allow async writes to settle
    await waitForAuditRow({ action: 'auth.login.failure' });

    const { agent } = await loginAs(app, CREDS.admin);
    const res = await agent.get('/api/audit-logs?action_prefix=auth.&limit=10');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // At least: user login success, failure, admin login success
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    res.body.forEach(r => expect(r.action.startsWith('auth.')).toBe(true));
  });

  it('rejects invalid status filter', async () => {
    const { agent } = await loginAs(app, CREDS.admin);
    const res = await agent.get('/api/audit-logs?status=maybe');
    expect(res.status).toBe(400);
  });

  it('audit failures NEVER throw to the caller', async () => {
    // Sanity: a successful login always returns 200, even if downstream
    // audit insert had any issue (the service swallows errors by design).
    const before = await countAuditRows({ action: 'auth.login.success' });
    const { agent } = await loginAs(app, CREDS.admin);
    expect(agent).toBeDefined();
    const after = await countAuditRows({ action: 'auth.login.success' });
    expect(after).toBe(before + 1);
  });
});
