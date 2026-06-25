/**
 * Typed error hierarchy used throughout the portable core. Keeping these here
 * (rather than throwing bare `Error`s) lets adapters and tests discriminate
 * between validation problems and downstream API failures.
 */
export class AppError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'APP_ERROR') {
    super(message);
    this.name = new.target.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Raised when input cannot be validated or normalized. */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}

/** Raised when a GitHub API call fails in an unexpected way. */
export class GitHubApiError extends AppError {
  public readonly status?: number;

  constructor(message: string, status?: number) {
    super(message, 'GITHUB_API_ERROR');
    this.status = status;
  }
}

/** Narrow an unknown thrown value into an {@link AppError}. */
export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof Error) {
    return new AppError(error.message);
  }
  return new AppError(String(error));
}
