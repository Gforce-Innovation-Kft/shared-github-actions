/**
 * Validate and normalize the raw sync-branches inputs. Portable: it operates on
 * plain strings (the shape Action inputs arrive in) and never touches
 * `@actions/core`, so it is unit-testable without a runner.
 */
import { parseBoolean, parseEnum, requireNonEmpty } from '../../utils/validation/validation';
import { ValidationError } from '../../utils/errors/errors';
import { SYNC_STRATEGIES, type RawSyncInputs, type ValidatedSyncInputs } from './types';

export function validateSyncBranchesInputs(raw: RawSyncInputs): ValidatedSyncInputs {
  const sourceBranch = requireNonEmpty('source-branch', raw.sourceBranch);
  const targetBranch = requireNonEmpty('target-branch', raw.targetBranch);
  const githubToken = requireNonEmpty('github-token', raw.githubToken);

  if (sourceBranch === targetBranch) {
    throw new ValidationError('source-branch and target-branch must be different');
  }

  return {
    sourceBranch,
    targetBranch,
    githubToken,
    strategy: parseEnum('strategy', raw.strategy, SYNC_STRATEGIES, 'auto'),
    dryRun: parseBoolean(raw.dryRun, true),
  };
}
