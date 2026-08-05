/**
 * Shared Jest config for the action entry packages. Entries hold zero logic,
 * so their `test` scripts run with `--passWithNoTests`; real coverage lives in
 * gforce-gha-src.
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/dist/', '/node_modules/'],
};
