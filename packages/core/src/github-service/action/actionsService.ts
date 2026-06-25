/**
 * ActionsService — the workflow/Actions slice of the GitHub REST API.
 *
 * STUB ONLY. The two initial actions never dispatch or inspect workflow runs, so
 * there is no concrete implementation yet. This interface marks the single home
 * for those wrappers (e.g. `workflow_dispatch`) and, once implemented, would be
 * folded into the {@link GitHubService} facade alongside branch/PR. No runtime
 * code yet.
 */
import type { RepoRef } from '../types';
import type { WorkflowDispatchRequest } from './types';

export interface ActionsService {
  dispatchWorkflow(repo: RepoRef, request: WorkflowDispatchRequest): Promise<void>;
}
