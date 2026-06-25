/** Shared test doubles for the core suites. (Not a test file itself.) */
import type { BranchService } from '../../src/github-service/branch/branchService';
import type { GitHubService } from '../../src/github-service/github/gitHubService';
import type { PullRequestService } from '../../src/github-service/pull-request/pullRequestService';
import type { PullRequestSummary } from '../../src/github-service/pull-request/types';
import type { RepoRef } from '../../src/github-service/types';

export const REPO: RepoRef = { owner: 'gforceinnovation', repo: 'demo' };

export function createFakeBranchService(): jest.Mocked<BranchService> {
  return {
    compareBranches: jest.fn(),
    getBranchHeadSha: jest.fn(),
    updateBranchRef: jest.fn(),
    mergeBranches: jest.fn(),
  } as unknown as jest.Mocked<BranchService>;
}

export function createFakePullRequestService(): jest.Mocked<PullRequestService> {
  return {
    listOpenPullRequests: jest.fn(),
    createPullRequest: jest.fn(),
    updatePullRequest: jest.fn(),
    addLabels: jest.fn(),
    requestReviewers: jest.fn(),
  } as unknown as jest.Mocked<PullRequestService>;
}

export function createFakeGitHubService(): jest.Mocked<GitHubService> {
  return {
    ...createFakeBranchService(),
    ...createFakePullRequestService(),
  } as unknown as jest.Mocked<GitHubService>;
}

export function pullRequest(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    number: 1,
    htmlUrl: 'https://github.com/gforceinnovation/demo/pull/1',
    title: 'PR',
    state: 'open',
    draft: false,
    headRef: 'develop',
    baseRef: 'main',
    ...overrides,
  };
}
