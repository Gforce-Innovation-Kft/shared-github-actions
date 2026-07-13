import { runGitHubAction } from '@gforce/github-actions-runtime';
import { runCreateReleasePrAction, validateCreateReleasePrInputs } from '@gforce/core';
import { run, createReleasePrAction } from '../../src/create-release-pr/index';
import { readInputs } from '../../src/create-release-pr/inputReader';
import { writeOutputs } from '../../src/create-release-pr/outputWriter';

jest.mock('@gforce/github-actions-runtime');

describe('create-release-pr main', () => {
  afterEach(() => jest.clearAllMocks());

  it('wires the action from shared, portable pieces', () => {
    expect(createReleasePrAction).toEqual({
      readInputs,
      validateInputs: validateCreateReleasePrInputs,
      execute: runCreateReleasePrAction,
      writeOutputs,
    });
  });

  it('runs the action through the shared runner', async () => {
    await run();
    expect(jest.mocked(runGitHubAction)).toHaveBeenCalledWith(createReleasePrAction, undefined);
  });

  it('forwards context overrides to the runner', async () => {
    const overrides = { repo: { owner: 'o', repo: 'r' } };
    await run(overrides);
    expect(jest.mocked(runGitHubAction)).toHaveBeenCalledWith(createReleasePrAction, overrides);
  });
});
