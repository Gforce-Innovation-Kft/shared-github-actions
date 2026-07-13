import * as core from '@actions/core';
import type { CreateReleasePrResult } from '@gforce/core';
import { writeOutputs } from '../../src/create-release-pr/outputWriter';

jest.mock('@actions/core');

describe('writeOutputs', () => {
  it('maps a created PR result to outputs', () => {
    const result: CreateReleasePrResult = {
      created: true,
      updated: false,
      dryRun: false,
      pullRequestNumber: 7,
      pullRequestUrl: 'https://example.test/pull/7',
      title: 'Release v1',
      body: 'body',
    };

    writeOutputs(result);

    const setOutput = jest.mocked(core.setOutput);
    expect(setOutput).toHaveBeenCalledWith('pull-request-number', '7');
    expect(setOutput).toHaveBeenCalledWith('pull-request-url', 'https://example.test/pull/7');
    expect(setOutput).toHaveBeenCalledWith('created', 'true');
    expect(setOutput).toHaveBeenCalledWith('updated', 'false');
    expect(setOutput).toHaveBeenCalledWith('dry-run', 'false');
  });

  it('emits empty strings when no pull request exists', () => {
    const result: CreateReleasePrResult = {
      created: false,
      updated: false,
      dryRun: true,
      title: 'Release v1',
      body: 'body',
    };

    writeOutputs(result);

    const setOutput = jest.mocked(core.setOutput);
    expect(setOutput).toHaveBeenCalledWith('pull-request-number', '');
    expect(setOutput).toHaveBeenCalledWith('pull-request-url', '');
    expect(setOutput).toHaveBeenCalledWith('dry-run', 'true');
  });
});
