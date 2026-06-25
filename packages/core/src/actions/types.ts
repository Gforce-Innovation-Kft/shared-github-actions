/**
 * Collaborators shared by every action runner. Built by the runtime adapter
 * (repo from the environment, logger over the toolkit, the shared GitHub
 * service) and injected into the portable `run*Action` helpers.
 */
import type { GitHubService } from '../github-service/githubService';
import type { RepoRef } from '../github-service/types';
import type { Logger } from '../utils/logging/logger';

export interface ActionContext {
  readonly github: GitHubService;
  readonly logger: Logger;
  readonly repo: RepoRef;
}
