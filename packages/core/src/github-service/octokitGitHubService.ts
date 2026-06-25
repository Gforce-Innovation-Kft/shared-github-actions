/**
 * The single concrete {@link GitHubService}. This is the ONLY module in the
 * codebase that talks to `@octokit/rest`; every other layer depends on the
 * interface.
 *
 * It also owns the singleton lifecycle for the service via static
 * {@link OctokitGitHubService.getInstance} / {@link OctokitGitHubService.newInstance}
 * / {@link OctokitGitHubService.resetInstance}, so a single authenticated client
 * — and its shared rate-limit budget — backs every API call across the use
 * cases. The constructor stays injectable so tests can pass a fake `Octokit`.
 */
import { Octokit } from '@octokit/rest';
import { GitHubApiError, ValidationError } from '../utils/errors/errors';
import type { ChangeStatus } from './commit/types';
import type { CompareResult, MergeOutcome } from './branch/types';
import type {
  CreatePullRequestParams,
  ListPullRequestsParams,
  PullRequestSummary,
  UpdatePullRequestParams,
} from './pull-request/types';
import type { GitHubService } from './githubService';
import type { RepoRef } from './types';

interface OctokitPullLike {
  number: number;
  html_url: string;
  title: string;
  state: string;
  draft?: boolean;
  head: { ref: string };
  base: { ref: string };
}

function toPullRequestSummary(pr: OctokitPullLike): PullRequestSummary {
  return {
    number: pr.number,
    htmlUrl: pr.html_url,
    title: pr.title,
    state: pr.state,
    draft: pr.draft ?? false,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
  };
}

function toGitHubApiError(error: unknown, operation: string): GitHubApiError {
  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);
  return new GitHubApiError(`Failed to ${operation}: ${message}`, status);
}

export class OctokitGitHubService implements GitHubService {
  private static shared: GitHubService | undefined;
  private static sharedToken: string | undefined;

  constructor(private readonly octokit: Octokit) {}

  /**
   * Return the process-wide shared instance, building it on first use. A later
   * call with a different token throws to avoid silently issuing API calls under
   * the wrong identity — call {@link OctokitGitHubService.resetInstance} first,
   * or {@link OctokitGitHubService.newInstance} for an isolated client.
   */
  static getInstance(token: string): GitHubService {
    if (OctokitGitHubService.shared) {
      if (OctokitGitHubService.sharedToken !== token) {
        throw new ValidationError(
          'A shared GitHub service already exists for a different token. ' +
            'Call OctokitGitHubService.resetInstance() first, or use OctokitGitHubService.newInstance() for an isolated client.',
        );
      }
      return OctokitGitHubService.shared;
    }
    OctokitGitHubService.sharedToken = token;
    OctokitGitHubService.shared = OctokitGitHubService.newInstance(token);
    return OctokitGitHubService.shared;
  }

  /** Build a brand-new, isolated service. Never cached. */
  static newInstance(token: string): GitHubService {
    return new OctokitGitHubService(new Octokit({ auth: token }));
  }

  /** Drop the cached shared instance so the next get rebuilds it. Test-only. */
  static resetInstance(): void {
    OctokitGitHubService.shared = undefined;
    OctokitGitHubService.sharedToken = undefined;
  }

  private async run<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw toGitHubApiError(error, operation);
    }
  }

  compareBranches(repo: RepoRef, base: string, head: string): Promise<CompareResult> {
    return this.run('compare branches', async () => {
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
    return this.run('resolve branch head', async () => {
      const { data } = await this.octokit.rest.repos.getBranch({
        owner: repo.owner,
        repo: repo.repo,
        branch,
      });
      return data.commit.sha;
    });
  }

  updateBranchRef(repo: RepoRef, branch: string, sha: string, force = false): Promise<void> {
    return this.run('update branch ref', async () => {
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

  listOpenPullRequests(
    repo: RepoRef,
    params: ListPullRequestsParams,
  ): Promise<PullRequestSummary[]> {
    return this.run('list pull requests', async () => {
      const { data } = await this.octokit.rest.pulls.list({
        owner: repo.owner,
        repo: repo.repo,
        state: 'open',
        head: `${repo.owner}:${params.head}`,
        base: params.base,
      });
      return data.map(toPullRequestSummary);
    });
  }

  createPullRequest(repo: RepoRef, params: CreatePullRequestParams): Promise<PullRequestSummary> {
    return this.run('create pull request', async () => {
      const { data } = await this.octokit.rest.pulls.create({
        owner: repo.owner,
        repo: repo.repo,
        head: params.head,
        base: params.base,
        title: params.title,
        body: params.body,
        draft: params.draft ?? false,
      });
      return toPullRequestSummary(data);
    });
  }

  updatePullRequest(
    repo: RepoRef,
    pullNumber: number,
    params: UpdatePullRequestParams,
  ): Promise<PullRequestSummary> {
    return this.run('update pull request', async () => {
      const { data } = await this.octokit.rest.pulls.update({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: pullNumber,
        title: params.title,
        body: params.body,
      });
      return toPullRequestSummary(data);
    });
  }

  addLabels(repo: RepoRef, pullNumber: number, labels: string[]): Promise<void> {
    return this.run('add labels', async () => {
      await this.octokit.rest.issues.addLabels({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: pullNumber,
        labels,
      });
    });
  }

  requestReviewers(repo: RepoRef, pullNumber: number, reviewers: string[]): Promise<void> {
    return this.run('request reviewers', async () => {
      await this.octokit.rest.pulls.requestReviewers({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: pullNumber,
        reviewers,
      });
    });
  }
}
