import { parseRepoRef, type RepoRef } from '@gforce/core';

/**
 * Resolve `owner/repo` from the standard `GITHUB_REPOSITORY` env var the runner
 * sets. The actual parsing/validation lives in the portable
 * {@link parseRepoRef}; this only supplies the environment value.
 */
export function readRepoFromEnvironment(): RepoRef {
  return parseRepoRef(process.env.GITHUB_REPOSITORY ?? '');
}
