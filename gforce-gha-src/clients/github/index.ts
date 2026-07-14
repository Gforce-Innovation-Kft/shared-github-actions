/** Barrel: re-exports all GitHub sub-clients, the facade, and their types. */
export {
  createOctokit,
  getErrorStatus,
  getSharedOctokit,
  resetSharedOctokit,
  runOctokit,
  toGitHubApiError,
  type OctokitType,
} from './core/github-client-core';
export { GitHubBranchesClient } from './repos/github-branches-client';
export type {
  BranchComparison,
  ChangedFile,
  ChangeStatus,
  CommitSummary,
  CompareStatus,
  MergeOutcome,
} from './repos/types';
export { GitHubPullRequestsClient } from './pull-requests/github-pull-requests-client';
export type {
  CreatePullRequestParams,
  ListPullRequestsParams,
  PullRequestSummary,
  UpdatePullRequestParams,
} from './pull-requests/types';
export { GitHubClient } from './github-client';
