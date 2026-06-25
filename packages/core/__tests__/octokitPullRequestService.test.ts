import type { Octokit } from '@octokit/rest';
import { ValidationError } from '../src/utils/errors/errors';
import { GitHubClient } from '../src/github-service/client/gitHubClient';
import { OctokitPullRequestService } from '../src/github-service/pull-request/octokitPullRequestService';
import { REPO } from './support/fakes';

function createFakeOctokit() {
  return {
    rest: {
      pulls: {
        list: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        requestReviewers: jest.fn(),
      },
      issues: { addLabels: jest.fn() },
    },
  };
}

type FakeOctokit = ReturnType<typeof createFakeOctokit>;

function service(fake: FakeOctokit): OctokitPullRequestService {
  return new OctokitPullRequestService(fake as unknown as Octokit);
}

describe('OctokitPullRequestService', () => {
  it('lists open pull requests scoped to head/base', async () => {
    const fake = createFakeOctokit();
    fake.rest.pulls.list.mockResolvedValue({
      data: [
        {
          number: 12,
          html_url: 'https://example.test/pull/12',
          title: 'Release',
          state: 'open',
          draft: false,
          head: { ref: 'develop' },
          base: { ref: 'main' },
        },
      ],
    });

    const result = await service(fake).listOpenPullRequests(REPO, {
      head: 'develop',
      base: 'main',
    });

    expect(fake.rest.pulls.list).toHaveBeenCalledWith({
      owner: REPO.owner,
      repo: REPO.repo,
      state: 'open',
      head: 'gforceinnovation:develop',
      base: 'main',
    });
    expect(result[0]).toEqual({
      number: 12,
      htmlUrl: 'https://example.test/pull/12',
      title: 'Release',
      state: 'open',
      draft: false,
      headRef: 'develop',
      baseRef: 'main',
    });
  });

  it('creates a pull request and defaults draft to false', async () => {
    const fake = createFakeOctokit();
    fake.rest.pulls.create.mockResolvedValue({
      data: {
        number: 20,
        html_url: 'u',
        title: 't',
        state: 'open',
        draft: false,
        head: { ref: 'develop' },
        base: { ref: 'main' },
      },
    });

    const result = await service(fake).createPullRequest(REPO, {
      head: 'develop',
      base: 'main',
      title: 't',
      body: 'b',
    });

    expect(fake.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({ draft: false, title: 't', body: 'b' }),
    );
    expect(result.number).toBe(20);
  });

  it('updates a pull request', async () => {
    const fake = createFakeOctokit();
    fake.rest.pulls.update.mockResolvedValue({
      data: {
        number: 7,
        html_url: 'u',
        title: 'new',
        state: 'open',
        draft: false,
        head: { ref: 'develop' },
        base: { ref: 'main' },
      },
    });

    const result = await service(fake).updatePullRequest(REPO, 7, { title: 'new' });

    expect(fake.rest.pulls.update).toHaveBeenCalledWith(
      expect.objectContaining({ pull_number: 7, title: 'new' }),
    );
    expect(result.title).toBe('new');
  });

  it('adds labels', async () => {
    const fake = createFakeOctokit();
    fake.rest.issues.addLabels.mockResolvedValue({ data: [] });

    await service(fake).addLabels(REPO, 7, ['release']);

    expect(fake.rest.issues.addLabels).toHaveBeenCalledWith({
      owner: REPO.owner,
      repo: REPO.repo,
      issue_number: 7,
      labels: ['release'],
    });
  });

  it('requests reviewers', async () => {
    const fake = createFakeOctokit();
    fake.rest.pulls.requestReviewers.mockResolvedValue({ data: {} });

    await service(fake).requestReviewers(REPO, 7, ['octocat']);

    expect(fake.rest.pulls.requestReviewers).toHaveBeenCalledWith({
      owner: REPO.owner,
      repo: REPO.repo,
      pull_number: 7,
      reviewers: ['octocat'],
    });
  });

  it('wraps API failures in GitHubApiError', async () => {
    const fake = createFakeOctokit();
    fake.rest.pulls.list.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));

    await expect(
      service(fake).listOpenPullRequests(REPO, { head: 'develop', base: 'main' }),
    ).rejects.toMatchObject({ name: 'GitHubApiError', status: 500 });
  });

  describe('singleton lifecycle', () => {
    afterEach(() => {
      OctokitPullRequestService.resetInstance();
      GitHubClient.resetInstance();
    });

    it('shares one instance across calls', () => {
      const first = OctokitPullRequestService.getInstance('token');
      expect(OctokitPullRequestService.getInstance('token')).toBe(first);
    });

    it('throws when a different token is requested', () => {
      OctokitPullRequestService.getInstance('token-a');
      expect(() => OctokitPullRequestService.getInstance('token-b')).toThrow(ValidationError);
    });

    it('newInstance builds a fresh, isolated instance', () => {
      const shared = OctokitPullRequestService.getInstance('token');
      const fresh = OctokitPullRequestService.newInstance('token');
      expect(fresh).not.toBe(shared);
      expect(fresh).toBeInstanceOf(OctokitPullRequestService);
    });

    it('rebuilds after reset', () => {
      const first = OctokitPullRequestService.getInstance('token');
      OctokitPullRequestService.resetInstance();
      expect(OctokitPullRequestService.getInstance('token')).not.toBe(first);
    });
  });
});
