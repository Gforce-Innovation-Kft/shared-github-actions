/**
 * GitService — abstraction over a LOCAL git working tree.
 *
 * STUB ONLY. The two initial actions operate entirely through the GitHub REST
 * API ({@link GitHubService}) and do not need a checked-out working tree, so
 * there is intentionally no concrete implementation here yet. This interface
 * marks the single home for local-git wrappers (branch/commit/pull-request/
 * repository operations) when a future action requires them — keep external
 * process execution behind this interface so it stays unit-testable.
 */
import type { CheckoutOptions, GitCommandResult } from './types';

export interface GitService {
  checkout(branch: string, options?: CheckoutOptions): Promise<GitCommandResult>;
  fetch(remote: string, ref?: string): Promise<GitCommandResult>;
  merge(ref: string): Promise<GitCommandResult>;
  push(remote: string, ref: string, force?: boolean): Promise<GitCommandResult>;
}
