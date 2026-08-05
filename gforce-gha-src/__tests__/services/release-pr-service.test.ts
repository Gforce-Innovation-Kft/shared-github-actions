import { GitHubClient } from '../../clients/github';
import type { BranchComparison } from '../../clients/github';
import { LoggerService } from '../../services/logger-service';
import { ReleasePrService } from '../../services/release-pr-service';
import type { CreateReleasePrRequest } from '../../types';
import { GitHubApiError } from '../../utils/errors';

const REPO = { owner: 'gforce', repo: 'demo' } as const;

const REQUEST: CreateReleasePrRequest = {
  repo: REPO,
  sourceBranch: 'develop',
  targetBranch: 'main',
  releaseVersion: 'v1.2.0',
  title: undefined,
  bodyTemplate: undefined,
  draft: false,
  labels: [],
  reviewers: [],
  dryRun: false,
  githubToken: 'test-token',
};

const PR_SUMMARY = {
  number: 7,
  htmlUrl: 'https://github.com/gforce/demo/pull/7',
  title: 'Release v1.2.0',
  state: 'open',
  draft: false,
  headRef: 'develop',
  baseRef: 'main',
};

const COMPARISON: BranchComparison = {
  status: 'ahead',
  aheadBy: 2,
  behindBy: 0,
  totalCommits: 2,
  commits: [
    { sha: 'abcdef1234567', message: 'Add: feature X\n\ndetails', author: 'octocat' },
    { sha: '1234567abcdef', message: 'Fix: bug Y', author: 'gambe94' },
  ],
  files: [
    { filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 1 },
    { filename: 'src/b.ts', status: 'added', additions: 10, deletions: 0 },
  ],
};

function clientSpies(): {
  compare: jest.SpyInstance;
  list: jest.SpyInstance;
  create: jest.SpyInstance;
  update: jest.SpyInstance;
  addLabels: jest.SpyInstance;
  requestReviewers: jest.SpyInstance;
} {
  const client = GitHubClient.getInstance('test-token');
  return {
    compare: jest.spyOn(client, 'compareBranches'),
    list: jest.spyOn(client, 'listOpenPullRequests'),
    create: jest.spyOn(client, 'createPullRequest'),
    update: jest.spyOn(client, 'updatePullRequest'),
    addLabels: jest.spyOn(client, 'addLabels'),
    requestReviewers: jest.spyOn(client, 'requestReviewers'),
  };
}

beforeEach(() => {
  jest.spyOn(LoggerService.getInstance(), 'info').mockImplementation(() => {});
});

afterEach(() => {
  ReleasePrService.resetInstance();
  GitHubClient.resetInstance();
  LoggerService.resetInstance();
  jest.restoreAllMocks();
});

describe('renderBody', () => {
  test('renderBody_defaultTemplateWithCommitsAndFiles_rendersMarkdownSections', () => {
    // Given
    const request = REQUEST;

    // When
    const body = ReleasePrService.getInstance().renderBody(request, COMPARISON);

    // Then
    expect(body).toContain('## Release v1.2.0');
    expect(body).toContain('Merging `develop` into `main`.');
    expect(body).toContain('- abcdef1 Add: feature X');
    expect(body).toContain('- 1234567 Fix: bug Y');
    expect(body).toContain('- `modified` src/a.ts');
    expect(body).toContain('- `added` src/b.ts');
  });

  test('renderBody_emptyComparison_rendersPlaceholders', () => {
    // Given
    const emptyComparison: BranchComparison = { ...COMPARISON, commits: [], files: [] };

    // When
    const body = ReleasePrService.getInstance().renderBody(REQUEST, emptyComparison);

    // Then
    expect(body).toContain('_No commits._');
    expect(body).toContain('_No file changes._');
  });

  test('renderBody_customTemplate_substitutesAllTokens', () => {
    // Given
    const request = { ...REQUEST, bodyTemplate: '{{version}}|{{source}}|{{target}}' };

    // When
    const body = ReleasePrService.getInstance().renderBody(request, COMPARISON);

    // Then
    expect(body).toBe('v1.2.0|develop|main');
  });
});

describe('createOrUpdate', () => {
  test('createOrUpdate_dryRunWithoutExistingPr_reportsWithoutMutating', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(COMPARISON);
    spies.list.mockResolvedValue([]);

    // When
    const result = await ReleasePrService.getInstance().createOrUpdate({
      ...REQUEST,
      dryRun: true,
    });

    // Then
    expect(spies.compare).toHaveBeenCalledWith(REPO, 'main', 'develop');
    expect(spies.list).toHaveBeenCalledWith(REPO, { head: 'develop', base: 'main' });
    expect(spies.create).not.toHaveBeenCalled();
    expect(spies.update).not.toHaveBeenCalled();
    expect(result.created).toBe(false);
    expect(result.updated).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(result.pullRequestNumber).toBeUndefined();
    expect(result.title).toBe('Release v1.2.0');
  });

  test('createOrUpdate_dryRunWithExistingPr_reportsExistingNumber', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(COMPARISON);
    spies.list.mockResolvedValue([PR_SUMMARY]);

    // When
    const result = await ReleasePrService.getInstance().createOrUpdate({
      ...REQUEST,
      dryRun: true,
    });

    // Then
    expect(result.pullRequestNumber).toBe(7);
    expect(result.pullRequestUrl).toBe('https://github.com/gforce/demo/pull/7');
    expect(spies.update).not.toHaveBeenCalled();
  });

  test('createOrUpdate_existingPr_updatesAndAppliesLabelsAndReviewers', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(COMPARISON);
    spies.list.mockResolvedValue([PR_SUMMARY]);
    spies.update.mockResolvedValue(PR_SUMMARY);
    spies.addLabels.mockResolvedValue(undefined);
    spies.requestReviewers.mockResolvedValue(undefined);
    const request = { ...REQUEST, labels: ['release'], reviewers: ['gambe94'] };

    // When
    const result = await ReleasePrService.getInstance().createOrUpdate(request);

    // Then
    expect(spies.update).toHaveBeenCalledWith(REPO, 7, {
      title: 'Release v1.2.0',
      body: expect.stringContaining('## Release v1.2.0'),
    });
    expect(spies.addLabels).toHaveBeenCalledWith(REPO, 7, ['release']);
    expect(spies.requestReviewers).toHaveBeenCalledWith(REPO, 7, ['gambe94']);
    expect(result.created).toBe(false);
    expect(result.updated).toBe(true);
  });

  test('createOrUpdate_noExistingPr_createsPrWithDraftFlag', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockResolvedValue(COMPARISON);
    spies.list.mockResolvedValue([]);
    spies.create.mockResolvedValue({ ...PR_SUMMARY, draft: true });
    const request = { ...REQUEST, draft: true, title: 'Custom title' };

    // When
    const result = await ReleasePrService.getInstance().createOrUpdate(request);

    // Then
    expect(spies.create).toHaveBeenCalledWith(REPO, {
      head: 'develop',
      base: 'main',
      title: 'Custom title',
      body: expect.stringContaining('## Release v1.2.0'),
      draft: true,
    });
    expect(spies.addLabels).not.toHaveBeenCalled();
    expect(spies.requestReviewers).not.toHaveBeenCalled();
    expect(result.created).toBe(true);
    expect(result.updated).toBe(false);
    expect(result.pullRequestNumber).toBe(7);
  });

  test('createOrUpdate_compareFails_propagatesGitHubApiError', async () => {
    // Given
    const spies = clientSpies();
    spies.compare.mockRejectedValue(new GitHubApiError('Failed to compare branches: boom', 500));

    // When
    const act = ReleasePrService.getInstance().createOrUpdate(REQUEST);

    // Then
    await expect(act).rejects.toBeInstanceOf(GitHubApiError);
    await expect(act).rejects.toThrow('Failed to compare branches: boom');
  });
});
