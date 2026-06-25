import { runGitHubAction } from '@gforce/github-actions-runtime';
import { runSyncBranchesAction, validateSyncBranchesInputs } from '@gforce/core';
import { run, syncBranchesAction } from '../src/index';
import { readInputs } from '../src/inputReader';
import { writeOutputs } from '../src/outputWriter';

jest.mock('@gforce/github-actions-runtime');

describe('sync-branches main', () => {
  afterEach(() => jest.clearAllMocks());

  it('wires the action from shared, portable pieces', () => {
    expect(syncBranchesAction).toEqual({
      readInputs,
      validateInputs: validateSyncBranchesInputs,
      execute: runSyncBranchesAction,
      writeOutputs,
    });
  });

  it('runs the action through the shared runner', async () => {
    await run();
    expect(jest.mocked(runGitHubAction)).toHaveBeenCalledWith(syncBranchesAction, undefined);
  });

  it('forwards context overrides to the runner', async () => {
    const overrides = { repo: { owner: 'o', repo: 'r' } };
    await run(overrides);
    expect(jest.mocked(runGitHubAction)).toHaveBeenCalledWith(syncBranchesAction, overrides);
  });
});
