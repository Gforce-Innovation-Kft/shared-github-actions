import * as core from '@actions/core';
import type { RawSyncInputs } from '@gforce/core';

/** Read raw inputs from the Action runtime. No validation happens here. */
export function readInputs(): RawSyncInputs {
  return {
    sourceBranch: core.getInput('source-branch'),
    targetBranch: core.getInput('target-branch'),
    strategy: core.getInput('strategy'),
    dryRun: core.getInput('dry-run'),
    githubToken: core.getInput('github-token'),
  };
}
