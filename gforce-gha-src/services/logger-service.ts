/**
 * The ONE sanctioned wrapper around `@actions/core` logging. Orchestrators and
 * services log through this singleton; clients never log (layer rule).
 */
import * as core from '@actions/core';

export class LoggerService {
  private static instance: LoggerService;

  private constructor() {}

  public static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  public debug(message: string): void {
    core.debug(message);
  }

  public info(message: string): void {
    core.info(message);
  }

  public warning(message: string): void {
    core.warning(message);
  }

  public error(message: string): void {
    core.error(message);
  }

  /** Mask a secret in all subsequent log output. */
  public setSecret(secret: string): void {
    core.setSecret(secret);
  }

  public static resetInstance(): void {
    LoggerService.instance = undefined as unknown as LoggerService;
  }
}
