/**
 * Integration coverage: drive the whole action — read inputs, validate, run the
 * orchestrator against an in-memory GitHub service, write outputs — through the
 * shared runtime runner (no network, no runner), and verify the committed bundle
 * exists.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as core from '@actions/core';
import type { CompareResult, GitHubService, PullRequestSummary } from '@gforce/core';
import { run } from '../src/create-release-pr/index';

jest.mock('@actions/core');

const REPO = { owner: 'Gforce-Innovation-Kft', repo: 'demo' };
const LOGGER = { debug() {}, info() {}, warning() {}, error() {} };

function stubInputs(overrides: Record<string, string> = {}): void {
  const values: Record<string, string> = {
    'source-branch': 'develop',
    'target-branch': 'main',
    'release-version': 'v1.2.0',
    labels: 'release',
    reviewers: 'octocat',
    'dry-run': 'false',
    'github-token': 'tok',
    ...overrides,
  };
  jest.mocked(core.getInput).mockImplementation((name: string) => values[name] ?? '');
}

function fakeService(partial: Partial<GitHubService>): GitHubService {
  return {
    compareBranches: jest.fn(),
    getBranchHeadSha: jest.fn(),
    updateBranchRef: jest.fn(),
    mergeBranches: jest.fn(),
    listOpenPullRequests: jest.fn(),
    createPullRequest: jest.fn(),
    updatePullRequest: jest.fn(),
    addLabels: jest.fn(),
    requestReviewers: jest.fn(),
    ...partial,
  } as unknown as GitHubService;
}

const comparison: CompareResult = {
  status: 'ahead',
  aheadBy: 2,
  behindBy: 0,
  totalCommits: 2,
  commits: [{ sha: 'abc1234def', message: 'feat: thing', author: 'octocat' }],
  files: [{ filename: 'a.ts', status: 'modified', additions: 1, deletions: 0 }],
};

const pr: PullRequestSummary = {
  number: 55,
  htmlUrl: 'https://example.test/pull/55',
  title: 'Release v1.2.0',
  state: 'open',
  draft: false,
  headRef: 'develop',
  baseRef: 'main',
};

describe('create-release-pr (integration)', () => {
  afterEach(() => jest.clearAllMocks());

  it('creates a release PR and applies labels + reviewers', async () => {
    stubInputs();
    const addLabels = jest.fn();
    const requestReviewers = jest.fn();
    const github = fakeService({
      compareBranches: jest.fn().mockResolvedValue(comparison),
      listOpenPullRequests: jest.fn().mockResolvedValue([]),
      createPullRequest: jest.fn().mockResolvedValue(pr),
      addLabels,
      requestReviewers,
    });

    await run({ github, repo: REPO, logger: LOGGER });

    const setOutput = jest.mocked(core.setOutput);
    expect(setOutput).toHaveBeenCalledWith('created', 'true');
    expect(setOutput).toHaveBeenCalledWith('pull-request-number', '55');
    expect(addLabels).toHaveBeenCalledWith(REPO, 55, ['release']);
    expect(requestReviewers).toHaveBeenCalledWith(REPO, 55, ['octocat']);
    expect(jest.mocked(core.setFailed)).not.toHaveBeenCalled();
  });

  it('reports an existing PR in dry-run without mutating', async () => {
    stubInputs({ 'dry-run': 'true' });
    const createPullRequest = jest.fn();
    const updatePullRequest = jest.fn();
    const github = fakeService({
      compareBranches: jest.fn().mockResolvedValue(comparison),
      listOpenPullRequests: jest.fn().mockResolvedValue([pr]),
      createPullRequest,
      updatePullRequest,
    });

    await run({ github, repo: REPO, logger: LOGGER });

    expect(createPullRequest).not.toHaveBeenCalled();
    expect(updatePullRequest).not.toHaveBeenCalled();
    expect(jest.mocked(core.setOutput)).toHaveBeenCalledWith('dry-run', 'true');
    expect(jest.mocked(core.setOutput)).toHaveBeenCalledWith('pull-request-number', '55');
  });

  it('ships a committed bundle', () => {
    expect(
      existsSync(
        join(
          __dirname,
          '..',
          '..',
          '..',
          '.github',
          'actions',
          'create-release-pr',
          'dist',
          'index.js',
        ),
      ),
    ).toBe(true);
  });
});
