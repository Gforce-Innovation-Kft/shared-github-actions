import {
  runSyncBranchesAction,
  validateSyncBranchesInputs,
  type ActionContext,
  type RawSyncInputs,
  type ValidatedSyncInputs,
  type SyncBranchesResult,
} from '@gforce/core';
import { runGitHubAction, type GitHubActionDefinition } from '@gforce/github-actions-runtime';
import { readInputs } from './inputReader';
import { writeOutputs } from './outputWriter';

/** The sync-branches action wired from portable, shared pieces. */
export const syncBranchesAction: GitHubActionDefinition<
  RawSyncInputs,
  ValidatedSyncInputs,
  SyncBranchesResult
> = {
  readInputs,
  validateInputs: validateSyncBranchesInputs,
  execute: runSyncBranchesAction,
  writeOutputs,
};

/** Action entrypoint. `overrides` is for tests; production passes nothing. */
export function run(overrides?: Partial<ActionContext>): Promise<void> {
  return runGitHubAction(syncBranchesAction, overrides);
}

/* istanbul ignore next -- runner-only entry guard; tests import and call run() directly */
if (require.main === module) {
  void run();
}
