import { GitHubClient } from '../../clients/github';
import type { BranchComparison } from '../../clients/github';
import { BranchSyncService } from '../../services/branch-sync-service';
import { LoggerService } from '../../services/logger-service';
import type { SyncBranchesRequest } from '../../types';
import { GitHubApiError } from '../../utils/errors';

const REPO = { owner: 'gforce', repo: 'demo' } as const;

const REQUEST: SyncBranchesRequest = {
  repo: REPO,
  sourceBranch: 'develop',
  targetBranch: 'main',
  strategy: 'auto',
  dryRun: false,
  githubToken: 'test-token',
};

const PR_SUMMARY = {
  number: 7,
  htmlUrl: 'https://github.com/gforce/demo/pull/7',
  title: 'Sync develop into main',
  state: 'open',
  draft: false,
  headRef: 'develop',
  baseRef: 'main',
};

function comparison(overrides: Partial<BranchComparison>): BranchComparison {
  return {
    status: 'ahead',
    aheadBy: 1,
    behindBy: 0,
    totalCommits: 1,
    commits: [],
    files: [],
    ...overrides,
  };
}

/** Spies on the shared facade the service resolves internally. */
function clientSpies(): {
  compare: jest.SpyInstance;
  headSha: jest.SpyInstance;
  updateRef: jest.SpyInstance;
  merge: jest.SpyInstance;
  list: jest.SpyInstance;
  create: jest.SpyInstance;
} {
  const client = GitHubClient.getInstance('test-token');
  return {
    compare: jest.spyOn(client, 'compareBranches'),
    headSha: jest.spyOn(client, 'getBranchHeadSha'),
    updateRef: jest.spyOn(client, 'updateBranchRef'),
    merge: jest.spyOn(client, 'mergeBranches'),
    list: jest.spyOn(client, 'listOpenPullRequests'),
    create: jest.spyOn(client, 'createPullRequest'),
  };
}

beforeEach(() => {
  jest.spyOn(LoggerService.getInstance(), 'info').mockImplementation(() => {});
  jest.spyOn(LoggerService.getInstance(), 'warning').mockImplementation(() => {});
});

afterEach(() => {
  BranchSyncService.resetInstance();
  GitHubClient.resetInstance();
  LoggerService.resetInstance();
  jest.restoreAllMocks();
});

describe('sync', () => {
  test('sync_sourceHasNothingNew_returnsNoneUpToDate', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(comparison({ status: 'identical', aheadBy: 0 }));

    // When
    const result = await BranchSyncService.getInstance().sync(REQUEST);

    // Then
    expect(spies.compare).toHaveBeenCalledWith(REPO, 'main', 'develop');
    expect(result).toEqual({
      action: 'none',
      synced: false,
      dryRun: false,
      aheadBy: 0,
      behindBy: 0,
      reason: 'up-to-date',
    });
  });

  test('sync_fastForwardStrategyOnDivergedBranches_returnsNotFastForwardable', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(comparison({ status: 'diverged', aheadBy: 2, behindBy: 3 }));

    // When
    const result = await BranchSyncService.getInstance().sync({
      ...REQUEST,
      strategy: 'fast-forward',
    });

    // Then
    expect(result).toEqual({
      action: 'none',
      synced: false,
      dryRun: false,
      aheadBy: 2,
      behindBy: 3,
      reason: 'not-fast-forwardable',
    });
    expect(spies.updateRef).not.toHaveBeenCalled();
    expect(spies.merge).not.toHaveBeenCalled();
  });

  test('sync_dryRunWithFastForwardPossible_reportsPlanWithoutMutating', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(comparison({ aheadBy: 1, behindBy: 0 }));

    // When
    const result = await BranchSyncService.getInstance().sync({ ...REQUEST, dryRun: true });

    // Then
    expect(result).toEqual({
      action: 'fast-forward',
      synced: false,
      dryRun: true,
      aheadBy: 1,
      behindBy: 0,
      reason: 'dry-run',
    });
    expect(spies.headSha).not.toHaveBeenCalled();
    expect(spies.updateRef).not.toHaveBeenCalled();
    expect(spies.merge).not.toHaveBeenCalled();
  });

  test('sync_dryRunWithDivergedBranches_reportsPlannedMerge', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(comparison({ status: 'diverged', aheadBy: 1, behindBy: 2 }));

    // When
    const result = await BranchSyncService.getInstance().sync({ ...REQUEST, dryRun: true });

    // Then
    expect(result).toEqual({
      action: 'merge',
      synced: false,
      dryRun: true,
      aheadBy: 1,
      behindBy: 2,
      reason: 'dry-run',
    });
    expect(spies.merge).not.toHaveBeenCalled();
  });

  test('sync_fastForwardPossible_updatesRefToSourceHead', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(comparison({ aheadBy: 1, behindBy: 0 }));
    spies.headSha.mockResolvedValue('head-sha');
    spies.updateRef.mockResolvedValue(undefined);

    // When
    const result = await BranchSyncService.getInstance().sync(REQUEST);

    // Then
    expect(spies.headSha).toHaveBeenCalledWith(REPO, 'develop');
    expect(spies.updateRef).toHaveBeenCalledWith(REPO, 'main', 'head-sha', false);
    expect(result).toEqual({
      action: 'fast-forward',
      synced: true,
      dryRun: false,
      aheadBy: 1,
      behindBy: 0,
      resultSha: 'head-sha',
      reason: 'fast-forward',
    });
  });

  test('sync_mergeStrategyWithFastForwardPossible_forcesServerSideMerge', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(comparison({ aheadBy: 1, behindBy: 0 }));
    spies.merge.mockResolvedValue({ status: 'merged', sha: 'merge-sha' });

    // When
    const result = await BranchSyncService.getInstance().sync({ ...REQUEST, strategy: 'merge' });

    // Then
    expect(spies.updateRef).not.toHaveBeenCalled();
    expect(spies.merge).toHaveBeenCalledWith(REPO, 'main', 'develop', 'Merge develop into main');
    expect(result).toEqual({
      action: 'merge',
      synced: true,
      dryRun: false,
      aheadBy: 1,
      behindBy: 0,
      resultSha: 'merge-sha',
      reason: 'merge',
    });
  });

  test('sync_divergedBranchesMergeSucceeds_returnsMerged', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(comparison({ status: 'diverged', aheadBy: 2, behindBy: 1 }));
    spies.merge.mockResolvedValue({ status: 'merged', sha: 'merge-sha' });

    // When
    const result = await BranchSyncService.getInstance().sync(REQUEST);

    // Then
    expect(result).toEqual({
      action: 'merge',
      synced: true,
      dryRun: false,
      aheadBy: 2,
      behindBy: 1,
      resultSha: 'merge-sha',
      reason: 'merge',
    });
  });

  test('sync_mergeReportsNothing_returnsAlreadyMerged', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(comparison({ status: 'diverged', aheadBy: 1, behindBy: 1 }));
    spies.merge.mockResolvedValue({ status: 'nothing' });

    // When
    const result = await BranchSyncService.getInstance().sync(REQUEST);

    // Then
    expect(result).toEqual({
      action: 'none',
      synced: false,
      dryRun: false,
      aheadBy: 1,
      behindBy: 1,
      reason: 'already-merged',
    });
  });

  test('sync_mergeConflictWithExistingPr_reusesPullRequest', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(comparison({ status: 'diverged', aheadBy: 1, behindBy: 1 }));
    spies.merge.mockResolvedValue({ status: 'conflict' });
    spies.list.mockResolvedValue([PR_SUMMARY]);

    // When
    const result = await BranchSyncService.getInstance().sync(REQUEST);

    // Then
    expect(spies.list).toHaveBeenCalledWith(REPO, { head: 'develop', base: 'main' });
    expect(spies.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      action: 'pull-request',
      synced: false,
      dryRun: false,
      aheadBy: 1,
      behindBy: 1,
      pullRequestNumber: 7,
      pullRequestUrl: 'https://github.com/gforce/demo/pull/7',
      reason: 'merge-conflict',
    });
  });

  test('sync_mergeConflictWithoutExistingPr_createsPullRequest', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(comparison({ status: 'diverged', aheadBy: 1, behindBy: 1 }));
    spies.merge.mockResolvedValue({ status: 'conflict' });
    spies.list.mockResolvedValue([]);
    spies.create.mockResolvedValue(PR_SUMMARY);

    // When
    const result = await BranchSyncService.getInstance().sync(REQUEST);

    // Then
    expect(spies.create).toHaveBeenCalledWith(REPO, {
      head: 'develop',
      base: 'main',
      title: 'Sync develop into main',
      body:
        'Automated sync pull request.\n\n' +
        'A direct merge of `develop` into `main` hit conflicts that need manual resolution.',
    });
    expect(result.action).toBe('pull-request');
    expect(result.pullRequestNumber).toBe(7);
  });

  test('sync_compareFails_propagatesGitHubApiError', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockRejectedValue(new GitHubApiError('Failed to compare branches: boom', 500));

    // When
    const act = BranchSyncService.getInstance().sync(REQUEST);

    // Then
    await expect(act).rejects.toBeInstanceOf(GitHubApiError);
    await expect(act).rejects.toThrow('Failed to compare branches: boom');
  });
});
