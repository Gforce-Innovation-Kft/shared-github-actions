/** Shared GitHub value objects + re-exports for the github-service module. */

/** Identifies a repository. */
export interface RepoRef {
  readonly owner: string;
  readonly repo: string;
}

export * from './commit/types';
export * from './branch/types';
export * from './pull-request/types';
export * from './action/types';
