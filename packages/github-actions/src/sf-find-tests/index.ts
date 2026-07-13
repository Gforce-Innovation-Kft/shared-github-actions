import {
  runFindTestsAction,
  validateFindTestsInputs,
  type ActionContext,
  type RawFindTestsInputs,
  type ValidatedFindTestsInputs,
  type FindTestsResult,
} from '@gforce/core';
import { runGitHubAction, type GitHubActionDefinition } from '@gforce/github-actions-runtime';
import { readInputs } from './inputReader';
import { writeOutputs } from './outputWriter';

/** The sf-find-tests action wired from portable, shared pieces. */
export const sfFindTestsAction: GitHubActionDefinition<
  RawFindTestsInputs,
  ValidatedFindTestsInputs,
  FindTestsResult
> = {
  readInputs,
  validateInputs: validateFindTestsInputs,
  execute: runFindTestsAction,
  writeOutputs,
};

/** Action entrypoint. `overrides` is for tests; production passes nothing. */
export function run(overrides?: Partial<ActionContext>): Promise<void> {
  return runGitHubAction(sfFindTestsAction, overrides);
}

/* istanbul ignore next -- runner-only entry guard; tests import and call run() directly */
if (require.main === module) {
  void run();
}
