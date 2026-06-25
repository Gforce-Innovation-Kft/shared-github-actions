/** Types for the portable sync-branches use case. */
import type { GitHubService } from '../../github-service/githubService';
import type { RepoRef } from '../../github-service/types';
import type { Logger } from '../../utils/logging/logger';

export const SYNC_STRATEGIES = ['auto', 'fast-forward', 'merge'] as const;
export type SyncStrategy = (typeof SYNC_STRATEGIES)[number];

/** What the orchestrator actually did (or would do, in dry-run). */
export type SyncAction = 'none' | 'fast-forward' | 'merge' | 'pull-request';

export interface SyncBranchesRequest {
  readonly repo: RepoRef;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly strategy: SyncStrategy;
  readonly dryRun: boolean;
}

export interface SyncBranchesResult {
  readonly action: SyncAction;
  readonly synced: boolean;
  readonly dryRun: boolean;
  readonly aheadBy: number;
  readonly behindBy: number;
  readonly resultSha?: string;
  readonly pullRequestNumber?: number;
  readonly pullRequestUrl?: string;
  readonly reason: string;
}

export interface SyncBranchesDeps {
  readonly github: GitHubService;
  readonly logger: Logger;
}

/** Raw, unvalidated inputs as read from the GitHub Action runtime. */
export interface RawSyncInputs {
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly strategy: string;
  readonly dryRun: string;
  readonly githubToken: string;
}

/** Normalized, validated inputs ready to build an orchestration request. */
export interface ValidatedSyncInputs {
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly strategy: SyncStrategy;
  readonly dryRun: boolean;
  readonly githubToken: string;
}
