/**
 * Shared helpers for the GitHub sub-clients — NOT a singleton. Owns Octokit
 * construction (one cached instance so a single rate-limit budget backs every
 * sub-client) and the uniform error mapping to {@link GitHubApiError}.
 */
import { Octokit } from '@octokit/rest';
import { GitHubApiError, ValidationError } from '../../../utils/errors';

export type OctokitType = Octokit;

let sharedOctokit: Octokit | undefined;
let sharedToken: string | undefined;

/** Build a brand-new, isolated Octokit. Never cached. */
export function createOctokit(token: string): OctokitType {
  return new Octokit({ auth: token });
}

/** Process-wide shared Octokit; a later call with a different token throws. */
export function getSharedOctokit(token: string): OctokitType {
  if (sharedOctokit) {
    if (sharedToken !== token) {
      throw new ValidationError(
        'A shared Octokit already exists for a different token. ' +
          'Call resetSharedOctokit() first, or use a *.newInstance() for an isolated client.',
      );
    }
    return sharedOctokit;
  }
  sharedToken = token;
  sharedOctokit = createOctokit(token);
  return sharedOctokit;
}

/** Drop the cached shared Octokit so the next get rebuilds it. Test-only. */
export function resetSharedOctokit(): void {
  sharedOctokit = undefined;
  sharedToken = undefined;
}

/** Extract an HTTP status from an unknown thrown value, when present. */
export function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const { status } = error;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

/** Wrap an unknown thrown value into a {@link GitHubApiError} for `operation`. */
export function toGitHubApiError(error: unknown, operation: string): GitHubApiError {
  const message = error instanceof Error ? error.message : String(error);
  return new GitHubApiError(`Failed to ${operation}: ${message}`, getErrorStatus(error));
}

/** Run an Octokit call, rethrowing any failure as a {@link GitHubApiError}. */
export async function runOctokit<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toGitHubApiError(error, operation);
  }
}
