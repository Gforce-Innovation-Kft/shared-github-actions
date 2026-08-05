import { resetSharedOctokit } from '../../../../clients/github/core/github-client-core';
import { GitHubPullRequestsClient } from '../../../../clients/github/pull-requests/github-pull-requests-client';
import { GitHubApiError, ValidationError } from '../../../../utils/errors';
import { asOctokit, createFakeOctokit } from '../../../support/fake-octokit';

const REPO = { owner: 'gforce', repo: 'demo' } as const;

const OCTOKIT_PR = {
  number: 7,
  html_url: 'https://github.com/gforce/demo/pull/7',
  title: 'Sync develop into main',
  state: 'open',
  draft: false,
  head: { ref: 'develop' },
  base: { ref: 'main' },
};

const EXPECTED_SUMMARY = {
  number: 7,
  htmlUrl: 'https://github.com/gforce/demo/pull/7',
  title: 'Sync develop into main',
  state: 'open',
  draft: false,
  headRef: 'develop',
  baseRef: 'main',
};

afterEach(() => {
  GitHubPullRequestsClient.resetInstance();
  resetSharedOctokit();
});

describe('GitHubPullRequestsClient lifecycle', () => {
  test('getInstance_sameToken_returnsCachedInstance', () => {
    // Given
    const first = GitHubPullRequestsClient.getInstance('test-token');

    // When
    const second = GitHubPullRequestsClient.getInstance('test-token');

    // Then
    expect(second).toBe(first);
  });

  test('getInstance_differentToken_throwsValidationError', () => {
    // Given
    GitHubPullRequestsClient.getInstance('first-token');

    // When
    const act = (): unknown => GitHubPullRequestsClient.getInstance('second-token');

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('A shared pull requests client already exists for a different token.');
  });

  test('newInstance_afterGetInstance_returnsIsolatedInstance', () => {
    // Given
    const shared = GitHubPullRequestsClient.getInstance('test-token');

    // When
    const isolated = GitHubPullRequestsClient.newInstance('test-token');

    // Then
    expect(isolated).not.toBe(shared);
  });
});

describe('listOpenPullRequests', () => {
  test('listOpenPullRequests_headAndBase_prefixesOwnerOnHead', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.pulls.list.mockResolvedValue({ data: [OCTOKIT_PR] });
    const client = new GitHubPullRequestsClient(asOctokit(fake));

    // When
    const result = await client.listOpenPullRequests(REPO, { head: 'develop', base: 'main' });

    // Then
    expect(fake.rest.pulls.list).toHaveBeenCalledWith({
      owner: 'gforce',
      repo: 'demo',
      state: 'open',
      head: 'gforce:develop',
      base: 'main',
    });
    expect(result).toEqual([EXPECTED_SUMMARY]);
  });

  test('listOpenPullRequests_prWithoutDraftFlag_defaultsDraftFalse', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.pulls.list.mockResolvedValue({ data: [{ ...OCTOKIT_PR, draft: undefined }] });
    const client = new GitHubPullRequestsClient(asOctokit(fake));

    // When
    const result = await client.listOpenPullRequests(REPO, { head: 'develop', base: 'main' });

    // Then
    expect(result).toEqual([EXPECTED_SUMMARY]);
  });

  test('listOpenPullRequests_apiFailure_throwsGitHubApiError', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.pulls.list.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    const client = new GitHubPullRequestsClient(asOctokit(fake));

    // When
    const act = client.listOpenPullRequests(REPO, { head: 'develop', base: 'main' });

    // Then
    await expect(act).rejects.toBeInstanceOf(GitHubApiError);
    await expect(act).rejects.toThrow('Failed to list pull requests: boom');
  });
});

describe('createPullRequest', () => {
  test('createPullRequest_noDraftFlag_sendsDraftFalse', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.pulls.create.mockResolvedValue({ data: OCTOKIT_PR });
    const client = new GitHubPullRequestsClient(asOctokit(fake));

    // When
    const result = await client.createPullRequest(REPO, {
      head: 'develop',
      base: 'main',
      title: 'Sync develop into main',
      body: 'Automated sync PR',
    });

    // Then
    expect(fake.rest.pulls.create).toHaveBeenCalledWith({
      owner: 'gforce',
      repo: 'demo',
      head: 'develop',
      base: 'main',
      title: 'Sync develop into main',
      body: 'Automated sync PR',
      draft: false,
    });
    expect(result).toEqual(EXPECTED_SUMMARY);
  });

  test('createPullRequest_draftRequested_sendsDraftTrue', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.pulls.create.mockResolvedValue({ data: { ...OCTOKIT_PR, draft: true } });
    const client = new GitHubPullRequestsClient(asOctokit(fake));

    // When
    const result = await client.createPullRequest(REPO, {
      head: 'develop',
      base: 'main',
      title: 'Sync develop into main',
      body: 'Automated sync PR',
      draft: true,
    });

    // Then
    expect(fake.rest.pulls.create).toHaveBeenCalledWith({
      owner: 'gforce',
      repo: 'demo',
      head: 'develop',
      base: 'main',
      title: 'Sync develop into main',
      body: 'Automated sync PR',
      draft: true,
    });
    expect(result).toEqual({ ...EXPECTED_SUMMARY, draft: true });
  });
});

describe('updatePullRequest', () => {
  test('updatePullRequest_titleAndBody_sendsUpdate', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.pulls.update.mockResolvedValue({ data: OCTOKIT_PR });
    const client = new GitHubPullRequestsClient(asOctokit(fake));

    // When
    const result = await client.updatePullRequest(REPO, 7, {
      title: 'Sync develop into main',
      body: 'Refreshed body',
    });

    // Then
    expect(fake.rest.pulls.update).toHaveBeenCalledWith({
      owner: 'gforce',
      repo: 'demo',
      pull_number: 7,
      title: 'Sync develop into main',
      body: 'Refreshed body',
    });
    expect(result).toEqual(EXPECTED_SUMMARY);
  });
});

describe('addLabels', () => {
  test('addLabels_labels_addsToIssueNumber', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.issues.addLabels.mockResolvedValue({});
    const client = new GitHubPullRequestsClient(asOctokit(fake));

    // When
    await client.addLabels(REPO, 7, ['sync', 'automated']);

    // Then
    expect(fake.rest.issues.addLabels).toHaveBeenCalledWith({
      owner: 'gforce',
      repo: 'demo',
      issue_number: 7,
      labels: ['sync', 'automated'],
    });
  });
});

describe('requestReviewers', () => {
  test('requestReviewers_reviewers_requestsOnPullNumber', async () => {
    // Given
    const fake = createFakeOctokit();
    fake.rest.pulls.requestReviewers.mockResolvedValue({});
    const client = new GitHubPullRequestsClient(asOctokit(fake));

    // When
    await client.requestReviewers(REPO, 7, ['gambe94']);

    // Then
    expect(fake.rest.pulls.requestReviewers).toHaveBeenCalledWith({
      owner: 'gforce',
      repo: 'demo',
      pull_number: 7,
      reviewers: ['gambe94'],
    });
  });
});
