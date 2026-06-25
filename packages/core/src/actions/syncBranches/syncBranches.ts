/**
 * Portable orchestration for synchronizing one branch into another.
 *
 * The ladder (default `strategy: auto`):
 *   1. Compare source -> target. If source has no new commits, do nothing.
 *   2. If the target is an ancestor of source, fast-forward the target ref.
 *   3. Otherwise (diverged) attempt a server-side merge.
 *   4. If that merge conflicts, reuse or open a "sync" pull request so a human
 *      can resolve it.
 *
 * `strategy: fast-forward` restricts to step 2; `strategy: merge` forces step 3
 * even when a fast-forward is possible. `dryRun` reports the planned action and
 * mutates nothing.
 */
import { asAppError } from '../../utils/errors/errors';
import { err, ok, type Result } from '../../utils/result/result';
import type { ActionContext } from '../types';
import type {
  SyncBranchesDeps,
  SyncBranchesRequest,
  SyncBranchesResult,
  ValidatedSyncInputs,
} from './types';

/**
 * Adapt validated action inputs onto the portable {@link syncBranches} use case,
 * pulling the repo/logger/github collaborators from the injected
 * {@link ActionContext}. This is the seam the runtime adapter calls.
 */
export function runSyncBranchesAction(
  input: ValidatedSyncInputs,
  context: ActionContext,
): Promise<Result<SyncBranchesResult>> {
  return syncBranches(
    {
      repo: context.repo,
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
      strategy: input.strategy,
      dryRun: input.dryRun,
    },
    { github: context.github, logger: context.logger },
  );
}

export async function syncBranches(
  request: SyncBranchesRequest,
  deps: SyncBranchesDeps,
): Promise<Result<SyncBranchesResult>> {
  const { github, logger } = deps;
  const { repo, sourceBranch, targetBranch, strategy, dryRun } = request;

  try {
    const comparison = await github.compareBranches(repo, targetBranch, sourceBranch);
    const aheadBy = comparison.aheadBy;
    const behindBy = comparison.behindBy;
    logger.info(
      `Compared ${sourceBranch} -> ${targetBranch}: status=${comparison.status} ahead=${aheadBy} behind=${behindBy}`,
    );

    const base = { aheadBy, behindBy, dryRun } as const;

    // 1. Nothing in source that the target lacks.
    if (aheadBy === 0) {
      logger.info(`${targetBranch} already contains ${sourceBranch}; nothing to sync.`);
      return ok({ ...base, action: 'none', synced: false, reason: 'up-to-date' });
    }

    const canFastForward = behindBy === 0;

    if (strategy === 'fast-forward' && !canFastForward) {
      logger.warning(
        `${targetBranch} has diverged from ${sourceBranch}; a fast-forward is not possible.`,
      );
      return ok({ ...base, action: 'none', synced: false, reason: 'not-fast-forwardable' });
    }

    const useFastForward = canFastForward && strategy !== 'merge';
    const plannedAction = useFastForward ? 'fast-forward' : 'merge';

    // Dry-run short-circuits before any mutation.
    if (dryRun) {
      logger.info(`Dry run: would ${plannedAction} ${sourceBranch} into ${targetBranch}.`);
      return ok({ ...base, action: plannedAction, synced: false, reason: 'dry-run' });
    }

    if (useFastForward) {
      const sha = await github.getBranchHeadSha(repo, sourceBranch);
      await github.updateBranchRef(repo, targetBranch, sha, false);
      logger.info(`Fast-forwarded ${targetBranch} to ${sha}.`);
      return ok({
        ...base,
        action: 'fast-forward',
        synced: true,
        resultSha: sha,
        reason: 'fast-forward',
      });
    }

    // Diverged (or forced) -> server-side merge.
    const outcome = await github.mergeBranches(
      repo,
      targetBranch,
      sourceBranch,
      `Merge ${sourceBranch} into ${targetBranch}`,
    );

    if (outcome.status === 'merged') {
      logger.info(`Merged ${sourceBranch} into ${targetBranch} (${outcome.sha}).`);
      return ok({
        ...base,
        action: 'merge',
        synced: true,
        resultSha: outcome.sha,
        reason: 'merge',
      });
    }

    if (outcome.status === 'nothing') {
      return ok({ ...base, action: 'none', synced: false, reason: 'already-merged' });
    }

    // Conflict -> reuse or open a sync PR.
    logger.warning(
      `Merge of ${sourceBranch} into ${targetBranch} conflicts; opening a sync pull request.`,
    );
    const existing = await github.listOpenPullRequests(repo, {
      head: sourceBranch,
      base: targetBranch,
    });
    const pullRequest =
      existing[0] ??
      (await github.createPullRequest(repo, {
        head: sourceBranch,
        base: targetBranch,
        title: `Sync ${sourceBranch} into ${targetBranch}`,
        body:
          `Automated sync pull request.\n\n` +
          `A direct merge of \`${sourceBranch}\` into \`${targetBranch}\` hit conflicts that ` +
          `need manual resolution.`,
      }));

    return ok({
      ...base,
      action: 'pull-request',
      synced: false,
      pullRequestNumber: pullRequest.number,
      pullRequestUrl: pullRequest.htmlUrl,
      reason: 'merge-conflict',
    });
  } catch (error) {
    return err(asAppError(error));
  }
}
