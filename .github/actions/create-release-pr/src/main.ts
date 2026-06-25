import {
  runCreateReleasePrAction,
  validateCreateReleasePrInputs,
  type ActionContext,
} from '@gforce/core';
import { runGitHubAction, type GitHubActionDefinition } from '@gforce/github-actions-runtime';
import type {
  RawReleasePrInputs,
  ValidatedReleasePrInputs,
  CreateReleasePrResult,
} from '@gforce/core';
import { readInputs } from './inputReader';
import { writeOutputs } from './outputWriter';

/** The create-release-pr action wired from portable, shared pieces. */
export const createReleasePrAction: GitHubActionDefinition<
  RawReleasePrInputs,
  ValidatedReleasePrInputs,
  CreateReleasePrResult
> = {
  readInputs,
  validateInputs: validateCreateReleasePrInputs,
  execute: runCreateReleasePrAction,
  writeOutputs,
};

/** Action entrypoint. `overrides` is for tests; production passes nothing. */
export function run(overrides?: Partial<ActionContext>): Promise<void> {
  return runGitHubAction(createReleasePrAction, overrides);
}
