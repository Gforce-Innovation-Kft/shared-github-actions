import type { Octokit } from '@octokit/rest';
import { GitHubApiError, ValidationError } from '../src/utils/errors/errors';
import { OctokitGitHubService } from '../src/github-service/octokitGitHubService';
import { REPO } from './support/fakes';

function createFakeOctokit() {
  return {
    rest: {
      repos: {
        compareCommitsWithBasehead: jest.fn(),
        getBranch: jest.fn(),
        merge: jest.fn(),
      },
      git: {
        updateRef: jest.fn(),
      },
      pulls: {
        list: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        requestReviewers: jest.fn(),
      },
      issues: {
        addLabels: jest.fn(),
      },
    },
  };
}

type FakeOctokit = ReturnType<typeof createFakeOctokit>;

function service(fake: FakeOctokit): OctokitGitHubService {
  return new OctokitGitHubService(fake as unknown as Octokit);
}

describe('OctokitGitHubService', () => {
  describe('compareBranches', () => {
    it('maps the compare response into value objects', async () => {
      const fake = createFakeOctokit();
      fake.rest.repos.compareCommitsWithBasehead.mockResolvedValue({
        data: {
          status: 'diverged',
          ahead_by: 3,
          behind_by: 2,
          total_commits: 3,
          commits: [
            {
              sha: 'abcdef1234567890',
              commit: { message: 'feat: thing\n\nbody', author: { name: 'Ann' } },
              author: { login: 'ann' },
            },
          ],
          files: [{ filename: 'src/a.ts', status: 'modified', additions: 4, deletions: 1 }],
        },
      });

      const result = await service(fake).compareBranches(REPO, 'main', 'develop');

      expect(fake.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith({
        owner: REPO.owner,
        repo: REPO.repo,
        basehead: 'main...develop',
      });
      expect(result.status).toBe('diverged');
      expect(result.aheadBy).toBe(3);
      expect(result.behindBy).toBe(2);
      expect(result.commits[0]).toEqual({
        sha: 'abcdef1234567890',
        message: 'feat: thing\n\nbody',
        author: 'ann',
      });
      expect(result.files[0]).toEqual({
        filename: 'src/a.ts',
        status: 'modified',
        additions: 4,
        deletions: 1,
      });
    });

    it('falls back to the commit author name and tolerates missing files', async () => {
      const fake = createFakeOctokit();
      fake.rest.repos.compareCommitsWithBasehead.mockResolvedValue({
        data: {
          status: 'ahead',
          ahead_by: 1,
          behind_by: 0,
          total_commits: 1,
          commits: [
            {
              sha: 'deadbeef',
              commit: { message: 'chore', author: { name: 'Bob' } },
              author: null,
            },
          ],
          files: undefined,
        },
      });

      const result = await service(fake).compareBranches(REPO, 'main', 'develop');

      expect(result.commits[0]?.author).toBe('Bob');
      expect(result.files).toEqual([]);
    });

    it('wraps API failures in GitHubApiError', async () => {
      const fake = createFakeOctokit();
      fake.rest.repos.compareCommitsWithBasehead.mockRejectedValue(
        Object.assign(new Error('boom'), { status: 500 }),
      );

      await expect(service(fake).compareBranches(REPO, 'main', 'develop')).rejects.toMatchObject({
        name: 'GitHubApiError',
        status: 500,
      });
    });
  });

  it('resolves a branch head sha', async () => {
    const fake = createFakeOctokit();
    fake.rest.repos.getBranch.mockResolvedValue({ data: { commit: { sha: 'sha-1' } } });

    await expect(service(fake).getBranchHeadSha(REPO, 'develop')).resolves.toBe('sha-1');
    expect(fake.rest.repos.getBranch).toHaveBeenCalledWith({
      owner: REPO.owner,
      repo: REPO.repo,
      branch: 'develop',
    });
  });

  it('updates a branch ref without force by default', async () => {
    const fake = createFakeOctokit();
    fake.rest.git.updateRef.mockResolvedValue({ data: {} });

    await service(fake).updateBranchRef(REPO, 'main', 'sha-2');

    expect(fake.rest.git.updateRef).toHaveBeenCalledWith({
      owner: REPO.owner,
      repo: REPO.repo,
      ref: 'heads/main',
      sha: 'sha-2',
      force: false,
    });
  });

  describe('mergeBranches', () => {
    it('returns merged on 201', async () => {
      const fake = createFakeOctokit();
      fake.rest.repos.merge.mockResolvedValue({ status: 201, data: { sha: 'merge-sha' } });

      await expect(service(fake).mergeBranches(REPO, 'main', 'develop')).resolves.toEqual({
        status: 'merged',
        sha: 'merge-sha',
      });
    });

    it('returns nothing on 204', async () => {
      const fake = createFakeOctokit();
      fake.rest.repos.merge.mockResolvedValue({ status: 204, data: {} });

      await expect(service(fake).mergeBranches(REPO, 'main', 'develop')).resolves.toEqual({
        status: 'nothing',
      });
    });

    it('returns conflict on 409', async () => {
      const fake = createFakeOctokit();
      fake.rest.repos.merge.mockRejectedValue(
        Object.assign(new Error('conflict'), { status: 409 }),
      );

      await expect(service(fake).mergeBranches(REPO, 'main', 'develop')).resolves.toEqual({
        status: 'conflict',
      });
    });

    it('wraps other merge failures', async () => {
      const fake = createFakeOctokit();
      fake.rest.repos.merge.mockRejectedValue(Object.assign(new Error('nope'), { status: 403 }));

      await expect(service(fake).mergeBranches(REPO, 'main', 'develop')).rejects.toBeInstanceOf(
        GitHubApiError,
      );
    });
  });

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

  describe('singleton lifecycle', () => {
    afterEach(() => OctokitGitHubService.resetInstance());

    it('returns the same shared instance across calls with the same token', () => {
      const first = OctokitGitHubService.getInstance('token');
      const second = OctokitGitHubService.getInstance('token');
      expect(second).toBe(first);
    });

    it('throws when a different token is requested for the shared instance', () => {
      OctokitGitHubService.getInstance('token-a');
      expect(() => OctokitGitHubService.getInstance('token-b')).toThrow(ValidationError);
    });

    it('newInstance always builds a fresh, isolated instance', () => {
      const shared = OctokitGitHubService.getInstance('token');
      const fresh = OctokitGitHubService.newInstance('token');
      const fresh2 = OctokitGitHubService.newInstance('token');
      expect(fresh).not.toBe(shared);
      expect(fresh2).not.toBe(fresh);
      expect(fresh).toBeInstanceOf(OctokitGitHubService);
    });

    it('rebuilds the shared instance after reset', () => {
      const first = OctokitGitHubService.getInstance('token');
      OctokitGitHubService.resetInstance();
      const second = OctokitGitHubService.getInstance('token');
      expect(second).not.toBe(first);
    });

    it('allows a different token after reset', () => {
      OctokitGitHubService.getInstance('token-a');
      OctokitGitHubService.resetInstance();
      expect(() => OctokitGitHubService.getInstance('token-b')).not.toThrow();
    });
  });
});
