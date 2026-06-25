/**
 * Owns the single authenticated `Octokit`. This is the ONE place a concrete
 * client is constructed, so a single rate-limit budget backs every per-domain
 * service that wraps it.
 *
 * Lifecycle mirrors the services: {@link GitHubClient.getInstance} returns a
 * process-wide cached client (throwing on a token mismatch),
 * {@link GitHubClient.newInstance} builds an isolated one, and
 * {@link GitHubClient.resetInstance} clears the cache (test-only).
 */
import { Octokit } from '@octokit/rest';
import { ValidationError } from '../../utils/errors/errors';

export class GitHubClient {
  private static shared: GitHubClient | undefined;
  private static sharedToken: string | undefined;

  constructor(readonly octokit: Octokit) {}

  /** Process-wide shared client; a later call with a different token throws. */
  static getInstance(token: string): GitHubClient {
    if (GitHubClient.shared) {
      if (GitHubClient.sharedToken !== token) {
        throw new ValidationError(
          'A shared GitHub client already exists for a different token. ' +
            'Call GitHubClient.resetInstance() first, or use a *.newInstance() for an isolated client.',
        );
      }
      return GitHubClient.shared;
    }
    GitHubClient.sharedToken = token;
    GitHubClient.shared = GitHubClient.newInstance(token);
    return GitHubClient.shared;
  }

  /** Build a brand-new, isolated client. Never cached. */
  static newInstance(token: string): GitHubClient {
    return new GitHubClient(new Octokit({ auth: token }));
  }

  /** Drop the cached shared client so the next get rebuilds it. Test-only. */
  static resetInstance(): void {
    GitHubClient.shared = undefined;
    GitHubClient.sharedToken = undefined;
  }
}
