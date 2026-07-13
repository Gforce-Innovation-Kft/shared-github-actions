import * as core from '@actions/core';
import type { RawFindTestsInputs } from '@gforce/core';

/** Read raw inputs from the Action runtime. No validation happens here. */
export function readInputs(): RawFindTestsInputs {
  return {
    packageXml: core.getInput('package-xml'),
    sourceDir: core.getInput('source-dir'),
    testSuffixes: core.getInput('test-suffixes'),
    githubToken: core.getInput('github-token'),
  };
}
