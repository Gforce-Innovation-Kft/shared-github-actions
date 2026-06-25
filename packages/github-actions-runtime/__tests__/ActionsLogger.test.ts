import * as core from '@actions/core';
import { ActionsLogger } from '../src/ActionsLogger';

jest.mock('@actions/core');

describe('ActionsLogger', () => {
  it('delegates each level to @actions/core', () => {
    const logger = new ActionsLogger();
    logger.debug('d');
    logger.info('i');
    logger.warning('w');
    logger.error('e');

    expect(jest.mocked(core.debug)).toHaveBeenCalledWith('d');
    expect(jest.mocked(core.info)).toHaveBeenCalledWith('i');
    expect(jest.mocked(core.warning)).toHaveBeenCalledWith('w');
    expect(jest.mocked(core.error)).toHaveBeenCalledWith('e');
  });
});
