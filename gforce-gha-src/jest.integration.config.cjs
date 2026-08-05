/**
 * Integration suite: drives each action's Orchestrator end-to-end (validate ->
 * context -> service -> clients mocked at the boundary) and asserts the
 * committed bundle exists. Run via `npm run test:integration`.
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__/integration'],
  testMatch: ['**/*.integration.test.ts'],
};
