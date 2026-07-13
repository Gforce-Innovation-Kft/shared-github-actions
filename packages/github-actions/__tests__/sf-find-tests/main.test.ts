import { runFindTestsAction, validateFindTestsInputs } from '@gforce/core';
import { runGitHubAction } from '@gforce/github-actions-runtime';
import { sfFindTestsAction, run } from '../../src/sf-find-tests/index';
import { readInputs } from '../../src/sf-find-tests/inputReader';
import { writeOutputs } from '../../src/sf-find-tests/outputWriter';

jest.mock('@gforce/github-actions-runtime', () => ({
  ...jest.requireActual('@gforce/github-actions-runtime'),
  runGitHubAction: jest.fn().mockResolvedValue(undefined),
}));

describe('sf-find-tests action definition', () => {
  it('wires the shared pieces', () => {
    expect(sfFindTestsAction.readInputs).toBe(readInputs);
    expect(sfFindTestsAction.validateInputs).toBe(validateFindTestsInputs);
    expect(sfFindTestsAction.execute).toBe(runFindTestsAction);
    expect(sfFindTestsAction.writeOutputs).toBe(writeOutputs);
  });

  it('run() delegates to runGitHubAction', async () => {
    await run();
    expect(runGitHubAction).toHaveBeenCalledWith(sfFindTestsAction, undefined);
  });
});
