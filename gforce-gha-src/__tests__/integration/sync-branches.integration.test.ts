/**
 * End-to-end: raw kebab-case inputs -> Validator -> GithubContextService ->
 * BranchSyncService -> GitHubClient (mocked at the client boundary). Also
 * asserts the committed bundle the runner executes exists.
 */
import * as fs from 'fs';
import * as path from 'path';

import { Orchestrator } from '../../actions/sync-branches/orchestrator';
import { GitHubClient } from '../../clients/github';
import { LoggerService } from '../../services/logger-service';

const ORIGINAL_ENV = process.env.GITHUB_REPOSITORY;

beforeEach(() => {
  process.env.GITHUB_REPOSITORY = 'gforce/demo';
  jest.spyOn(LoggerService.getInstance(), 'info').mockImplementation(() => {});
  jest.spyOn(LoggerService.getInstance(), 'warning').mockImplementation(() => {});
});

afterEach(() => {
  Orchestrator.resetInstance();
  GitHubClient.resetInstance();
  LoggerService.resetInstance();
  jest.restoreAllMocks();
  if (ORIGINAL_ENV === undefined) {
    delete process.env.GITHUB_REPOSITORY;
  } else {
    process.env.GITHUB_REPOSITORY = ORIGINAL_ENV;
  }
});

describe('sync-branches end-to-end', () => {
  test('execute_dryRunDefaultOnAheadBranch_plansFastForwardWithoutMutating', async () => {
    // Given
    const client = GitHubClient.getInstance('test-token');
    const compareSpy = jest.spyOn(client, 'compareBranches').mockResolvedValue({
      status: 'ahead',
      aheadBy: 3,
      behindBy: 0,
      totalCommits: 3,
      commits: [],
      files: [],
    });
    const updateRefSpy = jest.spyOn(client, 'updateBranchRef');

    // When
    const result = await Orchestrator.getInstance().execute({
      'source-branch': 'develop',
      'target-branch': 'main',
      strategy: '',
      'dry-run': '',
      'github-token': 'test-token',
    });

    // Then
    expect(compareSpy).toHaveBeenCalledWith({ owner: 'gforce', repo: 'demo' }, 'main', 'develop');
    expect(updateRefSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      action: 'fast-forward',
      synced: false,
      dryRun: true,
      aheadBy: 3,
      behindBy: 0,
      reason: 'dry-run',
    });
  });

  test('execute_liveRunOnAheadBranch_fastForwardsTargetRef', async () => {
    // Given
    const client = GitHubClient.getInstance('test-token');
    jest.spyOn(client, 'compareBranches').mockResolvedValue({
      status: 'ahead',
      aheadBy: 1,
      behindBy: 0,
      totalCommits: 1,
      commits: [],
      files: [],
    });
    jest.spyOn(client, 'getBranchHeadSha').mockResolvedValue('head-sha');
    const updateRefSpy = jest.spyOn(client, 'updateBranchRef').mockResolvedValue(undefined);

    // When
    const result = await Orchestrator.getInstance().execute({
      'source-branch': 'develop',
      'target-branch': 'main',
      strategy: 'auto',
      'dry-run': 'false',
      'github-token': 'test-token',
    });

    // Then
    expect(updateRefSpy).toHaveBeenCalledWith(
      { owner: 'gforce', repo: 'demo' },
      'main',
      'head-sha',
      false,
    );
    expect(result.synced).toBe(true);
    expect(result.action).toBe('fast-forward');
    expect(result.resultSha).toBe('head-sha');
  });

  test('bundle_committedDistIndexJs_exists', () => {
    // Given
    const bundlePath = path.resolve(
      __dirname,
      '../../../.github/actions/sync-branches/dist/index.js',
    );

    // When
    const exists = fs.existsSync(bundlePath);

    // Then
    expect(exists).toBe(true);
  });
});
