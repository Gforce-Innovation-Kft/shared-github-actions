/**
 * The composed {@link GitHubService} facade. It holds no Octokit itself: it
 * delegates each operation to an injected {@link BranchService} /
 * {@link PullRequestService}, and its singleton statics compose the per-domain
 * singletons so a single {@link GitHubClient} (one rate-limit budget) backs every
 * call. The constructor stays injectable so tests can pass fake sub-services.
 */
import { ValidationError } from '../../utils/errors/errors';
import { GitHubClient } from '../client/gitHubClient';
import { OctokitBranchService } from '../branch/octokitBranchService';
import type { BranchService } from '../branch/branchService';
import type { CompareResult, MergeOutcome } from '../branch/types';
import { OctokitPullRequestService } from '../pull-request/octokitPullRequestService';
import type { PullRequestService } from '../pull-request/pullRequestService';
import type {
  CreatePullRequestParams,
  ListPullRequestsParams,
  PullRequestSummary,
  UpdatePullRequestParams,
} from '../pull-request/types';
import type { RepoRef } from '../types';
import type { GitHubService } from './gitHubService';

export class OctokitGitHubService implements GitHubService {
  private static shared: GitHubService | undefined;
  private static sharedToken: string | undefined;

  constructor(
    private readonly branch: BranchService,
    private readonly pulls: PullRequestService,
  ) {}

  /**
   * Return the process-wide shared facade, composing the per-domain singletons
   * (which all share one {@link GitHubClient}). A later call with a different
   * token throws — call {@link OctokitGitHubService.resetInstance} first, or
   * {@link OctokitGitHubService.newInstance} for an isolated client.
   */
  static getInstance(token: string): GitHubService {
    if (OctokitGitHubService.shared) {
      if (OctokitGitHubService.sharedToken !== token) {
        throw new ValidationError(
          'A shared GitHub service already exists for a different token. ' +
            'Call OctokitGitHubService.resetInstance() first, or use OctokitGitHubService.newInstance() for an isolated client.',
        );
      }
      return OctokitGitHubService.shared;
    }
    OctokitGitHubService.sharedToken = token;
    OctokitGitHubService.shared = new OctokitGitHubService(
      OctokitBranchService.getInstance(token),
      OctokitPullRequestService.getInstance(token),
    );
    return OctokitGitHubService.shared;
  }

  /** Build an isolated facade whose sub-services share one fresh client. */
  static newInstance(token: string): GitHubService {
    const { octokit } = GitHubClient.newInstance(token);
    return new OctokitGitHubService(
      new OctokitBranchService(octokit),
      new OctokitPullRequestService(octokit),
    );
  }

  /** Drop the cached shared facade so the next get rebuilds it. Test-only. */
  static resetInstance(): void {
    OctokitGitHubService.shared = undefined;
    OctokitGitHubService.sharedToken = undefined;
  }

  // BranchService
  compareBranches(repo: RepoRef, base: string, head: string): Promise<CompareResult> {
    return this.branch.compareBranches(repo, base, head);
  }

  getBranchHeadSha(repo: RepoRef, branch: string): Promise<string> {
    return this.branch.getBranchHeadSha(repo, branch);
  }

  updateBranchRef(repo: RepoRef, branch: string, sha: string, force?: boolean): Promise<void> {
    return this.branch.updateBranchRef(repo, branch, sha, force);
  }

  mergeBranches(
    repo: RepoRef,
    base: string,
    head: string,
    commitMessage?: string,
  ): Promise<MergeOutcome> {
    return this.branch.mergeBranches(repo, base, head, commitMessage);
  }

  // PullRequestService
  listOpenPullRequests(
    repo: RepoRef,
    params: ListPullRequestsParams,
  ): Promise<PullRequestSummary[]> {
    return this.pulls.listOpenPullRequests(repo, params);
  }

  createPullRequest(repo: RepoRef, params: CreatePullRequestParams): Promise<PullRequestSummary> {
    return this.pulls.createPullRequest(repo, params);
  }

  updatePullRequest(
    repo: RepoRef,
    pullNumber: number,
    params: UpdatePullRequestParams,
  ): Promise<PullRequestSummary> {
    return this.pulls.updatePullRequest(repo, pullNumber, params);
  }

  addLabels(repo: RepoRef, pullNumber: number, labels: string[]): Promise<void> {
    return this.pulls.addLabels(repo, pullNumber, labels);
  }

  requestReviewers(repo: RepoRef, pullNumber: number, reviewers: string[]): Promise<void> {
    return this.pulls.requestReviewers(repo, pullNumber, reviewers);
  }
}
