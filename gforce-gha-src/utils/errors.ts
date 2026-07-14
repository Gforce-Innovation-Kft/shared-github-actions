/**
 * Typed error hierarchy used across all layers. Validators throw
 * {@link ValidationError}, clients map API failures to {@link GitHubApiError},
 * and every entry point catches the hierarchy into `core.setFailed`.
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
