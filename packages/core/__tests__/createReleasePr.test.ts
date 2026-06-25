import {
  createReleasePr,
  renderReleaseBody,
  runCreateReleasePrAction,
} from '../src/actions/createReleasePr/createReleasePr';
import type {
  CreateReleasePrRequest,
  ValidatedReleasePrInputs,
} from '../src/actions/createReleasePr/types';
import type { CompareResult } from '../src/github-service/branch/types';
import { NoopLogger } from '../src/utils/logging/logger';
import { createFakeGitHubService, pullRequest, REPO } from './support/fakes';

function compare(overrides: Partial<CompareResult> = {}): CompareResult {
  return {
    status: 'ahead',
    aheadBy: 2,
    behindBy: 0,
    totalCommits: 2,
    commits: [
      { sha: 'abcdef1234', message: 'feat: one\nbody' },
      { sha: '1234567890', message: 'fix: two' },
    ],
    files: [{ filename: 'src/a.ts', status: 'modified', additions: 1, deletions: 0 }],
    ...overrides,
  };
}

function request(overrides: Partial<CreateReleasePrRequest> = {}): CreateReleasePrRequest {
  return {
    repo: REPO,
    sourceBranch: 'develop',
    targetBranch: 'main',
    releaseVersion: 'v1.2.3',
    draft: false,
    labels: [],
    reviewers: [],
    dryRun: false,
    ...overrides,
  };
}

describe('renderReleaseBody', () => {
  it('substitutes tokens with commit and file summaries', () => {
    const body = renderReleaseBody(request(), compare());
    expect(body).toContain('## Release v1.2.3');
    expect(body).toContain('Merging `develop` into `main`.');
    expect(body).toContain('- abcdef1 feat: one');
    expect(body).toContain('- `modified` src/a.ts');
  });

  it('renders placeholders when there are no commits or files', () => {
    const body = renderReleaseBody(request(), compare({ commits: [], files: [] }));
    expect(body).toContain('_No commits._');
    expect(body).toContain('_No file changes._');
  });

  it('honors a custom template', () => {
    const body = renderReleaseBody(
      request({ bodyTemplate: 'Release {{version}} from {{source}}' }),
      compare(),
    );
    expect(body).toBe('Release v1.2.3 from develop');
  });
});

describe('createReleasePr', () => {
  it('creates a PR when none exists', async () => {
    const github = createFakeGitHubService();
    github.compareBranches.mockResolvedValue(compare());
    github.listOpenPullRequests.mockResolvedValue([]);
    github.createPullRequest.mockResolvedValue(pullRequest({ number: 10 }));

    const result = await createReleasePr(request(), { github, logger: NoopLogger });

    expect(github.createPullRequest).toHaveBeenCalledWith(
      REPO,
      expect.objectContaining({ head: 'develop', base: 'main', draft: false }),
    );
    expect(github.addLabels).not.toHaveBeenCalled();
    expect(github.requestReviewers).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.value).toMatchObject({ created: true, updated: false, pullRequestNumber: 10 });
      expect(result.value.title).toBe('Release v1.2.3');
    }
  });

  it('applies labels and reviewers when configured', async () => {
    const github = createFakeGitHubService();
    github.compareBranches.mockResolvedValue(compare());
    github.listOpenPullRequests.mockResolvedValue([]);
    github.createPullRequest.mockResolvedValue(pullRequest({ number: 11 }));

    await createReleasePr(request({ labels: ['release'], reviewers: ['octocat'] }), {
      github,
      logger: NoopLogger,
    });

    expect(github.addLabels).toHaveBeenCalledWith(REPO, 11, ['release']);
    expect(github.requestReviewers).toHaveBeenCalledWith(REPO, 11, ['octocat']);
  });

  it('updates an existing release PR', async () => {
    const github = createFakeGitHubService();
    github.compareBranches.mockResolvedValue(compare());
    github.listOpenPullRequests.mockResolvedValue([pullRequest({ number: 7 })]);
    github.updatePullRequest.mockResolvedValue(pullRequest({ number: 7, title: 'Release v1.2.3' }));

    const result = await createReleasePr(request({ title: 'Custom title' }), {
      github,
      logger: NoopLogger,
    });

    expect(github.updatePullRequest).toHaveBeenCalledWith(
      REPO,
      7,
      expect.objectContaining({ title: 'Custom title' }),
    );
    expect(github.createPullRequest).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.value).toMatchObject({ created: false, updated: true, pullRequestNumber: 7 });
    }
  });

  describe('dry run', () => {
    it('reports a planned creation without mutating', async () => {
      const github = createFakeGitHubService();
      github.compareBranches.mockResolvedValue(compare());
      github.listOpenPullRequests.mockResolvedValue([]);

      const result = await createReleasePr(request({ dryRun: true }), {
        github,
        logger: NoopLogger,
      });

      expect(github.createPullRequest).not.toHaveBeenCalled();
      if (result.ok) {
        expect(result.value).toMatchObject({ created: false, updated: false, dryRun: true });
        expect(result.value.pullRequestNumber).toBeUndefined();
      }
    });

    it('reports the existing PR in dry-run', async () => {
      const github = createFakeGitHubService();
      github.compareBranches.mockResolvedValue(compare());
      github.listOpenPullRequests.mockResolvedValue([pullRequest({ number: 5 })]);

      const result = await createReleasePr(request({ dryRun: true }), {
        github,
        logger: NoopLogger,
      });

      if (result.ok) {
        expect(result.value.pullRequestNumber).toBe(5);
      }
    });
  });

  it('returns an error result when the service throws', async () => {
    const github = createFakeGitHubService();
    github.compareBranches.mockRejectedValue(new Error('rate limited'));

    const result = await createReleasePr(request(), { github, logger: NoopLogger });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('rate limited');
    }
  });
});

describe('runCreateReleasePrAction', () => {
  it('maps validated inputs + context onto the use case', async () => {
    const github = createFakeGitHubService();
    github.compareBranches.mockResolvedValue(compare());
    github.listOpenPullRequests.mockResolvedValue([]);
    github.createPullRequest.mockResolvedValue(pullRequest({ number: 12 }));

    const input: ValidatedReleasePrInputs = {
      sourceBranch: 'develop',
      targetBranch: 'main',
      releaseVersion: 'v1.2.3',
      draft: false,
      labels: ['release'],
      reviewers: ['octocat'],
      dryRun: false,
      githubToken: 'tok',
    };

    const result = await runCreateReleasePrAction(input, {
      github,
      logger: NoopLogger,
      repo: REPO,
    });

    expect(github.compareBranches).toHaveBeenCalledWith(REPO, 'main', 'develop');
    expect(github.addLabels).toHaveBeenCalledWith(REPO, 12, ['release']);
    expect(github.requestReviewers).toHaveBeenCalledWith(REPO, 12, ['octocat']);
    if (result.ok) {
      expect(result.value).toMatchObject({ created: true, pullRequestNumber: 12 });
    }
  });
});
