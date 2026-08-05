/**
 * Branch/ref slice of the GitHub REST API — one thin wrapper method per
 * endpoint, error mapping only. `@octokit/rest` is touched only by the
 * sub-clients; services go through the {@link GitHubClient} facade.
 *
 * The constructor is injectable (tests pass a fake Octokit); the singleton
 * statics share the one cached Octokit so a single rate-limit budget backs
 * every sub-client.
 */
import { ValidationError } from '../../../utils/errors';
import type { RepoRef } from '../../../types';
import {
  createOctokit,
  getErrorStatus,
  getSharedOctokit,
  runOctokit,
  toGitHubApiError,
  type OctokitType,
} from '../core/github-client-core';
import type { BranchComparison, MergeOutcome } from './types';

export class GitHubBranchesClient {
  private static instance: GitHubBranchesClient | undefined;
  private static instanceToken: string | undefined;

  constructor(private readonly octokit: OctokitType) {}

  /** Shared instance over the shared Octokit; throws on token mismatch. */
  public static getInstance(token: string): GitHubBranchesClient {
    if (GitHubBranchesClient.instance) {
      if (GitHubBranchesClient.instanceToken !== token) {
        throw new ValidationError(
          'A shared branches client already exists for a different token. ' +
            'Call GitHubBranchesClient.resetInstance() first, or use GitHubBranchesClient.newInstance() for an isolated client.',
        );
      }
      return GitHubBranchesClient.instance;
    }
    GitHubBranchesClient.instanceToken = token;
    GitHubBranchesClient.instance = new GitHubBranchesClient(getSharedOctokit(token));
    return GitHubBranchesClient.instance;
  }

  /** Build an isolated client over a fresh Octokit. Never cached. */
  public static newInstance(token: string): GitHubBranchesClient {
    return new GitHubBranchesClient(createOctokit(token));
  }

  /** Drop the cached shared instance so the next get rebuilds it. Test-only. */
  public static resetInstance(): void {
    GitHubBranchesClient.instance = undefined;
    GitHubBranchesClient.instanceToken = undefined;
  }

  /** Compare two refs (`base...head`) and report ahead/behind counts + diff. */
  public compareBranches(repo: RepoRef, base: string, head: string): Promise<BranchComparison> {
    return runOctokit('compare branches', async () => {
      const { data } = await this.octokit.rest.repos.compareCommitsWithBasehead({
        owner: repo.owner,
        repo: repo.repo,
        basehead: `${base}...${head}`,
      });
      return {
        status: data.status,
        aheadBy: data.ahead_by,
        behindBy: data.behind_by,
        totalCommits: data.total_commits,
        commits: data.commits.map((commit) => ({
          sha: commit.sha,
          message: commit.commit.message,
          author: commit.author?.login ?? commit.commit.author?.name,
        })),
        files: (data.files ?? []).map((file) => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
        })),
      };
    });
  }

  /** Resolve the current head commit SHA of a branch. */
  public getBranchHeadSha(repo: RepoRef, branch: string): Promise<string> {
    return runOctokit('resolve branch head', async () => {
      const { data } = await this.octokit.rest.repos.getBranch({
        owner: repo.owner,
        repo: repo.repo,
        branch,
      });
      return data.commit.sha;
    });
  }

  /** Move a branch ref to `sha`. Without `force`, only fast-forwards succeed. */
  public updateBranchRef(repo: RepoRef, branch: string, sha: string, force = false): Promise<void> {
    return runOctokit('update branch ref', async () => {
      await this.octokit.rest.git.updateRef({
        owner: repo.owner,
        repo: repo.repo,
        ref: `heads/${branch}`,
        sha,
        force,
      });
    });
  }

  /** Server-side merge of `head` into `base`. Conflicts resolve to a typed outcome. */
  public async mergeBranches(
    repo: RepoRef,
    base: string,
    head: string,
    commitMessage?: string,
  ): Promise<MergeOutcome> {
    try {
      const response = await this.octokit.rest.repos.merge({
        owner: repo.owner,
        repo: repo.repo,
        base,
        head,
        commit_message: commitMessage,
      });
      if (response.status === 201) {
        return { status: 'merged', sha: response.data.sha };
      }
      // 204 No Content => base already contains head; nothing to merge.
      return { status: 'nothing' };
    } catch (error) {
      if (getErrorStatus(error) === 409) {
        return { status: 'conflict' };
      }
      throw toGitHubApiError(error, 'merge branches');
    }
  }
}
