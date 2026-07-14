import * as core from '@actions/core';

import { Orchestrator } from '../../../gforce-gha-src/actions/create-release-pr/orchestrator';

async function run(): Promise<void> {
  try {
    const result = await Orchestrator.getInstance().execute({
      'source-branch': core.getInput('source-branch', { required: true }),
      'target-branch': core.getInput('target-branch', { required: true }),
      'release-version': core.getInput('release-version', { required: true }),
      title: core.getInput('title'),
      'body-template': core.getInput('body-template'),
      draft: core.getInput('draft'),
      labels: core.getInput('labels'),
      reviewers: core.getInput('reviewers'),
      'dry-run': core.getInput('dry-run'),
      'github-token': core.getInput('github-token', { required: true }),
    });
    core.setOutput(
      'pull-request-number',
      result.pullRequestNumber !== undefined ? String(result.pullRequestNumber) : '',
    );
    core.setOutput('pull-request-url', result.pullRequestUrl ?? '');
    core.setOutput('created', String(result.created));
    core.setOutput('updated', String(result.updated));
    core.setOutput('dry-run', String(result.dryRun));
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

void run();
