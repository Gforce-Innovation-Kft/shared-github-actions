import * as core from '@actions/core';
import type { SyncBranchesResult } from '@gforce/core';

/** Map the typed orchestration result onto kebab-case Action outputs. */
export function writeOutputs(result: SyncBranchesResult): void {
  core.setOutput('synced', String(result.synced));
  core.setOutput('action', result.action);
  core.setOutput('result-sha', result.resultSha ?? '');
  core.setOutput(
    'pull-request-number',
    result.pullRequestNumber != null ? String(result.pullRequestNumber) : '',
  );
  core.setOutput('pull-request-url', result.pullRequestUrl ?? '');
  core.setOutput('ahead-by', String(result.aheadBy));
  core.setOutput('behind-by', String(result.behindBy));
  core.setOutput('dry-run', String(result.dryRun));
  core.setOutput('reason', result.reason);

  core.info(
    `sync-branches: action=${result.action} synced=${result.synced} reason=${result.reason}`,
  );
}
