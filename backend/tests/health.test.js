const request = require('supertest');
const app     = require('../src/app');

describe('GET /health (liveness)', () => {
  it('returns 200 with uptime + timestamp + requestId', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status:    'ok',
      uptime:    expect.any(Number),
      timestamp: expect.any(String),
    });
    expect(res.body.uptime).toBeGreaterThan(0);
    // requestId is also returned in the X-Request-Id response header
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('does not require auth (orchestrators call without cookies)', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});

describe('GET /readiness', () => {
  it('returns 200 ready when DB is reachable', async () => {
    const res = await request(app).get('/readiness');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks.database.status).toBe('ok');
    expect(res.body.checks.database.latencyMs).toEqual(expect.any(Number));
  });

  it('does not leak internal error details on success', async () => {
    const res = await request(app).get('/readiness');
    // No DB version, hostname, or error stack should ever appear here.
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/postgresql|password|connection/i);
  });
});
