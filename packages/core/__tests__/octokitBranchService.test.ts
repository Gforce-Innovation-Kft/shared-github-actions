import type { Octokit } from '@octokit/rest';
import { GitHubApiError, ValidationError } from '../src/utils/errors/errors';
import { GitHubClient } from '../src/github-service/client/gitHubClient';
import { OctokitBranchService } from '../src/github-service/branch/octokitBranchService';
import { REPO } from './support/fakes';

function createFakeOctokit() {
  return {
    rest: {
      repos: {
        compareCommitsWithBasehead: jest.fn(),
        getBranch: jest.fn(),
        merge: jest.fn(),
      },
      git: { updateRef: jest.fn() },
    },
  };
}

type FakeOctokit = ReturnType<typeof createFakeOctokit>;

function service(fake: FakeOctokit): OctokitBranchService {
  return new OctokitBranchService(fake as unknown as Octokit);
}

describe('OctokitBranchService', () => {
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

  describe('singleton lifecycle', () => {
    afterEach(() => {
      OctokitBranchService.resetInstance();
      GitHubClient.resetInstance();
    });

    it('shares one instance (and the shared client) across calls', () => {
      const first = OctokitBranchService.getInstance('token');
      expect(OctokitBranchService.getInstance('token')).toBe(first);
    });

    it('throws when a different token is requested', () => {
      OctokitBranchService.getInstance('token-a');
      expect(() => OctokitBranchService.getInstance('token-b')).toThrow(ValidationError);
    });

    it('newInstance builds a fresh, isolated instance', () => {
      const shared = OctokitBranchService.getInstance('token');
      const fresh = OctokitBranchService.newInstance('token');
      expect(fresh).not.toBe(shared);
      expect(fresh).toBeInstanceOf(OctokitBranchService);
    });

    it('rebuilds after reset', () => {
      const first = OctokitBranchService.getInstance('token');
      OctokitBranchService.resetInstance();
      expect(OctokitBranchService.getInstance('token')).not.toBe(first);
    });
  });
});
