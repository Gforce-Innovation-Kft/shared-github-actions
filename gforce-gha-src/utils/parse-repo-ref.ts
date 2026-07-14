/**
 * Pure helper to parse an `owner/repo` slug into a {@link RepoRef}. Kept free
 * of any environment access; {@link GithubContextService} reads the raw string
 * from `GITHUB_REPOSITORY` and hands it here.
 */
import type { RepoRef } from '../types';
import { ValidationError } from './errors';

/** Parse `"owner/repo"` into a {@link RepoRef}, throwing on malformed input. */
export function parseRepoRef(value: string): RepoRef {
  const [owner, repo, ...rest] = value.trim().split('/');
  if (!owner || !repo || rest.length > 0) {
    throw new ValidationError(
      `Expected a repository in "owner/repo" format but received "${value}"`,
    );
  }
  return { owner, repo };
}
