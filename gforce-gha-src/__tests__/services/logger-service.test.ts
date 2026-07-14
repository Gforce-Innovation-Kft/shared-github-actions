import * as core from '@actions/core';

import { LoggerService } from '../../services/logger-service';

afterEach(() => {
  LoggerService.resetInstance();
  jest.restoreAllMocks();
});

describe('LoggerService', () => {
  test('getInstance_calledTwice_returnsSameInstance', () => {
    // Given
    const first = LoggerService.getInstance();

    // When
    const second = LoggerService.getInstance();

    // Then
    expect(second).toBe(first);
  });

  test('getInstance_afterReset_returnsFreshInstance', () => {
    // Given
    const first = LoggerService.getInstance();
    LoggerService.resetInstance();

    // When
    const second = LoggerService.getInstance();

    // Then
    expect(second).not.toBe(first);
  });

  test('debug_message_delegatesToActionsCore', () => {
    // Given
    const spy = jest.spyOn(core, 'debug').mockImplementation(() => {});

    // When
    LoggerService.getInstance().debug('debug message');

    // Then
    expect(spy).toHaveBeenCalledWith('debug message');
  });

  test('info_message_delegatesToActionsCore', () => {
    // Given
    const spy = jest.spyOn(core, 'info').mockImplementation(() => {});

    // When
    LoggerService.getInstance().info('info message');

    // Then
    expect(spy).toHaveBeenCalledWith('info message');
  });

  test('warning_message_delegatesToActionsCore', () => {
    // Given
    const spy = jest.spyOn(core, 'warning').mockImplementation(() => {});

    // When
    LoggerService.getInstance().warning('warning message');

    // Then
    expect(spy).toHaveBeenCalledWith('warning message');
  });

  test('error_message_delegatesToActionsCore', () => {
    // Given
    const spy = jest.spyOn(core, 'error').mockImplementation(() => {});

    // When
    LoggerService.getInstance().error('error message');

    // Then
    expect(spy).toHaveBeenCalledWith('error message');
  });

  test('setSecret_secret_delegatesToActionsCore', () => {
    // Given
    const spy = jest.spyOn(core, 'setSecret').mockImplementation(() => {});

    // When
    LoggerService.getInstance().setSecret('hunter2');

    // Then
    expect(spy).toHaveBeenCalledWith('hunter2');
  });
});
