import { GitHubClient } from '../src/github-service/client/gitHubClient';
import { OctokitGitHubService } from '../src/github-service/github/octokitGitHubService';
import { OctokitBranchService } from '../src/github-service/branch/octokitBranchService';
import { OctokitPullRequestService } from '../src/github-service/pull-request/octokitPullRequestService';
import { ValidationError } from '../src/utils/errors/errors';
import {
  createFakeBranchService,
  createFakePullRequestService,
  pullRequest,
  REPO,
} from './support/fakes';

describe('OctokitGitHubService (facade)', () => {
  describe('delegation', () => {
    const branch = createFakeBranchService();
    const pulls = createFakePullRequestService();
    const facade = new OctokitGitHubService(branch, pulls);

    afterEach(() => jest.clearAllMocks());

    it('delegates branch operations to the BranchService', async () => {
      branch.compareBranches.mockResolvedValue({
        status: 'ahead',
        aheadBy: 1,
        behindBy: 0,
        totalCommits: 1,
        commits: [],
        files: [],
      });
      branch.getBranchHeadSha.mockResolvedValue('sha-1');
      branch.mergeBranches.mockResolvedValue({ status: 'merged', sha: 'm' });

      await facade.compareBranches(REPO, 'main', 'develop');
      await facade.getBranchHeadSha(REPO, 'develop');
      await facade.updateBranchRef(REPO, 'main', 'sha-1', true);
      await facade.mergeBranches(REPO, 'main', 'develop', 'msg');

      expect(branch.compareBranches).toHaveBeenCalledWith(REPO, 'main', 'develop');
      expect(branch.getBranchHeadSha).toHaveBeenCalledWith(REPO, 'develop');
      expect(branch.updateBranchRef).toHaveBeenCalledWith(REPO, 'main', 'sha-1', true);
      expect(branch.mergeBranches).toHaveBeenCalledWith(REPO, 'main', 'develop', 'msg');
    });

    it('delegates pull request operations to the PullRequestService', async () => {
      pulls.listOpenPullRequests.mockResolvedValue([pullRequest()]);
      pulls.createPullRequest.mockResolvedValue(pullRequest());
      pulls.updatePullRequest.mockResolvedValue(pullRequest());

      await facade.listOpenPullRequests(REPO, { head: 'develop', base: 'main' });
      await facade.createPullRequest(REPO, {
        head: 'develop',
        base: 'main',
        title: 't',
        body: 'b',
      });
      await facade.updatePullRequest(REPO, 1, { title: 't' });
      await facade.addLabels(REPO, 1, ['release']);
      await facade.requestReviewers(REPO, 1, ['octocat']);

      expect(pulls.listOpenPullRequests).toHaveBeenCalledWith(REPO, {
        head: 'develop',
        base: 'main',
      });
      expect(pulls.createPullRequest).toHaveBeenCalledWith(REPO, {
        head: 'develop',
        base: 'main',
        title: 't',
        body: 'b',
      });
      expect(pulls.updatePullRequest).toHaveBeenCalledWith(REPO, 1, { title: 't' });
      expect(pulls.addLabels).toHaveBeenCalledWith(REPO, 1, ['release']);
      expect(pulls.requestReviewers).toHaveBeenCalledWith(REPO, 1, ['octocat']);
    });
  });

  describe('singleton lifecycle', () => {
    afterEach(() => {
      OctokitGitHubService.resetInstance();
      OctokitBranchService.resetInstance();
      OctokitPullRequestService.resetInstance();
      GitHubClient.resetInstance();
      jest.restoreAllMocks();
    });

    it('shares one facade and composes the per-domain singletons over one client', () => {
      const clientSpy = jest.spyOn(GitHubClient, 'newInstance');

      const facade = OctokitGitHubService.getInstance('token');

      expect(OctokitGitHubService.getInstance('token')).toBe(facade);
      // Both sub-services were composed from the same cached singletons...
      expect(OctokitBranchService.getInstance('token')).toBeDefined();
      expect(OctokitPullRequestService.getInstance('token')).toBeDefined();
      // ...and only one underlying client was ever constructed.
      expect(clientSpy).toHaveBeenCalledTimes(1);
    });

    it('throws when a different token is requested', () => {
      OctokitGitHubService.getInstance('token-a');
      expect(() => OctokitGitHubService.getInstance('token-b')).toThrow(ValidationError);
    });

    it('newInstance builds an isolated facade over one fresh client', () => {
      const clientSpy = jest.spyOn(GitHubClient, 'newInstance');
      const shared = OctokitGitHubService.getInstance('token');
      clientSpy.mockClear();

      const fresh = OctokitGitHubService.newInstance('token');

      expect(fresh).not.toBe(shared);
      expect(fresh).toBeInstanceOf(OctokitGitHubService);
      expect(clientSpy).toHaveBeenCalledTimes(1);
    });

    it('rebuilds after reset', () => {
      const first = OctokitGitHubService.getInstance('token');
      OctokitGitHubService.resetInstance();
      expect(OctokitGitHubService.getInstance('token')).not.toBe(first);
    });
  });
});
