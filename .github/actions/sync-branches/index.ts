import * as core from '@actions/core';

import { Orchestrator } from '../../../gforce-gha-src/actions/sync-branches/orchestrator';

async function run(): Promise<void> {
  try {
    const result = await Orchestrator.getInstance().execute({
      'source-branch': core.getInput('source-branch', { required: true }),
      'target-branch': core.getInput('target-branch', { required: true }),
      strategy: core.getInput('strategy'),
      'dry-run': core.getInput('dry-run'),
      'github-token': core.getInput('github-token', { required: true }),
    });
    core.setOutput('synced', String(result.synced));
    core.setOutput('action', result.action);
    core.setOutput('result-sha', result.resultSha ?? '');
    core.setOutput(
      'pull-request-number',
      result.pullRequestNumber !== undefined ? String(result.pullRequestNumber) : '',
    );
    core.setOutput('pull-request-url', result.pullRequestUrl ?? '');
    core.setOutput('ahead-by', String(result.aheadBy));
    core.setOutput('behind-by', String(result.behindBy));
    core.setOutput('dry-run', String(result.dryRun));
    core.setOutput('reason', result.reason);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

void run();
