import * as core from '@actions/core';
import type { RawReleasePrInputs } from '@gforce/core';

/** Read raw inputs from the Action runtime. No validation happens here. */
export function readInputs(): RawReleasePrInputs {
  return {
    sourceBranch: core.getInput('source-branch'),
    targetBranch: core.getInput('target-branch'),
    releaseVersion: core.getInput('release-version'),
    title: core.getInput('title'),
    bodyTemplate: core.getInput('body-template'),
    draft: core.getInput('draft'),
    labels: core.getInput('labels'),
    reviewers: core.getInput('reviewers'),
    dryRun: core.getInput('dry-run'),
    githubToken: core.getInput('github-token'),
  };
}
