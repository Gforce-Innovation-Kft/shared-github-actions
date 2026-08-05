import * as core from '@actions/core';

import { Orchestrator } from '../../../gforce-gha-src/actions/sf-find-tests/orchestrator';

async function run(): Promise<void> {
  try {
    const result = await Orchestrator.getInstance().execute({
      'package-xml': core.getInput('package-xml', { required: true }),
      'source-dir': core.getInput('source-dir'),
      'test-suffixes': core.getInput('test-suffixes'),
      'github-token': core.getInput('github-token'),
    });
    core.setOutput('tests', result.tests.join(' '));
    core.setOutput('test-count', String(result.testCount));
    core.setOutput('has-apex', String(result.hasApex));
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

void run();
