/**
 * Public surface of the portable core. Action adapters and the runtime package
 * import only from `@gforce/core`.
 */

// Result + errors
export { ok, err, isOk, isErr } from './utils/result/result';
export type { Result, Ok, Err } from './utils/result/result';
export { AppError, ValidationError, GitHubApiError, asAppError } from './utils/errors/errors';

// Logging
export { NoopLogger } from './utils/logging/logger';
export type { Logger } from './utils/logging/logger';

// Validation helpers
export { requireNonEmpty, parseBoolean, parseList, parseEnum } from './utils/validation/validation';

// GitHub services. Each domain colocates its port + Octokit implementation in
// one file (singleton statics included); the facade composes them. Value objects
// live in each domain's types.ts.
export { GitHubClient } from './github-service/client/gitHubClient';
export { OctokitBranchService, type BranchService } from './github-service/branch/branchService';
export {
  OctokitPullRequestService,
  type PullRequestService,
} from './github-service/pull-request/pullRequestService';
export type { ActionsService } from './github-service/action/actionsService';
export { OctokitGitHubService, type GitHubService } from './github-service/github/gitHubService';
export { parseRepoRef } from './github-service/parseRepoRef';
export type {
  RepoRef,
  CommitSummary,
  ChangedFile,
  ChangeStatus,
  CompareStatus,
  CompareResult,
  MergeOutcome,
  PullRequestSummary,
  ListPullRequestsParams,
  CreatePullRequestParams,
  UpdatePullRequestParams,
  WorkflowDispatchRequest,
} from './github-service/types';

// Future-work service stubs
export type { GitService } from './git-service/gitService';
export type { SfdxService } from './sfdx-service/sfdxService';

// Shared action collaborators
export type { ActionContext } from './actions/types';
