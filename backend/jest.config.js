/**
 * Jest config — integration tests against a real Postgres test DB.
 *
 * Why --runInBand and --forceExit (set in package.json scripts)?
 *   --runInBand    : tests share a single DB; parallel workers would race on
 *                    TRUNCATE/INSERT and produce flaky failures.
 *   --forceExit    : the pg Pool keeps async timers alive after the last
 *                    test; closing it cleanly across files (each with its
 *                    own beforeAll/afterAll) is fragile. forceExit is the
 *                    accepted Jest pattern for shared external resources.
 */
module.exports = {
  testEnvironment: 'node',
  // setupFiles runs BEFORE the test framework loads — set env vars here so
  // app.js / database.js see the right NODE_ENV / DATABASE_URL when imported.
  setupFiles: ['<rootDir>/tests/setup/env.js'],
  // globalSetup runs ONCE before all tests — apply schema to the test DB.
  globalSetup: '<rootDir>/tests/setup/global-setup.js',
  // setupFilesAfterEach loads after the framework — register beforeEach hooks.
  setupFilesAfterEach: ['<rootDir>/tests/setup/jest.setup.js'],

  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testTimeout: 10_000,

  // Coverage targets the API surface — middleware/services/controllers.
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',     // boot wrapper, integration-tested implicitly
    '!src/config/email.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'html', 'lcov'],

  verbose: true,
  clearMocks: true,
};
