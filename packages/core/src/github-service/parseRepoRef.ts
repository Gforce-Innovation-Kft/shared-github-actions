/**
 * Pure helper to parse a `owner/repo` slug into a {@link RepoRef}. Kept free of
 * any runtime/environment access so it stays portable; adapters read the raw
 * string from their environment (e.g. `process.env.GITHUB_REPOSITORY`) and hand
 * it here.
 */
import { ValidationError } from '../utils/errors/errors';
import type { RepoRef } from './types';

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
