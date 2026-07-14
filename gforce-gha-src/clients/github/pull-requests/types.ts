/** Pull-request value objects and request shapes for {@link GitHubPullRequestsClient}. */

export interface PullRequestSummary {
  readonly number: number;
  readonly htmlUrl: string;
  readonly title: string;
  readonly state: string;
  readonly draft: boolean;
  readonly headRef: string;
  readonly baseRef: string;
}

export interface ListPullRequestsParams {
  /** Source branch (the PR head). */
  readonly head: string;
  /** Target branch (the PR base). */
  readonly base: string;
}

export interface CreatePullRequestParams {
  readonly head: string;
  readonly base: string;
  readonly title: string;
  readonly body: string;
  readonly draft?: boolean;
}

export interface UpdatePullRequestParams {
  readonly title?: string;
  readonly body?: string;
}
