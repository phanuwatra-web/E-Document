/**
 * Document + signing flow tests.
 *
 * Uploading PDFs is out of scope (multipart + fixture binary) — these tests
 * insert a document directly via SQL so we can focus on the signing API.
 */
const app  = require('../src/app');
const db   = require('../src/config/database');
const { CREDS, findUserId } = require('./fixtures/users');
const { loginAs } = require('./helpers/auth');
const { waitForAuditRow } = require('./helpers/audit');

const seedDocumentForUser = async (employeeId) => {
  const dept = await db.query(`SELECT id FROM departments LIMIT 1`);
  const userId = await findUserId(employeeId);
  const adminId = await findUserId(CREDS.admin.employee_id);

  const doc = await db.query(
    `INSERT INTO documents (title, file_path, original_name, file_size, department_id, uploaded_by)
     VALUES ('Test Doc', 'test.pdf', 'test.pdf', 1024, $1, $2) RETURNING id`,
    [dept.rows[0].id, adminId]
  );
  await db.query(
    `INSERT INTO document_assignments (document_id, user_id) VALUES ($1, $2)`,
    [doc.rows[0].id, userId]
  );
  return doc.rows[0].id;
};

describe('POST /api/signatures (sign flow)', () => {
  it('creates a click-type signature + writes audit row', async () => {
    const docId = await seedDocumentForUser(CREDS.user.employee_id);
    const { agent, csrf } = await loginAs(app, CREDS.user);

    const res = await agent
      .post('/api/signatures')
      .set('X-CSRF-Token', csrf)
      .send({
        document_id:    docId,
        signature_type: 'click',
        page_num:       1,
        x_pct:          0.1,
        y_pct:          0.2,
        width_pct:      0.25,
      });

    expect(res.status).toBe(201);
    expect(res.body.signature.signature_type).toBe('click');

    // Assignment status flips to 'signed'
    const userId = await findUserId(CREDS.user.employee_id);
    const a = await db.query(
      `SELECT status FROM document_assignments WHERE document_id=$1 AND user_id=$2`,
      [docId, userId]
    );
    expect(a.rows[0].status).toBe('signed');

    // Audit row
    const row = await waitForAuditRow({
      action:       'signature.sign',
      resourceType: 'signature',
    });
    expect(row.metadata).toMatchObject({
      document_id:    docId,
      signature_type: 'click',
    });
  });

  it('rejects "draw" type without signature_data (400)', async () => {
    const docId = await seedDocumentForUser(CREDS.user.employee_id);
    const { agent, csrf } = await loginAs(app, CREDS.user);

    const res = await agent
      .post('/api/signatures')
      .set('X-CSRF-Token', csrf)
      .send({ document_id: docId, signature_type: 'draw' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signature_data/i);
  });

  it('rejects unknown signature_type (400)', async () => {
    const docId = await seedDocumentForUser(CREDS.user.employee_id);
    const { agent, csrf } = await loginAs(app, CREDS.user);

    const res = await agent
      .post('/api/signatures')
      .set('X-CSRF-Token', csrf)
      .send({ document_id: docId, signature_type: 'wave' });

    expect(res.status).toBe(400);
  });

  it('refuses signing a doc the user is not assigned to (403)', async () => {
    const docId = await seedDocumentForUser(CREDS.user.employee_id);
    const { agent, csrf } = await loginAs(app, CREDS.user2);   // different user

    const res = await agent
      .post('/api/signatures')
      .set('X-CSRF-Token', csrf)
      .send({ document_id: docId, signature_type: 'click' });

    expect(res.status).toBe(403);
  });

  it('refuses signing twice without unsigning first (409)', async () => {
    const docId = await seedDocumentForUser(CREDS.user.employee_id);
    const { agent, csrf } = await loginAs(app, CREDS.user);

    await agent
      .post('/api/signatures')
      .set('X-CSRF-Token', csrf)
      .send({ document_id: docId, signature_type: 'click' });

    const res = await agent
      .post('/api/signatures')
      .set('X-CSRF-Token', csrf)
      .send({ document_id: docId, signature_type: 'click' });

    expect(res.status).toBe(409);
  });

  it('anonymous request → 401', async () => {
    const docId = await seedDocumentForUser(CREDS.user.employee_id);
    const request = require('supertest');
    const res = await request(app)
      .post('/api/signatures')
      .send({ document_id: docId, signature_type: 'click' });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/signatures/me/:documentId (update position)', () => {
  it('updates position and audit captures before/after', async () => {
    const docId = await seedDocumentForUser(CREDS.user.employee_id);
    const { agent, csrf } = await loginAs(app, CREDS.user);

    await agent
      .post('/api/signatures')
      .set('X-CSRF-Token', csrf)
      .send({ document_id: docId, signature_type: 'click', page_num: 1, x_pct: 0.05, y_pct: 0.10, width_pct: 0.22 });

    const res = await agent
      .patch(`/api/signatures/me/${docId}`)
      .set('X-CSRF-Token', csrf)
      .send({ page_num: 2, x_pct: 0.5, y_pct: 0.5, width_pct: 0.30 });

    expect(res.status).toBe(200);

    const row = await waitForAuditRow({ action: 'signature.update_position' });
    // Server stores NUMERIC(5,4) which pg returns as strings; compare loosely.
    expect(parseFloat(row.metadata.before.x_pct)).toBeCloseTo(0.05);
    expect(row.metadata.after.x_pct).toBeCloseTo(0.5);
  });
});
