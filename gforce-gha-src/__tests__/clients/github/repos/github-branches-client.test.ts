import { GitHubBranchesClient } from '../../../../clients/github/repos/github-branches-client';
import { resetSharedOctokit } from '../../../../clients/github/core/github-client-core';
import { GitHubApiError, ValidationError } from '../../../../utils/errors';
import { asOctokit, createFakeOctokit } from '../../../support/fake-octokit';

const REPO = { owner: 'gforce', repo: 'demo' } as const;

afterEach(() => {
  GitHubBranchesClient.resetInstance();
  resetSharedOctokit();
});

describe('GitHubBranchesClient lifecycle', () => {
  test('getInstance_sameToken_returnsCachedInstance', () => {
    // Given
    const first = GitHubBranchesClient.getInstance('test-token');

    // When
    const second = GitHubBranchesClient.getInstance('test-token');

    // Then
    expect(second).toBe(first);
  });

  test('getInstance_differentToken_throwsValidationError', () => {
    // Given
    GitHubBranchesClient.getInstance('first-token');

    // When
    const act = (): unknown => GitHubBranchesClient.getInstance('second-token');

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('A shared branches client already exists for a different token.');
  });

  test('newInstance_afterGetInstance_returnsIsolatedInstance', () => {
    // Given
    const shared = GitHubBranchesClient.getInstance('test-token');

    // When
    const isolated = GitHubBranchesClient.newInstance('test-token');

    // Then
    expect(isolated).not.toBe(shared);
  });
});

describe('compareBranches', () => {
  test('compareBranches_divergedBranches_mapsComparison', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.repos.compareCommitsWithBasehead.mockResolvedValue({
      data: {
        status: 'diverged',
        ahead_by: 2,
        behind_by: 1,
        total_commits: 3,
        commits: [
          {
            sha: 'sha-1',
            commit: { message: 'first commit', author: { name: 'Fallback Author' } },
            author: { login: 'octocat' },
          },
          {
            sha: 'sha-2',
            commit: { message: 'second commit', author: { name: 'Fallback Author' } },
            author: null,
          },
        ],
        files: [{ filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 1 }],
      },
    });
    const client = new GitHubBranchesClient(asOctokit(fake));

    // When
    const result = await client.compareBranches(REPO, 'main', 'develop');

    // Then
    expect(fake.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith({
      owner: 'gforce',
      repo: 'demo',
      basehead: 'main...develop',
    });
    expect(result).toEqual({
      status: 'diverged',
      aheadBy: 2,
      behindBy: 1,
      totalCommits: 3,
      commits: [
        { sha: 'sha-1', message: 'first commit', author: 'octocat' },
        { sha: 'sha-2', message: 'second commit', author: 'Fallback Author' },
      ],
      files: [{ filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 1 }],
    });
  });

  test('compareBranches_responseWithoutFiles_returnsEmptyFileList', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.repos.compareCommitsWithBasehead.mockResolvedValue({
      data: {
        status: 'identical',
        ahead_by: 0,
        behind_by: 0,
        total_commits: 0,
        commits: [],
      },
    });
    const client = new GitHubBranchesClient(asOctokit(fake));

    // When
    const result = await client.compareBranches(REPO, 'main', 'develop');

    // Then
    expect(result.files).toEqual([]);
    expect(result.commits).toEqual([]);
  });

  test('compareBranches_apiFailure_throwsGitHubApiError', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.repos.compareCommitsWithBasehead.mockRejectedValue(
      Object.assign(new Error('boom'), { status: 500 }),
    );
    const client = new GitHubBranchesClient(asOctokit(fake));

    // When
    const act = client.compareBranches(REPO, 'main', 'develop');

    // Then
    await expect(act).rejects.toBeInstanceOf(GitHubApiError);
    await expect(act).rejects.toThrow('Failed to compare branches: boom');
  });
});

describe('getBranchHeadSha', () => {
  test('getBranchHeadSha_existingBranch_returnsSha', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.repos.getBranch.mockResolvedValue({ data: { commit: { sha: 'head-sha' } } });
    const client = new GitHubBranchesClient(asOctokit(fake));

    // When
    const sha = await client.getBranchHeadSha(REPO, 'develop');

    // Then
    expect(fake.rest.repos.getBranch).toHaveBeenCalledWith({
      owner: 'gforce',
      repo: 'demo',
      branch: 'develop',
    });
    expect(sha).toBe('head-sha');
  });
});

describe('updateBranchRef', () => {
  test('updateBranchRef_defaultForce_sendsForceFalse', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.git.updateRef.mockResolvedValue({});
    const client = new GitHubBranchesClient(asOctokit(fake));

    // When
    await client.updateBranchRef(REPO, 'main', 'new-sha');

    // Then
    expect(fake.rest.git.updateRef).toHaveBeenCalledWith({
      owner: 'gforce',
      repo: 'demo',
      ref: 'heads/main',
      sha: 'new-sha',
      force: false,
    });
  });

  test('updateBranchRef_forceRequested_sendsForceTrue', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.git.updateRef.mockResolvedValue({});
    const client = new GitHubBranchesClient(asOctokit(fake));

    // When
    await client.updateBranchRef(REPO, 'main', 'new-sha', true);

    // Then
    expect(fake.rest.git.updateRef).toHaveBeenCalledWith({
      owner: 'gforce',
      repo: 'demo',
      ref: 'heads/main',
      sha: 'new-sha',
      force: true,
    });
  });
});

describe('mergeBranches', () => {
  test('mergeBranches_created201_returnsMergedSha', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.repos.merge.mockResolvedValue({ status: 201, data: { sha: 'merge-sha' } });
    const client = new GitHubBranchesClient(asOctokit(fake));

    // When
    const outcome = await client.mergeBranches(REPO, 'main', 'develop', 'sync commit');

    // Then
    expect(fake.rest.repos.merge).toHaveBeenCalledWith({
      owner: 'gforce',
      repo: 'demo',
      base: 'main',
      head: 'develop',
      commit_message: 'sync commit',
    });
    expect(outcome).toEqual({ status: 'merged', sha: 'merge-sha' });
  });

  test('mergeBranches_noContent204_returnsNothing', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.repos.merge.mockResolvedValue({ status: 204, data: undefined });
    const client = new GitHubBranchesClient(asOctokit(fake));

    // When
    const outcome = await client.mergeBranches(REPO, 'main', 'develop');

    // Then
    expect(outcome).toEqual({ status: 'nothing' });
  });

  test('mergeBranches_conflict409_returnsConflict', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.repos.merge.mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));
    const client = new GitHubBranchesClient(asOctokit(fake));

    // When
    const outcome = await client.mergeBranches(REPO, 'main', 'develop');

    // Then
    expect(outcome).toEqual({ status: 'conflict' });
  });

  test('mergeBranches_serverError_throwsGitHubApiError', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.repos.merge.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    const client = new GitHubBranchesClient(asOctokit(fake));

    // When
    const act = client.mergeBranches(REPO, 'main', 'develop');

    // Then
    await expect(act).rejects.toBeInstanceOf(GitHubApiError);
    await expect(act).rejects.toThrow('Failed to merge branches: boom');
  });
});
