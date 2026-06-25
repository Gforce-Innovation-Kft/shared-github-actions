import * as core from '@actions/core';
import type { SyncBranchesResult } from '@gforce/core';
import { writeOutputs } from '../src/outputWriter';

jest.mock('@actions/core');

describe('writeOutputs', () => {
  it('maps a full result to outputs', () => {
    const result: SyncBranchesResult = {
      action: 'pull-request',
      synced: false,
      dryRun: false,
      aheadBy: 3,
      behindBy: 2,
      pullRequestNumber: 42,
      pullRequestUrl: 'https://example.test/pull/42',
      reason: 'merge-conflict',
    };

    writeOutputs(result);

    const setOutput = jest.mocked(core.setOutput);
    expect(setOutput).toHaveBeenCalledWith('action', 'pull-request');
    expect(setOutput).toHaveBeenCalledWith('pull-request-number', '42');
    expect(setOutput).toHaveBeenCalledWith('pull-request-url', 'https://example.test/pull/42');
    expect(setOutput).toHaveBeenCalledWith('ahead-by', '3');
    expect(setOutput).toHaveBeenCalledWith('reason', 'merge-conflict');
  });

  it('emits empty strings for absent optional fields', () => {
    const result: SyncBranchesResult = {
      action: 'fast-forward',
      synced: true,
      dryRun: false,
      aheadBy: 1,
      behindBy: 0,
      resultSha: 'sha-1',
      reason: 'fast-forward',
    };

    writeOutputs(result);

    const setOutput = jest.mocked(core.setOutput);
    expect(setOutput).toHaveBeenCalledWith('result-sha', 'sha-1');
    expect(setOutput).toHaveBeenCalledWith('pull-request-number', '');
    expect(setOutput).toHaveBeenCalledWith('pull-request-url', '');
    expect(setOutput).toHaveBeenCalledWith('synced', 'true');
  });
});
