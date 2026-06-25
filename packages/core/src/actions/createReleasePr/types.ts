/** Types for the portable create-release-pr use case. */
import type { GitHubService } from '../../github-service/githubService';
import type { RepoRef } from '../../github-service/types';
import type { Logger } from '../../utils/logging/logger';

export interface CreateReleasePrRequest {
  readonly repo: RepoRef;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly releaseVersion: string;
  readonly title?: string;
  readonly bodyTemplate?: string;
  readonly draft: boolean;
  readonly labels: readonly string[];
  readonly reviewers: readonly string[];
  readonly dryRun: boolean;
}

export interface CreateReleasePrResult {
  readonly created: boolean;
  readonly updated: boolean;
  readonly dryRun: boolean;
  readonly pullRequestNumber?: number;
  readonly pullRequestUrl?: string;
  readonly title: string;
  readonly body: string;
}

export interface CreateReleasePrDeps {
  readonly github: GitHubService;
  readonly logger: Logger;
}

/** Raw, unvalidated inputs as read from the GitHub Action runtime. */
export interface RawReleasePrInputs {
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly releaseVersion: string;
  readonly title: string;
  readonly bodyTemplate: string;
  readonly draft: string;
  readonly labels: string;
  readonly reviewers: string;
  readonly dryRun: string;
  readonly githubToken: string;
}

/** Normalized, validated inputs ready to build an orchestration request. */
export interface ValidatedReleasePrInputs {
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly releaseVersion: string;
  readonly title?: string;
  readonly bodyTemplate?: string;
  readonly draft: boolean;
  readonly labels: string[];
  readonly reviewers: string[];
  readonly dryRun: boolean;
  readonly githubToken: string;
}
