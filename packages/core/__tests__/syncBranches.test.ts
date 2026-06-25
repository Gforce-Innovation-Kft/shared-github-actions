import { runSyncBranchesAction, syncBranches } from '../src/actions/syncBranches/syncBranches';
import type {
  SyncBranchesRequest,
  SyncStrategy,
  ValidatedSyncInputs,
} from '../src/actions/syncBranches/types';
import type { CompareResult } from '../src/github-service/branch/types';
import { NoopLogger } from '../src/utils/logging/logger';
import { createFakeGitHubService, pullRequest, REPO } from './support/fakes';

function compare(overrides: Partial<CompareResult>): CompareResult {
  return {
    status: 'diverged',
    aheadBy: 1,
    behindBy: 1,
    totalCommits: 1,
    commits: [],
    files: [],
    ...overrides,
  };
}

function request(strategy: SyncStrategy = 'auto', dryRun = false): SyncBranchesRequest {
  return {
    repo: REPO,
    sourceBranch: 'develop',
    targetBranch: 'main',
    strategy,
    dryRun,
  };
}

describe('syncBranches', () => {
  it('does nothing when the source has no new commits', async () => {
    const github = createFakeGitHubService();
    github.compareBranches.mockResolvedValue(
      compare({ status: 'behind', aheadBy: 0, behindBy: 2 }),
    );

    const result = await syncBranches(request(), { github, logger: NoopLogger });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.action).toBe('none');
      expect(result.value.synced).toBe(false);
      expect(result.value.reason).toBe('up-to-date');
    }
    expect(github.updateBranchRef).not.toHaveBeenCalled();
    expect(github.mergeBranches).not.toHaveBeenCalled();
  });

  it('fast-forwards when the target is an ancestor of source', async () => {
    const github = createFakeGitHubService();
    github.compareBranches.mockResolvedValue(compare({ status: 'ahead', aheadBy: 2, behindBy: 0 }));
    github.getBranchHeadSha.mockResolvedValue('sha-ff');

    const result = await syncBranches(request(), { github, logger: NoopLogger });

    expect(github.getBranchHeadSha).toHaveBeenCalledWith(REPO, 'develop');
    expect(github.updateBranchRef).toHaveBeenCalledWith(REPO, 'main', 'sha-ff', false);
    expect(github.mergeBranches).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.value).toMatchObject({
        action: 'fast-forward',
        synced: true,
        resultSha: 'sha-ff',
      });
    }
  });

  it('merges when the branches have diverged', async () => {
    const github = createFakeGitHubService();
    github.compareBranches.mockResolvedValue(compare({ aheadBy: 2, behindBy: 3 }));
    github.mergeBranches.mockResolvedValue({ status: 'merged', sha: 'merge-sha' });

    const result = await syncBranches(request(), { github, logger: NoopLogger });

    expect(github.mergeBranches).toHaveBeenCalledWith(
      REPO,
      'main',
      'develop',
      'Merge develop into main',
    );
    if (result.ok) {
      expect(result.value).toMatchObject({ action: 'merge', synced: true, resultSha: 'merge-sha' });
    }
  });

  it('opens a sync PR when a diverged merge conflicts', async () => {
    const github = createFakeGitHubService();
    github.compareBranches.mockResolvedValue(compare({ aheadBy: 2, behindBy: 3 }));
    github.mergeBranches.mockResolvedValue({ status: 'conflict' });
    github.listOpenPullRequests.mockResolvedValue([]);
    github.createPullRequest.mockResolvedValue(
      pullRequest({ number: 42, htmlUrl: 'https://example.test/pull/42' }),
    );

    const result = await syncBranches(request(), { github, logger: NoopLogger });

    expect(github.createPullRequest).toHaveBeenCalledWith(
      REPO,
      expect.objectContaining({ head: 'develop', base: 'main' }),
    );
    if (result.ok) {
      expect(result.value).toMatchObject({
        action: 'pull-request',
        synced: false,
        pullRequestNumber: 42,
        reason: 'merge-conflict',
      });
    }
  });

  it('reuses an existing sync PR on conflict', async () => {
    const github = createFakeGitHubService();
    github.compareBranches.mockResolvedValue(compare({ aheadBy: 2, behindBy: 3 }));
    github.mergeBranches.mockResolvedValue({ status: 'conflict' });
    github.listOpenPullRequests.mockResolvedValue([pullRequest({ number: 9 })]);

    const result = await syncBranches(request(), { github, logger: NoopLogger });

    expect(github.createPullRequest).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.value.pullRequestNumber).toBe(9);
    }
  });

  it('reports an already-merged outcome', async () => {
    const github = createFakeGitHubService();
    github.compareBranches.mockResolvedValue(compare({ aheadBy: 2, behindBy: 3 }));
    github.mergeBranches.mockResolvedValue({ status: 'nothing' });

    const result = await syncBranches(request(), { github, logger: NoopLogger });

    if (result.ok) {
      expect(result.value).toMatchObject({ action: 'none', reason: 'already-merged' });
    }
  });

  describe('dry run', () => {
    it('plans a fast-forward without mutating', async () => {
      const github = createFakeGitHubService();
      github.compareBranches.mockResolvedValue(
        compare({ status: 'ahead', aheadBy: 1, behindBy: 0 }),
      );

      const result = await syncBranches(request('auto', true), { github, logger: NoopLogger });

      expect(github.updateBranchRef).not.toHaveBeenCalled();
      if (result.ok) {
        expect(result.value).toMatchObject({
          action: 'fast-forward',
          synced: false,
          reason: 'dry-run',
        });
      }
    });

    it('plans a merge without mutating', async () => {
      const github = createFakeGitHubService();
      github.compareBranches.mockResolvedValue(compare({ aheadBy: 2, behindBy: 2 }));

      const result = await syncBranches(request('auto', true), { github, logger: NoopLogger });

      expect(github.mergeBranches).not.toHaveBeenCalled();
      if (result.ok) {
        expect(result.value).toMatchObject({ action: 'merge', synced: false, reason: 'dry-run' });
      }
    });
  });

  describe('strategy overrides', () => {
    it('forces a merge even when a fast-forward is possible', async () => {
      const github = createFakeGitHubService();
      github.compareBranches.mockResolvedValue(
        compare({ status: 'ahead', aheadBy: 1, behindBy: 0 }),
      );
      github.mergeBranches.mockResolvedValue({ status: 'merged', sha: 'm' });

      const result = await syncBranches(request('merge'), { github, logger: NoopLogger });

      expect(github.getBranchHeadSha).not.toHaveBeenCalled();
      expect(github.mergeBranches).toHaveBeenCalled();
      if (result.ok) {
        expect(result.value.action).toBe('merge');
      }
    });

    it('refuses to fast-forward diverged branches under fast-forward strategy', async () => {
      const github = createFakeGitHubService();
      github.compareBranches.mockResolvedValue(compare({ aheadBy: 2, behindBy: 2 }));

      const result = await syncBranches(request('fast-forward'), { github, logger: NoopLogger });

      expect(github.mergeBranches).not.toHaveBeenCalled();
      if (result.ok) {
        expect(result.value).toMatchObject({ action: 'none', reason: 'not-fast-forwardable' });
      }
    });
  });

  it('returns an error result when the service throws', async () => {
    const github = createFakeGitHubService();
    github.compareBranches.mockRejectedValue(new Error('network down'));

    const result = await syncBranches(request(), { github, logger: NoopLogger });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('network down');
    }
  });
});

describe('runSyncBranchesAction', () => {
  it('maps validated inputs + context onto the use case', async () => {
    const github = createFakeGitHubService();
    github.compareBranches.mockResolvedValue(
      compare({ status: 'behind', aheadBy: 0, behindBy: 2 }),
    );

    const input: ValidatedSyncInputs = {
      sourceBranch: 'develop',
      targetBranch: 'main',
      strategy: 'auto',
      dryRun: false,
      githubToken: 'tok',
    };

    const result = await runSyncBranchesAction(input, { github, logger: NoopLogger, repo: REPO });

    expect(github.compareBranches).toHaveBeenCalledWith(REPO, 'main', 'develop');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.action).toBe('none');
    }
  });
});
