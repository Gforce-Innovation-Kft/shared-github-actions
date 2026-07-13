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
import { run } from '../src/sync-branches/index';

jest.mock('@actions/core');

const REPO = { owner: 'Gforce-Innovation-Kft', repo: 'demo' };
const LOGGER = { debug() {}, info() {}, warning() {}, error() {} };

function stubInputs(overrides: Record<string, string> = {}): void {
  const values: Record<string, string> = {
    'source-branch': 'develop',
    'target-branch': 'main',
    strategy: 'auto',
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

const diverged: CompareResult = {
  status: 'diverged',
  aheadBy: 2,
  behindBy: 3,
  totalCommits: 2,
  commits: [],
  files: [],
};

const pr: PullRequestSummary = {
  number: 101,
  htmlUrl: 'https://example.test/pull/101',
  title: 'Sync develop into main',
  state: 'open',
  draft: false,
  headRef: 'develop',
  baseRef: 'main',
};

describe('sync-branches (integration)', () => {
  afterEach(() => jest.clearAllMocks());

  it('opens a sync PR when a diverged merge conflicts', async () => {
    stubInputs();
    const github = fakeService({
      compareBranches: jest.fn().mockResolvedValue(diverged),
      mergeBranches: jest.fn().mockResolvedValue({ status: 'conflict' }),
      listOpenPullRequests: jest.fn().mockResolvedValue([]),
      createPullRequest: jest.fn().mockResolvedValue(pr),
    });

    await run({ github, repo: REPO, logger: LOGGER });

    const setOutput = jest.mocked(core.setOutput);
    expect(setOutput).toHaveBeenCalledWith('action', 'pull-request');
    expect(setOutput).toHaveBeenCalledWith('pull-request-number', '101');
    expect(jest.mocked(core.setFailed)).not.toHaveBeenCalled();
  });

  it('plans a fast-forward in dry-run mode without mutating', async () => {
    stubInputs({ 'dry-run': 'true' });
    const updateBranchRef = jest.fn();
    const github = fakeService({
      compareBranches: jest.fn().mockResolvedValue({
        ...diverged,
        status: 'ahead',
        aheadBy: 1,
        behindBy: 0,
      }),
      updateBranchRef,
    });

    await run({ github, repo: REPO, logger: LOGGER });

    expect(updateBranchRef).not.toHaveBeenCalled();
    expect(jest.mocked(core.setOutput)).toHaveBeenCalledWith('action', 'fast-forward');
    expect(jest.mocked(core.setOutput)).toHaveBeenCalledWith('synced', 'false');
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
          'sync-branches',
          'dist',
          'index.js',
        ),
      ),
    ).toBe(true);
  });
});
