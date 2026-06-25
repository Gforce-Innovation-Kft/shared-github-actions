/**
 * Workflow / Action API value objects.
 *
 * STUB: reserved for future actions that need to dispatch or inspect workflow
 * runs (e.g. `workflow_dispatch`). Declared here so there is one obvious home
 * for those wrappers when they are added to {@link GitHubService}. No runtime
 * code yet.
 */

export interface WorkflowDispatchRequest {
  readonly workflowId: string;
  readonly ref: string;
  readonly inputs?: Readonly<Record<string, string>>;
}
