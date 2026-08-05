/**
 * End-to-end: raw kebab-case inputs -> Validator -> GithubContextService ->
 * ReleasePrService -> GitHubClient (mocked at the client boundary). Also
 * asserts the committed bundle the runner executes exists.
 */
import * as fs from 'fs';
import * as path from 'path';

import { Orchestrator } from '../../actions/create-release-pr/orchestrator';
import { GitHubClient } from '../../clients/github';
import { LoggerService } from '../../services/logger-service';

const ORIGINAL_ENV = process.env.GITHUB_REPOSITORY;

beforeEach(() => {
  process.env.GITHUB_REPOSITORY = 'gforce/demo';
  jest.spyOn(LoggerService.getInstance(), 'info').mockImplementation(() => {});
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

describe('create-release-pr end-to-end', () => {
  test('execute_dryRunDefault_reportsComputedPrWithoutMutating', async () => {
    // Given
    const client = GitHubClient.getInstance('test-token');
    jest.spyOn(client, 'compareBranches').mockResolvedValue({
      status: 'ahead',
      aheadBy: 1,
      behindBy: 0,
      totalCommits: 1,
      commits: [{ sha: 'abcdef1234567', message: 'Add: feature X', author: 'octocat' }],
      files: [{ filename: 'src/a.ts', status: 'modified', additions: 1, deletions: 0 }],
    });
    jest.spyOn(client, 'listOpenPullRequests').mockResolvedValue([]);
    const createSpy = jest.spyOn(client, 'createPullRequest');

    // When
    const result = await Orchestrator.getInstance().execute({
      'source-branch': 'develop',
      'target-branch': 'main',
      'release-version': 'v1.2.0',
      title: '',
      'body-template': '',
      draft: '',
      labels: '',
      reviewers: '',
      'dry-run': '',
      'github-token': 'test-token',
    });

    // Then
    expect(createSpy).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(result.created).toBe(false);
    expect(result.title).toBe('Release v1.2.0');
    expect(result.body).toContain('- abcdef1 Add: feature X');
  });

  test('execute_liveRunWithoutExistingPr_createsReleasePr', async () => {
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
    jest.spyOn(client, 'listOpenPullRequests').mockResolvedValue([]);
    const createSpy = jest.spyOn(client, 'createPullRequest').mockResolvedValue({
      number: 7,
      htmlUrl: 'https://github.com/gforce/demo/pull/7',
      title: 'Release v1.2.0',
      state: 'open',
      draft: false,
      headRef: 'develop',
      baseRef: 'main',
    });

    // When
    const result = await Orchestrator.getInstance().execute({
      'source-branch': 'develop',
      'target-branch': 'main',
      'release-version': 'v1.2.0',
      title: '',
      'body-template': '',
      draft: '',
      labels: '',
      reviewers: '',
      'dry-run': 'false',
      'github-token': 'test-token',
    });

    // Then
    expect(createSpy).toHaveBeenCalledWith(
      { owner: 'gforce', repo: 'demo' },
      {
        head: 'develop',
        base: 'main',
        title: 'Release v1.2.0',
        body: expect.stringContaining('## Release v1.2.0'),
        draft: false,
      },
    );
    expect(result.created).toBe(true);
    expect(result.pullRequestNumber).toBe(7);
  });

  test('bundle_committedDistIndexJs_exists', () => {
    // Given
    const bundlePath = path.resolve(
      __dirname,
      '../../../.github/actions/create-release-pr/dist/index.js',
    );

    // When
    const exists = fs.existsSync(bundlePath);

    // Then
    expect(exists).toBe(true);
  });
});
