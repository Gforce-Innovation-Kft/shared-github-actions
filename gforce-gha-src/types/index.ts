/**
 * Shared data types, interfaces, and DTOs used across actions, services, and
 * clients. Client-endpoint shapes are co-located with their client in
 * `clients/<system>/<domain>/types.ts`; only cross-layer types live here.
 */

/** Identifies a repository. */
export interface RepoRef {
  readonly owner: string;
  readonly repo: string;
}

// sync-branches
export const SYNC_STRATEGIES = ['auto', 'fast-forward', 'merge'] as const;
export type SyncStrategy = (typeof SYNC_STRATEGIES)[number];

/** What the sync actually did (or would do, in dry-run). */
export type SyncAction = 'none' | 'fast-forward' | 'merge' | 'pull-request';

/** Normalized, validated sync-branches inputs. */
export interface ValidatedSyncBranchesInputs {
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly strategy: SyncStrategy;
  readonly dryRun: boolean;
  readonly githubToken: string;
}

export interface SyncBranchesRequest extends ValidatedSyncBranchesInputs {
  readonly repo: RepoRef;
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

// create-release-pr

/** Normalized, validated create-release-pr inputs. */
export interface ValidatedCreateReleasePrInputs {
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly releaseVersion: string;
  readonly title?: string;
  readonly bodyTemplate?: string;
  readonly draft: boolean;
  readonly labels: readonly string[];
  readonly reviewers: readonly string[];
  readonly dryRun: boolean;
  readonly githubToken: string;
}

export interface CreateReleasePrRequest extends ValidatedCreateReleasePrInputs {
  readonly repo: RepoRef;
}

export interface CreateReleasePrResult {
  readonly created: boolean;
  readonly updated: boolean;
  readonly dryRun: boolean;
  readonly pullRequestNumber?: number;
  readonly pullRequestUrl?: string;
  readonly title: string;
  readonly body: string;
}
