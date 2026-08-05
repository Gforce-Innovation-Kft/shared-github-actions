/**
 * Pull-request slice of the GitHub REST API — one thin wrapper method per
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
  getSharedOctokit,
  runOctokit,
  type OctokitType,
} from '../core/github-client-core';
import type {
  CreatePullRequestParams,
  ListPullRequestsParams,
  PullRequestSummary,
  UpdatePullRequestParams,
} from './types';

interface OctokitPullLike {
  readonly number: number;
  readonly html_url: string;
  readonly title: string;
  readonly state: string;
  readonly draft?: boolean;
  readonly head: { readonly ref: string };
  readonly base: { readonly ref: string };
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

export class GitHubPullRequestsClient {
  private static instance: GitHubPullRequestsClient | undefined;
  private static instanceToken: string | undefined;

  constructor(private readonly octokit: OctokitType) {}

  /** Shared instance over the shared Octokit; throws on token mismatch. */
  public static getInstance(token: string): GitHubPullRequestsClient {
    if (GitHubPullRequestsClient.instance) {
      if (GitHubPullRequestsClient.instanceToken !== token) {
        throw new ValidationError(
          'A shared pull requests client already exists for a different token. ' +
            'Call GitHubPullRequestsClient.resetInstance() first, or use GitHubPullRequestsClient.newInstance() for an isolated client.',
        );
      }
      return GitHubPullRequestsClient.instance;
    }
    GitHubPullRequestsClient.instanceToken = token;
    GitHubPullRequestsClient.instance = new GitHubPullRequestsClient(getSharedOctokit(token));
    return GitHubPullRequestsClient.instance;
  }

  /** Build an isolated client over a fresh Octokit. Never cached. */
  public static newInstance(token: string): GitHubPullRequestsClient {
    return new GitHubPullRequestsClient(createOctokit(token));
  }

  /** Drop the cached shared instance so the next get rebuilds it. Test-only. */
  public static resetInstance(): void {
    GitHubPullRequestsClient.instance = undefined;
    GitHubPullRequestsClient.instanceToken = undefined;
  }

  /** List open pull requests matching a head/base pair. */
  public listOpenPullRequests(
    repo: RepoRef,
    params: ListPullRequestsParams,
  ): Promise<readonly PullRequestSummary[]> {
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

  public createPullRequest(
    repo: RepoRef,
    params: CreatePullRequestParams,
  ): Promise<PullRequestSummary> {
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

  public updatePullRequest(
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

  public addLabels(repo: RepoRef, pullNumber: number, labels: readonly string[]): Promise<void> {
    return runOctokit('add labels', async () => {
      await this.octokit.rest.issues.addLabels({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: pullNumber,
        labels: [...labels],
      });
    });
  }

  public requestReviewers(
    repo: RepoRef,
    pullNumber: number,
    reviewers: readonly string[],
  ): Promise<void> {
    return runOctokit('request reviewers', async () => {
      await this.octokit.rest.pulls.requestReviewers({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: pullNumber,
        reviewers: [...reviewers],
      });
    });
  }
}
