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

// GitHub service (port + implementation + singleton statics + value objects)
export type { GitHubService } from './github-service/githubService';
export { OctokitGitHubService } from './github-service/octokitGitHubService';
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

// sync-branches use case + action seam
export { syncBranches, runSyncBranchesAction } from './actions/syncBranches/syncBranches';
export { validateSyncBranchesInputs } from './actions/syncBranches/validateSyncBranchesInputs';
export { SYNC_STRATEGIES } from './actions/syncBranches/types';
export type {
  SyncStrategy,
  SyncAction,
  SyncBranchesRequest,
  SyncBranchesResult,
  SyncBranchesDeps,
  RawSyncInputs,
  ValidatedSyncInputs,
} from './actions/syncBranches/types';

// create-release-pr use case + action seam
export {
  createReleasePr,
  renderReleaseBody,
  runCreateReleasePrAction,
} from './actions/createReleasePr/createReleasePr';
export { validateCreateReleasePrInputs } from './actions/createReleasePr/validateCreateReleasePrInputs';
export type {
  CreateReleasePrRequest,
  CreateReleasePrResult,
  CreateReleasePrDeps,
  RawReleasePrInputs,
  ValidatedReleasePrInputs,
} from './actions/createReleasePr/types';
