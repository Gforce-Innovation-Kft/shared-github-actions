/**
 * Logging port. The portable core must not depend on `@actions/core`, so it
 * logs through this interface. Action adapters provide a concrete logger that
 * delegates to the GitHub Actions toolkit; tests use {@link NoopLogger}.
 */
export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

/** A logger that discards everything. Useful as a default and in tests. */
export const NoopLogger: Logger = {
  debug(): void {},
  info(): void {},
  warning(): void {},
  error(): void {},
};
