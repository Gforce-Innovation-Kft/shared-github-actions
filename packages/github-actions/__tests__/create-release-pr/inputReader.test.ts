import * as core from '@actions/core';
import { readInputs } from '../../src/create-release-pr/inputReader';

jest.mock('@actions/core');

describe('readInputs', () => {
  it('maps action inputs to raw fields', () => {
    const values: Record<string, string> = {
      'source-branch': 'develop',
      'target-branch': 'main',
      'release-version': 'v1.2.0',
      title: 'Release v1.2.0',
      'body-template': '## {{version}}',
      draft: 'false',
      labels: 'release,automated',
      reviewers: 'octocat',
      'dry-run': 'true',
      'github-token': 'tok',
    };
    jest.mocked(core.getInput).mockImplementation((name: string) => values[name] ?? '');

    expect(readInputs()).toEqual({
      sourceBranch: 'develop',
      targetBranch: 'main',
      releaseVersion: 'v1.2.0',
      title: 'Release v1.2.0',
      bodyTemplate: '## {{version}}',
      draft: 'false',
      labels: 'release,automated',
      reviewers: 'octocat',
      dryRun: 'true',
      githubToken: 'tok',
    });
  });
});
