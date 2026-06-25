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
    // Service interfaces (type-only); the octokit*Service impls + client stay covered.
    '!src/github-service/branch/branchService.ts',
    '!src/github-service/pull-request/pullRequestService.ts',
    '!src/github-service/action/actionsService.ts',
    '!src/github-service/github/gitHubService.ts',
    '!src/git-service/**',
    '!src/sfdx-service/**',
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
