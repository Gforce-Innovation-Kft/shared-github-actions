import * as core from '@actions/core';
import type { Logger } from '@gforce/core';

/** Adapts the portable {@link Logger} port onto the GitHub Actions toolkit. */
export class ActionsLogger implements Logger {
  debug(message: string): void {
    core.debug(message);
  }

  info(message: string): void {
    core.info(message);
  }

  warning(message: string): void {
    core.warning(message);
  }

  error(message: string): void {
    core.error(message);
  }
}
