import {
  runSyncBranchesAction,
  validateSyncBranchesInputs,
  type ActionContext,
} from '@gforce/core';
import { runGitHubAction, type GitHubActionDefinition } from '@gforce/github-actions-runtime';
import type { RawSyncInputs, ValidatedSyncInputs, SyncBranchesResult } from '@gforce/core';
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
