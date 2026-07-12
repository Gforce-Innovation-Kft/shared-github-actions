import * as core from '@actions/core';
import { writeOutputs } from '../src/outputWriter';

describe('writeOutputs', () => {
  it('maps the result onto kebab-case outputs', () => {
    const setOutput = jest.spyOn(core, 'setOutput').mockImplementation(() => undefined);
    jest.spyOn(core, 'info').mockImplementation(() => undefined);

    writeOutputs({
      tests: ['ATest', 'BTest'],
      testCount: 2,
      hasApex: true,
      changedApexNames: ['A', 'B'],
    });

    expect(setOutput).toHaveBeenCalledWith('tests', 'ATest BTest');
    expect(setOutput).toHaveBeenCalledWith('test-count', '2');
    expect(setOutput).toHaveBeenCalledWith('has-apex', 'true');
    jest.restoreAllMocks();
  });
});
