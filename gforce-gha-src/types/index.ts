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
