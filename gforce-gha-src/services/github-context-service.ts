/**
 * GitHub Actions runner context: the only place the runner's environment
 * variables are read. Parsing/validation stays in the pure
 * {@link parseRepoRef} util.
 */
import type { RepoRef } from '../types';
import { parseRepoRef } from '../utils/parse-repo-ref';

export class GithubContextService {
  private static instance: GithubContextService;

  private constructor() {}

  public static getInstance(): GithubContextService {
    if (!GithubContextService.instance) {
      GithubContextService.instance = new GithubContextService();
    }
    return GithubContextService.instance;
  }

  /** Resolve `owner/repo` from the `GITHUB_REPOSITORY` env var the runner sets. */
  public getRepo(): RepoRef {
    return parseRepoRef(process.env.GITHUB_REPOSITORY ?? '');
  }

  public static resetInstance(): void {
    GithubContextService.instance = undefined as unknown as GithubContextService;
  }
}
