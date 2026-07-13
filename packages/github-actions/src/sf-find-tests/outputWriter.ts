import * as core from '@actions/core';
import type { FindTestsResult } from '@gforce/core';

/** Map the typed result onto kebab-case Action outputs. */
export function writeOutputs(result: FindTestsResult): void {
  core.setOutput('tests', result.tests.join(' '));
  core.setOutput('test-count', String(result.testCount));
  core.setOutput('has-apex', String(result.hasApex));
  core.info(`sf-find-tests: hasApex=${result.hasApex} selected=${result.testCount}`);
}
