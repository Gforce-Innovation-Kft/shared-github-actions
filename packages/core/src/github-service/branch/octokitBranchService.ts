/**
 * The Octokit-backed {@link BranchService}. Talks to `@octokit/rest` only for
 * branch operations; the constructor is injectable (tests pass a fake `Octokit`)
 * and the singleton statics share the one {@link GitHubClient} so a single
 * authenticated client backs every call.
 */
import type { Octokit } from '@octokit/rest';
import { ValidationError } from '../../utils/errors/errors';
import { GitHubClient } from '../client/gitHubClient';
import { runOctokit, toGitHubApiError } from '../client/octokitSupport';
import type { ChangeStatus } from '../commit/types';
import type { RepoRef } from '../types';
import type { BranchService } from './branchService';
import type { CompareResult, MergeOutcome } from './types';

export class OctokitBranchService implements BranchService {
  private static shared: BranchService | undefined;
  private static sharedToken: string | undefined;

  constructor(private readonly octokit: Octokit) {}

  /** Shared instance over the shared {@link GitHubClient}; throws on token mismatch. */
  static getInstance(token: string): BranchService {
    if (OctokitBranchService.shared) {
      if (OctokitBranchService.sharedToken !== token) {
        throw new ValidationError(
          'A shared branch service already exists for a different token. ' +
            'Call OctokitBranchService.resetInstance() first, or use OctokitBranchService.newInstance() for an isolated client.',
        );
      }
      return OctokitBranchService.shared;
    }
    OctokitBranchService.sharedToken = token;
    OctokitBranchService.shared = new OctokitBranchService(GitHubClient.getInstance(token).octokit);
    return OctokitBranchService.shared;
  }

  /** Build an isolated service over a fresh client. Never cached. */
  static newInstance(token: string): BranchService {
    return new OctokitBranchService(GitHubClient.newInstance(token).octokit);
  }

  /** Drop the cached shared instance so the next get rebuilds it. Test-only. */
  static resetInstance(): void {
    OctokitBranchService.shared = undefined;
    OctokitBranchService.sharedToken = undefined;
  }

  compareBranches(repo: RepoRef, base: string, head: string): Promise<CompareResult> {
    return runOctokit('compare branches', async () => {
      const { data } = await this.octokit.rest.repos.compareCommitsWithBasehead({
        owner: repo.owner,
        repo: repo.repo,
        basehead: `${base}...${head}`,
      });
      return {
        status: data.status as CompareResult['status'],
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
          status: file.status as ChangeStatus,
          additions: file.additions,
          deletions: file.deletions,
        })),
      };
    });
  }

  getBranchHeadSha(repo: RepoRef, branch: string): Promise<string> {
    return runOctokit('resolve branch head', async () => {
      const { data } = await this.octokit.rest.repos.getBranch({
        owner: repo.owner,
        repo: repo.repo,
        branch,
      });
      return data.commit.sha;
    });
  }

  updateBranchRef(repo: RepoRef, branch: string, sha: string, force = false): Promise<void> {
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

  async mergeBranches(
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
      if ((error as { status?: number }).status === 409) {
        return { status: 'conflict' };
      }
      throw toGitHubApiError(error, 'merge branches');
    }
  }
}
