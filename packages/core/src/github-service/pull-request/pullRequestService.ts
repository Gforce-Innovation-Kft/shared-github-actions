/**
 * Pull-request domain of the GitHub service: the {@link PullRequestService} port
 * and its single Octokit-backed implementation, colocated. Listing, creating,
 * and updating pull requests, plus applying labels and requesting reviewers.
 *
 * `@octokit/rest` is touched only by {@link OctokitPullRequestService};
 * orchestrators depend on the {@link PullRequestService} interface. The
 * constructor is injectable and the singleton statics share the one
 * {@link GitHubClient}.
 */
import type { Octokit } from '@octokit/rest';
import { ValidationError } from '../../utils/errors/errors';
import { GitHubClient } from '../client/gitHubClient';
import { runOctokit } from '../client/octokitSupport';
import type { RepoRef } from '../types';
import type {
  CreatePullRequestParams,
  ListPullRequestsParams,
  PullRequestSummary,
  UpdatePullRequestParams,
} from './types';

export interface PullRequestService {
  /** List open pull requests matching a head/base pair. */
  listOpenPullRequests(
    repo: RepoRef,
    params: ListPullRequestsParams,
  ): Promise<PullRequestSummary[]>;

  createPullRequest(repo: RepoRef, params: CreatePullRequestParams): Promise<PullRequestSummary>;

  updatePullRequest(
    repo: RepoRef,
    pullNumber: number,
    params: UpdatePullRequestParams,
  ): Promise<PullRequestSummary>;

  addLabels(repo: RepoRef, pullNumber: number, labels: string[]): Promise<void>;

  requestReviewers(repo: RepoRef, pullNumber: number, reviewers: string[]): Promise<void>;
}

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

export class OctokitPullRequestService implements PullRequestService {
  private static shared: PullRequestService | undefined;
  private static sharedToken: string | undefined;

  constructor(private readonly octokit: Octokit) {}

  /** Shared instance over the shared {@link GitHubClient}; throws on token mismatch. */
  static getInstance(token: string): PullRequestService {
    if (OctokitPullRequestService.shared) {
      if (OctokitPullRequestService.sharedToken !== token) {
        throw new ValidationError(
          'A shared pull request service already exists for a different token. ' +
            'Call OctokitPullRequestService.resetInstance() first, or use OctokitPullRequestService.newInstance() for an isolated client.',
        );
      }
      return OctokitPullRequestService.shared;
    }
    OctokitPullRequestService.sharedToken = token;
    OctokitPullRequestService.shared = new OctokitPullRequestService(
      GitHubClient.getInstance(token).octokit,
    );
    return OctokitPullRequestService.shared;
  }

  /** Build an isolated service over a fresh client. Never cached. */
  static newInstance(token: string): PullRequestService {
    return new OctokitPullRequestService(GitHubClient.newInstance(token).octokit);
  }

  /** Drop the cached shared instance so the next get rebuilds it. Test-only. */
  static resetInstance(): void {
    OctokitPullRequestService.shared = undefined;
    OctokitPullRequestService.sharedToken = undefined;
  }

  listOpenPullRequests(
    repo: RepoRef,
    params: ListPullRequestsParams,
  ): Promise<PullRequestSummary[]> {
    return runOctokit('list pull requests', async () => {
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
    return runOctokit('create pull request', async () => {
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
    return runOctokit('update pull request', async () => {
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
    return runOctokit('add labels', async () => {
      await this.octokit.rest.issues.addLabels({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: pullNumber,
        labels,
      });
    });
  }

  requestReviewers(repo: RepoRef, pullNumber: number, reviewers: string[]): Promise<void> {
    return runOctokit('request reviewers', async () => {
      await this.octokit.rest.pulls.requestReviewers({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: pullNumber,
        reviewers,
      });
    });
  }
}
