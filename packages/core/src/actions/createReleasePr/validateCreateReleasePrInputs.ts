/**
 * Validate and normalize the raw create-release-pr inputs. Portable: it operates
 * on plain strings and never touches `@actions/core`, so it is unit-testable
 * without a runner.
 */
import { parseBoolean, parseList, requireNonEmpty } from '../../utils/validation/validation';
import { ValidationError } from '../../utils/errors/errors';
import type { RawReleasePrInputs, ValidatedReleasePrInputs } from './types';

export function validateCreateReleasePrInputs(raw: RawReleasePrInputs): ValidatedReleasePrInputs {
  const sourceBranch = requireNonEmpty('source-branch', raw.sourceBranch);
  const targetBranch = requireNonEmpty('target-branch', raw.targetBranch);
  const releaseVersion = requireNonEmpty('release-version', raw.releaseVersion);
  const githubToken = requireNonEmpty('github-token', raw.githubToken);

  if (sourceBranch === targetBranch) {
    throw new ValidationError('source-branch and target-branch must be different');
  }

  const title = raw.title.trim();
  const bodyTemplate = raw.bodyTemplate.trim();

  return {
    sourceBranch,
    targetBranch,
    releaseVersion,
    githubToken,
    title: title.length > 0 ? title : undefined,
    bodyTemplate: bodyTemplate.length > 0 ? bodyTemplate : undefined,
    draft: parseBoolean(raw.draft, false),
    labels: parseList(raw.labels),
    reviewers: parseList(raw.reviewers),
    dryRun: parseBoolean(raw.dryRun, true),
  };
}
