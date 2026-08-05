import {
  GitHubBranchesClient,
  GitHubClient,
  GitHubPullRequestsClient,
} from '../../../clients/github';
import { ValidationError } from '../../../utils/errors';
import { asOctokit, createFakeOctokit } from '../../support/fake-octokit';

const REPO = { owner: 'gforce', repo: 'demo' } as const;

const PR_SUMMARY = {
  number: 7,
  htmlUrl: 'https://github.com/gforce/demo/pull/7',
  title: 'Sync develop into main',
  state: 'open',
  draft: false,
  headRef: 'develop',
  baseRef: 'main',
};

interface FacadeFixture {
  readonly facade: GitHubClient;
  readonly branches: GitHubBranchesClient;
  readonly pullRequests: GitHubPullRequestsClient;
}

function createFacade(): FacadeFixture {
  const octokit = asOctokit(createFakeOctokit());
  const branches = new GitHubBranchesClient(octokit);
  const pullRequests = new GitHubPullRequestsClient(octokit);
  return { facade: new GitHubClient(branches, pullRequests), branches, pullRequests };
}

afterEach(() => {
  GitHubClient.resetInstance();
});

describe('GitHubClient lifecycle', () => {
  test('getInstance_sameToken_returnsCachedInstance', () => {
    // Given
    const first = GitHubClient.getInstance('test-token');

    // When
    const second = GitHubClient.getInstance('test-token');

    // Then
    expect(second).toBe(first);
  });

  test('getInstance_differentToken_throwsValidationError', () => {
    // Given
    GitHubClient.getInstance('first-token');

    // When
    const act = (): unknown => GitHubClient.getInstance('second-token');

    // Then
    expect(act).toThrow(ValidationError);
    expect(act).toThrow('A shared GitHub client already exists for a different token.');
  });

  test('newInstance_afterGetInstance_returnsIsolatedInstance', () => {
    // Given
    const shared = GitHubClient.getInstance('test-token');

    // When
    const isolated = GitHubClient.newInstance('test-token');

    // Then
    expect(isolated).not.toBe(shared);
  });

  test('resetInstance_afterUse_cascadesToSubClientsAndSharedOctokit', () => {
    // Given
    GitHubClient.getInstance('first-token');

    // When
    GitHubClient.resetInstance();

    // Then
    expect(GitHubClient.getInstance('second-token')).toBeInstanceOf(GitHubClient);
    expect(GitHubBranchesClient.getInstance('second-token')).toBeInstanceOf(GitHubBranchesClient);
    expect(GitHubPullRequestsClient.getInstance('second-token')).toBeInstanceOf(
      GitHubPullRequestsClient,
    );
  });
});

describe('branch delegation', () => {
  test('compareBranches_delegates_returnsSubClientResult', async () => {
    // Given
    const { facade, branches } = createFacade();
    const comparison = {
      status: 'ahead',
      aheadBy: 1,
      behindBy: 0,
      totalCommits: 1,
      commits: [],
      files: [],
    } as const;
    const spy = jest.spyOn(branches, 'compareBranches').mockResolvedValue(comparison);

    // When
    const result = await facade.compareBranches(REPO, 'main', 'develop');

    // Then
    expect(spy).toHaveBeenCalledWith(REPO, 'main', 'develop');
    expect(result).toBe(comparison);
  });

  test('getBranchHeadSha_delegates_returnsSubClientResult', async () => {
    // Given
    const { facade, branches } = createFacade();
    const spy = jest.spyOn(branches, 'getBranchHeadSha').mockResolvedValue('head-sha');

    // When
    const result = await facade.getBranchHeadSha(REPO, 'develop');

    // Then
    expect(spy).toHaveBeenCalledWith(REPO, 'develop');
    expect(result).toBe('head-sha');
  });

  test('updateBranchRef_delegates_passesForceFlag', async () => {
    // Given
    const { facade, branches } = createFacade();
    const spy = jest.spyOn(branches, 'updateBranchRef').mockResolvedValue(undefined);

    // When
    await facade.updateBranchRef(REPO, 'main', 'new-sha', true);

    // Then
    expect(spy).toHaveBeenCalledWith(REPO, 'main', 'new-sha', true);
  });

  test('mergeBranches_delegates_returnsOutcome', async () => {
    // Given
    const { facade, branches } = createFacade();
    const spy = jest
      .spyOn(branches, 'mergeBranches')
      .mockResolvedValue({ status: 'merged', sha: 'merge-sha' });

    // When
    const result = await facade.mergeBranches(REPO, 'main', 'develop', 'sync commit');

    // Then
    expect(spy).toHaveBeenCalledWith(REPO, 'main', 'develop', 'sync commit');
    expect(result).toEqual({ status: 'merged', sha: 'merge-sha' });
  });
});

describe('pull request delegation', () => {
  test('listOpenPullRequests_delegates_returnsSubClientResult', async () => {
    // Given
    const { facade, pullRequests } = createFacade();
    const spy = jest.spyOn(pullRequests, 'listOpenPullRequests').mockResolvedValue([PR_SUMMARY]);

    // When
    const result = await facade.listOpenPullRequests(REPO, { head: 'develop', base: 'main' });

    // Then
    expect(spy).toHaveBeenCalledWith(REPO, { head: 'develop', base: 'main' });
    expect(result).toEqual([PR_SUMMARY]);
  });

  test('createPullRequest_delegates_returnsSummary', async () => {
    // Given
    const { facade, pullRequests } = createFacade();
    const spy = jest.spyOn(pullRequests, 'createPullRequest').mockResolvedValue(PR_SUMMARY);
    const params = {
      head: 'develop',
      base: 'main',
      title: 'Sync develop into main',
      body: 'Automated sync PR',
    };

    // When
    const result = await facade.createPullRequest(REPO, params);

    // Then
    expect(spy).toHaveBeenCalledWith(REPO, params);
    expect(result).toEqual(PR_SUMMARY);
  });

  test('updatePullRequest_delegates_returnsSummary', async () => {
    // Given
    const { facade, pullRequests } = createFacade();
    const spy = jest.spyOn(pullRequests, 'updatePullRequest').mockResolvedValue(PR_SUMMARY);

    // When
    const result = await facade.updatePullRequest(REPO, 7, { body: 'Refreshed body' });

    // Then
    expect(spy).toHaveBeenCalledWith(REPO, 7, { body: 'Refreshed body' });
    expect(result).toEqual(PR_SUMMARY);
  });

  test('addLabels_delegates_passesLabels', async () => {
    // Given
    const { facade, pullRequests } = createFacade();
    const spy = jest.spyOn(pullRequests, 'addLabels').mockResolvedValue(undefined);

    // When
    await facade.addLabels(REPO, 7, ['sync']);

    // Then
    expect(spy).toHaveBeenCalledWith(REPO, 7, ['sync']);
  });

  test('requestReviewers_delegates_passesReviewers', async () => {
    // Given
    const { facade, pullRequests } = createFacade();
    const spy = jest.spyOn(pullRequests, 'requestReviewers').mockResolvedValue(undefined);

    // When
    await facade.requestReviewers(REPO, 7, ['gambe94']);

    // Then
    expect(spy).toHaveBeenCalledWith(REPO, 7, ['gambe94']);
  });
});
