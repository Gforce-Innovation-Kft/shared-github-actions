/**
 * GitHubService — the single, mockable abstraction over the GitHub REST API.
 *
 * Every GitHub API operation the actions need is wrapped here EXACTLY ONCE as a
 * typed method, and the only concrete implementation ({@link OctokitGitHubService})
 * is the only place `@octokit/rest` is touched. Orchestrators and action adapters
 * depend on this interface — never on a raw client — so wrappers are reused across
 * actions instead of duplicated.
 */
import type { CompareResult, MergeOutcome } from './branch/types';
import type {
  CreatePullRequestParams,
  ListPullRequestsParams,
  PullRequestSummary,
  UpdatePullRequestParams,
} from './pull-request/types';
import type { RepoRef } from './types';

export interface GitHubService {
  /** Compare two refs (`base...head`) and report ahead/behind counts + diff. */
  compareBranches(repo: RepoRef, base: string, head: string): Promise<CompareResult>;

  /** Resolve the current head commit SHA of a branch. */
  getBranchHeadSha(repo: RepoRef, branch: string): Promise<string>;

  /** Move a branch ref to `sha`. Without `force`, only fast-forwards succeed. */
  updateBranchRef(repo: RepoRef, branch: string, sha: string, force?: boolean): Promise<void>;

  /** Server-side merge of `head` into `base`. Conflicts resolve to a typed outcome. */
  mergeBranches(
    repo: RepoRef,
    base: string,
    head: string,
    commitMessage?: string,
  ): Promise<MergeOutcome>;

  /** List open pull requests matching a head/base pair. */
  listOpenPullRequests(
    repo: RepoRef,
    params: ListPullRequestsParams,
  ): Promise<PullRequestSummary[]>;

  createPullRequest(repo: RepoRef, params: CreatePullRequestParams): Promise<PullRequestSummary>;

  updatePullRequest(
    repo: RepoRef,
    pullNumber: number,
    params: UpdatePullRequestParams,
  ): Promise<PullRequestSummary>;

  addLabels(repo: RepoRef, pullNumber: number, labels: string[]): Promise<void>;

  requestReviewers(repo: RepoRef, pullNumber: number, reviewers: string[]): Promise<void>;
}
