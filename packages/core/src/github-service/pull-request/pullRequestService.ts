/**
 * PullRequestService — the PR-scoped slice of the GitHub REST API: listing,
 * creating, and updating pull requests, plus applying labels and requesting
 * reviewers on them. Implemented only by {@link OctokitPullRequestService}.
 */
import type { RepoRef } from '../types';
import type {
  CreatePullRequestParams,
  ListPullRequestsParams,
  PullRequestSummary,
  UpdatePullRequestParams,
} from './types';

export interface PullRequestService {
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
