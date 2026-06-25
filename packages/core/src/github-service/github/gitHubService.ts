/**
 * GitHubService — the composed facade over the per-domain GitHub services. It is
 * the single object orchestrators and action adapters depend on; it exposes the
 * union of the {@link BranchService} and {@link PullRequestService} operations,
 * backed by one shared client. New domains (e.g. an ActionsService for
 * `workflow_dispatch`) are folded in here as they gain implementations.
 */
import type { BranchService } from '../branch/branchService';
import type { PullRequestService } from '../pull-request/pullRequestService';

export interface GitHubService extends BranchService, PullRequestService {}
