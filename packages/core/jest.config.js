/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/**/types.ts',
    // Interface-only stub (no implementation yet). The branch/PR/facade service
    // files now colocate their Octokit impls, so they stay covered.
    '!src/github-service/action/actionsService.ts',
    '!src/git-service/**',
    '!src/sfdx-service/**',
  ],
  // Transitional: this package is being dismantled action-by-action into
  // gforce-gha-src (which gates at 95%). Deleting fully-covered use cases
  // shifts the remaining ratio, so the branch gate is relaxed until teardown.
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
