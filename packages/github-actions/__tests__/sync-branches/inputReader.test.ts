import * as core from '@actions/core';
import { readInputs } from '../../src/sync-branches/inputReader';

jest.mock('@actions/core');

describe('readInputs', () => {
  it('maps action inputs to raw fields', () => {
    const values: Record<string, string> = {
      'source-branch': 'develop',
      'target-branch': 'main',
      strategy: 'merge',
      'dry-run': 'false',
      'github-token': 'tok',
    };
    jest.mocked(core.getInput).mockImplementation((name: string) => values[name] ?? '');

    expect(readInputs()).toEqual({
      sourceBranch: 'develop',
      targetBranch: 'main',
      strategy: 'merge',
      dryRun: 'false',
      githubToken: 'tok',
    });
  });
});
