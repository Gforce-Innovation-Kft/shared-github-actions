/** Commit-related value objects returned by the GitHub service. */

export interface CommitSummary {
  readonly sha: string;
  readonly message: string;
  readonly author?: string;
}

export type ChangeStatus =
  | 'added'
  | 'removed'
  | 'modified'
  | 'renamed'
  | 'copied'
  | 'changed'
  | 'unchanged';

export interface ChangedFile {
  readonly filename: string;
  readonly status: ChangeStatus;
  readonly additions: number;
  readonly deletions: number;
}
