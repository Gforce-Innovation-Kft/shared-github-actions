/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__', '<rootDir>/__integration__'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__integration__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@gforce/core$': '<rootDir>/../../../packages/core/src/index.ts',
    '^@gforce/github-actions-runtime$':
      '<rootDir>/../../../packages/github-actions-runtime/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
