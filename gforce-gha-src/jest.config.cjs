/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/integration/', '/e2e/'],
  collectCoverageFrom: [
    'actions/**/*.ts',
    'clients/**/*.ts',
    'libraries/**/*.ts',
    'services/**/*.ts',
    'selectors/**/*.ts',
    'utils/**/*.ts',
    '!**/*.d.ts',
    '!**/types.ts',
    // Barrels are pure re-exports; the CJS __exportStar helpers they transpile
    // to would otherwise skew function coverage.
    '!clients/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95,
    },
  },
};
