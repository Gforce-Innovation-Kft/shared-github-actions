/**
 * GitHub Actions runtime adapter. This package — unlike portable `@gforce/core`
 * — is allowed to depend on `@actions/core` and the runner environment.
 */
export { ActionsLogger } from './ActionsLogger';
export { readRepoFromEnvironment } from './readRepoFromEnvironment';
export { runGitHubAction } from './runAction';
export type { GitHubActionDefinition } from './runAction';
