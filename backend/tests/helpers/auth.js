/**
 * Auth helpers for tests.
 *
 * loginAs() returns a supertest agent with cookies persisted PLUS the CSRF
 * token, so a test can immediately make state-changing calls:
 *
 *   const { agent, csrf } = await loginAs(app, CREDS.admin);
 *   await agent.delete(`/api/users/${id}`).set('X-CSRF-Token', csrf);
 */
const request = require('supertest');

const loginAs = async (app, creds) => {
  const agent = request.agent(app);

  // Bootstrap CSRF — sets the csrf_token cookie AND returns the token.
  // Both server checks AND header value compare against this token.
  const csrfRes = await agent.get('/api/auth/csrf-token');
  if (csrfRes.status !== 200) {
    throw new Error(`csrf bootstrap failed: ${csrfRes.status} ${JSON.stringify(csrfRes.body)}`);
  }
  const csrf = csrfRes.body.csrfToken;

  // Login. Login is CSRF-exempt server-side but we send the header anyway —
  // it's harmless and exercises the same code path as real clients.
  const loginRes = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf)
    .send({ employee_id: creds.employee_id, password: creds.password });

  if (loginRes.status !== 200) {
    throw new Error(`login failed: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }

  // After login the server rotates the csrf cookie. Pull the new value
  // from the response so subsequent X-CSRF-Token headers match.
  const csrfAfterLogin = loginRes.body.csrfToken || csrf;

  return { agent, csrf: csrfAfterLogin, user: loginRes.body.user };
};

module.exports = { loginAs };
