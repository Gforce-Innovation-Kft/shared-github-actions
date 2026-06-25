/**
 * Tiny helpers shared by the Octokit-backed domain services: uniform error
 * wrapping so every wrapper reports failures as {@link GitHubApiError}.
 */
import { GitHubApiError } from '../../utils/errors/errors';

/** Wrap an unknown thrown value into a {@link GitHubApiError} for `operation`. */
export function toGitHubApiError(error: unknown, operation: string): GitHubApiError {
  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);
  return new GitHubApiError(`Failed to ${operation}: ${message}`, status);
}

/** Run an Octokit call, rethrowing any failure as a {@link GitHubApiError}. */
export async function runOctokit<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toGitHubApiError(error, operation);
  }
}
