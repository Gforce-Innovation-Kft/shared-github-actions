import * as core from '@actions/core';
import type { CreateReleasePrResult } from '@gforce/core';

/** Map the typed orchestration result onto kebab-case Action outputs. */
export function writeOutputs(result: CreateReleasePrResult): void {
  core.setOutput(
    'pull-request-number',
    result.pullRequestNumber != null ? String(result.pullRequestNumber) : '',
  );
  core.setOutput('pull-request-url', result.pullRequestUrl ?? '');
  core.setOutput('created', String(result.created));
  core.setOutput('updated', String(result.updated));
  core.setOutput('dry-run', String(result.dryRun));

  core.info(
    `create-release-pr: created=${result.created} updated=${result.updated} dryRun=${result.dryRun}`,
  );
}
