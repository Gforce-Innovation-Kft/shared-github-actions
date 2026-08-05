/**
 * The {@link GitHubClient} facade — the single object services depend on. It
 * exposes the union of the sub-clients and delegates every method; it holds no
 * Octokit itself. New endpoints go on the matching sub-client (branches/refs →
 * {@link GitHubBranchesClient}, PRs/reviews → {@link GitHubPullRequestsClient});
 * unrelated API areas get a new sub-client under `clients/github/<domain>/`.
 */
import type { RepoRef } from '../../types';
import { ValidationError } from '../../utils/errors';
import { createOctokit, resetSharedOctokit } from './core/github-client-core';
import { GitHubBranchesClient } from './repos/github-branches-client';
import type { BranchComparison, MergeOutcome } from './repos/types';
import { GitHubPullRequestsClient } from './pull-requests/github-pull-requests-client';
import type {
  CreatePullRequestParams,
  ListPullRequestsParams,
  PullRequestSummary,
  UpdatePullRequestParams,
} from './pull-requests/types';

export class GitHubClient {
  private static instance: GitHubClient | undefined;
  private static instanceToken: string | undefined;

  constructor(
    private readonly branches: GitHubBranchesClient,
    private readonly pullRequests: GitHubPullRequestsClient,
  ) {}

  /**
   * Process-wide shared facade composing the sub-client singletons (all backed
   * by the one shared Octokit). A later call with a different token throws.
   */
  public static getInstance(token: string): GitHubClient {
    if (GitHubClient.instance) {
      if (GitHubClient.instanceToken !== token) {
        throw new ValidationError(
          'A shared GitHub client already exists for a different token. ' +
            'Call GitHubClient.resetInstance() first, or use GitHubClient.newInstance() for an isolated client.',
        );
      }
      return GitHubClient.instance;
    }
    GitHubClient.instanceToken = token;
    GitHubClient.instance = new GitHubClient(
      GitHubBranchesClient.getInstance(token),
      GitHubPullRequestsClient.getInstance(token),
    );
    return GitHubClient.instance;
  }

  /** Build an isolated facade whose sub-clients share one fresh Octokit. */
  public static newInstance(token: string): GitHubClient {
    const octokit = createOctokit(token);
    return new GitHubClient(
      new GitHubBranchesClient(octokit),
      new GitHubPullRequestsClient(octokit),
    );
  }

  /**
   * Drop the cached facade AND cascade to the sub-clients + shared Octokit so
   * one `afterEach` call restores a clean slate. Test-only.
   */
  public static resetInstance(): void {
    GitHubClient.instance = undefined;
    GitHubClient.instanceToken = undefined;
    GitHubBranchesClient.resetInstance();
    GitHubPullRequestsClient.resetInstance();
    resetSharedOctokit();
  }

  // Branches
  public compareBranches(repo: RepoRef, base: string, head: string): Promise<BranchComparison> {
    return this.branches.compareBranches(repo, base, head);
  }

  public getBranchHeadSha(repo: RepoRef, branch: string): Promise<string> {
    return this.branches.getBranchHeadSha(repo, branch);
  }

  public updateBranchRef(
    repo: RepoRef,
    branch: string,
    sha: string,
    force?: boolean,
  ): Promise<void> {
    return this.branches.updateBranchRef(repo, branch, sha, force);
  }

  public mergeBranches(
    repo: RepoRef,
    base: string,
    head: string,
    commitMessage?: string,
  ): Promise<MergeOutcome> {
    return this.branches.mergeBranches(repo, base, head, commitMessage);
  }

  // Pull requests
  public listOpenPullRequests(
    repo: RepoRef,
    params: ListPullRequestsParams,
  ): Promise<readonly PullRequestSummary[]> {
    return this.pullRequests.listOpenPullRequests(repo, params);
  }

  public createPullRequest(
    repo: RepoRef,
    params: CreatePullRequestParams,
  ): Promise<PullRequestSummary> {
    return this.pullRequests.createPullRequest(repo, params);
  }

  public updatePullRequest(
    repo: RepoRef,
    pullNumber: number,
    params: UpdatePullRequestParams,
  ): Promise<PullRequestSummary> {
    return this.pullRequests.updatePullRequest(repo, pullNumber, params);
  }

  public addLabels(repo: RepoRef, pullNumber: number, labels: readonly string[]): Promise<void> {
    return this.pullRequests.addLabels(repo, pullNumber, labels);
  }

  public requestReviewers(
    repo: RepoRef,
    pullNumber: number,
    reviewers: readonly string[],
  ): Promise<void> {
    return this.pullRequests.requestReviewers(repo, pullNumber, reviewers);
  }
}
