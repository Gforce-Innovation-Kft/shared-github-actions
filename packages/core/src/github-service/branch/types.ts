/** Branch comparison and merge value objects. */
import type { ChangedFile, CommitSummary } from '../commit/types';

/** GitHub's `compare` status between a base and head ref. */
export type CompareStatus = 'diverged' | 'ahead' | 'behind' | 'identical';

export interface CompareResult {
  readonly status: CompareStatus;
  /** Commits the head ref has that the base ref does not. */
  readonly aheadBy: number;
  /** Commits the base ref has that the head ref does not. */
  readonly behindBy: number;
  readonly totalCommits: number;
  readonly commits: readonly CommitSummary[];
  readonly files: readonly ChangedFile[];
}

/** Outcome of attempting a server-side merge of one branch into another. */
export type MergeOutcome =
  | { readonly status: 'merged'; readonly sha: string }
  | { readonly status: 'nothing' }
  | { readonly status: 'conflict' };
