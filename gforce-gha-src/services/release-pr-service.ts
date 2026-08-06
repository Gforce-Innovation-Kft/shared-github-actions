/**
 * The github-release-pr-create business workflow:
 *
 *   1. Compare source -> target to gather commits and changed files.
 *   2. Look for an existing open release PR for the same head/base.
 *   3. dry-run: report the computed title/body and any existing PR, mutate nothing.
 *   4. Otherwise update the existing PR, or create a new one, then apply labels
 *      and request reviewers when configured.
 */
import { GitHubClient } from '../clients/github/github-client';
import type { BranchComparison } from '../clients/github/repos/types';
import type { CreateReleasePrRequest, CreateReleasePrResult } from '../types';
import { LoggerService } from './logger-service';

const DEFAULT_BODY_TEMPLATE = [
  '## Release {{version}}',
  '',
  'Merging `{{source}}` into `{{target}}`.',
  '',
  '### Commits',
  '{{commits}}',
  '',
  '### Changed files',
  '{{files}}',
  '',
].join('\n');

function firstLine(message: string): string {
  const newlineIndex = message.indexOf('\n');
  return newlineIndex === -1 ? message : message.slice(0, newlineIndex);
}

export class ReleasePrService {
  private static instance: ReleasePrService;

  private constructor() {}

  public static getInstance(): ReleasePrService {
    if (!ReleasePrService.instance) {
      ReleasePrService.instance = new ReleasePrService();
    }
    return ReleasePrService.instance;
  }

  private get logger(): LoggerService {
    return LoggerService.getInstance();
  }

  /** Render a PR body from a template, substituting commit/file/version tokens. */
  public renderBody(request: CreateReleasePrRequest, comparison: BranchComparison): string {
    const commitsMarkdown =
      comparison.commits.length > 0
        ? comparison.commits
            .map((commit) => `- ${commit.sha.slice(0, 7)} ${firstLine(commit.message)}`)
            .join('\n')
        : '_No commits._';

    const filesMarkdown =
      comparison.files.length > 0
        ? comparison.files.map((file) => `- \`${file.status}\` ${file.filename}`).join('\n')
        : '_No file changes._';

    const template = request.bodyTemplate?.trim() ? request.bodyTemplate : DEFAULT_BODY_TEMPLATE;

    return template
      .replaceAll('{{version}}', request.releaseVersion)
      .replaceAll('{{source}}', request.sourceBranch)
      .replaceAll('{{target}}', request.targetBranch)
      .replaceAll('{{commits}}', commitsMarkdown)
      .replaceAll('{{files}}', filesMarkdown);
  }

  public async createOrUpdate(request: CreateReleasePrRequest): Promise<CreateReleasePrResult> {
    const { repo, sourceBranch, targetBranch, githubToken } = request;
    const github = GitHubClient.getInstance(githubToken);

    const comparison = await github.compareBranches(repo, targetBranch, sourceBranch);
    const title = request.title?.trim()
      ? request.title.trim()
      : `Release ${request.releaseVersion}`;
    const body = this.renderBody(request, comparison);

    const openPullRequests = await github.listOpenPullRequests(repo, {
      head: sourceBranch,
      base: targetBranch,
    });
    const existing = openPullRequests[0];

    if (request.dryRun) {
      this.logger.info(
        existing
          ? `Dry run: would update release PR #${existing.number}.`
          : `Dry run: would create a release PR from ${sourceBranch} into ${targetBranch}.`,
      );
      return {
        created: false,
        updated: false,
        dryRun: true,
        pullRequestNumber: existing?.number,
        pullRequestUrl: existing?.htmlUrl,
        title,
        body,
      };
    }

    if (existing) {
      const updated = await github.updatePullRequest(repo, existing.number, { title, body });
      await this.applyLabelsAndReviewers(github, request, existing.number);
      this.logger.info(`Updated release PR #${updated.number}.`);
      return {
        created: false,
        updated: true,
        dryRun: false,
        pullRequestNumber: updated.number,
        pullRequestUrl: updated.htmlUrl,
        title,
        body,
      };
    }

    const created = await github.createPullRequest(repo, {
      head: sourceBranch,
      base: targetBranch,
      title,
      body,
      draft: request.draft,
    });
    await this.applyLabelsAndReviewers(github, request, created.number);
    this.logger.info(`Created release PR #${created.number}.`);
    return {
      created: true,
      updated: false,
      dryRun: false,
      pullRequestNumber: created.number,
      pullRequestUrl: created.htmlUrl,
      title,
      body,
    };
  }

  private async applyLabelsAndReviewers(
    github: GitHubClient,
    request: CreateReleasePrRequest,
    pullNumber: number,
  ): Promise<void> {
    if (request.labels.length > 0) {
      await github.addLabels(request.repo, pullNumber, request.labels);
    }
    if (request.reviewers.length > 0) {
      await github.requestReviewers(request.repo, pullNumber, request.reviewers);
    }
  }

  public static resetInstance(): void {
    ReleasePrService.instance = undefined as unknown as ReleasePrService;
  }
}
