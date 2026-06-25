/**
 * Portable orchestration for creating or updating a release pull request.
 *
 *   1. Compare source -> target to gather commits and changed files.
 *   2. Look for an existing open release PR for the same head/base.
 *   3. dry-run: report the computed title/body and any existing PR, mutate nothing.
 *   4. Otherwise update the existing PR, or create a new one, then apply labels
 *      and request reviewers when configured.
 */
import type { CompareResult } from '../../github-service/branch/types';
import { asAppError } from '../../utils/errors/errors';
import { err, ok, type Result } from '../../utils/result/result';
import type { ActionContext } from '../types';
import type {
  CreateReleasePrDeps,
  CreateReleasePrRequest,
  CreateReleasePrResult,
  ValidatedReleasePrInputs,
} from './types';

/**
 * Adapt validated action inputs onto the portable {@link createReleasePr} use
 * case, pulling the repo/logger/github collaborators from the injected
 * {@link ActionContext}. This is the seam the runtime adapter calls.
 */
export function runCreateReleasePrAction(
  input: ValidatedReleasePrInputs,
  context: ActionContext,
): Promise<Result<CreateReleasePrResult>> {
  return createReleasePr(
    {
      repo: context.repo,
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
      releaseVersion: input.releaseVersion,
      title: input.title,
      bodyTemplate: input.bodyTemplate,
      draft: input.draft,
      labels: input.labels,
      reviewers: input.reviewers,
      dryRun: input.dryRun,
    },
    { github: context.github, logger: context.logger },
  );
}

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
  return message.split('\n')[0] ?? '';
}

/** Render a PR body from a template, substituting commit/file/version tokens. */
export function renderReleaseBody(
  request: CreateReleasePrRequest,
  comparison: CompareResult,
): string {
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

export async function createReleasePr(
  request: CreateReleasePrRequest,
  deps: CreateReleasePrDeps,
): Promise<Result<CreateReleasePrResult>> {
  const { github, logger } = deps;
  const { repo, sourceBranch, targetBranch } = request;

  try {
    const comparison = await github.compareBranches(repo, targetBranch, sourceBranch);
    const title = request.title?.trim()
      ? request.title.trim()
      : `Release ${request.releaseVersion}`;
    const body = renderReleaseBody(request, comparison);

    const openPullRequests = await github.listOpenPullRequests(repo, {
      head: sourceBranch,
      base: targetBranch,
    });
    const existing = openPullRequests[0];

    if (request.dryRun) {
      logger.info(
        existing
          ? `Dry run: would update release PR #${existing.number}.`
          : `Dry run: would create a release PR from ${sourceBranch} into ${targetBranch}.`,
      );
      return ok({
        created: false,
        updated: false,
        dryRun: true,
        pullRequestNumber: existing?.number,
        pullRequestUrl: existing?.htmlUrl,
        title,
        body,
      });
    }

    if (existing) {
      const updated = await github.updatePullRequest(repo, existing.number, { title, body });
      await applyLabelsAndReviewers(github, request, existing.number);
      logger.info(`Updated release PR #${updated.number}.`);
      return ok({
        created: false,
        updated: true,
        dryRun: false,
        pullRequestNumber: updated.number,
        pullRequestUrl: updated.htmlUrl,
        title,
        body,
      });
    }

    const created = await github.createPullRequest(repo, {
      head: sourceBranch,
      base: targetBranch,
      title,
      body,
      draft: request.draft,
    });
    await applyLabelsAndReviewers(github, request, created.number);
    logger.info(`Created release PR #${created.number}.`);
    return ok({
      created: true,
      updated: false,
      dryRun: false,
      pullRequestNumber: created.number,
      pullRequestUrl: created.htmlUrl,
      title,
      body,
    });
  } catch (error) {
    return err(asAppError(error));
  }
}

async function applyLabelsAndReviewers(
  github: CreateReleasePrDeps['github'],
  request: CreateReleasePrRequest,
  pullNumber: number,
): Promise<void> {
  if (request.labels.length > 0) {
    await github.addLabels(request.repo, pullNumber, [...request.labels]);
  }
  if (request.reviewers.length > 0) {
    await github.requestReviewers(request.repo, pullNumber, [...request.reviewers]);
  }
}
