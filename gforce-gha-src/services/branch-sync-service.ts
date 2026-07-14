/**
 * The sync-branches business workflow. The ladder (default `strategy: auto`):
 *
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
import { GitHubClient } from '../clients/github/github-client';
import type { SyncBranchesRequest, SyncBranchesResult } from '../types';
import { LoggerService } from './logger-service';

export class BranchSyncService {
  private static instance: BranchSyncService;

  private constructor() {}

  public static getInstance(): BranchSyncService {
    if (!BranchSyncService.instance) {
      BranchSyncService.instance = new BranchSyncService();
    }
    return BranchSyncService.instance;
  }

  private get logger(): LoggerService {
    return LoggerService.getInstance();
  }

  public async sync(request: SyncBranchesRequest): Promise<SyncBranchesResult> {
    const { repo, sourceBranch, targetBranch, strategy, dryRun, githubToken } = request;
    const github = GitHubClient.getInstance(githubToken);

    const comparison = await github.compareBranches(repo, targetBranch, sourceBranch);
    const { aheadBy, behindBy } = comparison;
    this.logger.info(
      `Compared ${sourceBranch} -> ${targetBranch}: status=${comparison.status} ahead=${aheadBy} behind=${behindBy}`,
    );

    const base = { aheadBy, behindBy, dryRun } as const;

    // 1. Nothing in source that the target lacks.
    if (aheadBy === 0) {
      this.logger.info(`${targetBranch} already contains ${sourceBranch}; nothing to sync.`);
      return { ...base, action: 'none', synced: false, reason: 'up-to-date' };
    }

    const canFastForward = behindBy === 0;

    if (strategy === 'fast-forward' && !canFastForward) {
      this.logger.warning(
        `${targetBranch} has diverged from ${sourceBranch}; a fast-forward is not possible.`,
      );
      return { ...base, action: 'none', synced: false, reason: 'not-fast-forwardable' };
    }

    const useFastForward = canFastForward && strategy !== 'merge';
    const plannedAction = useFastForward ? 'fast-forward' : 'merge';

    // Dry-run short-circuits before any mutation.
    if (dryRun) {
      this.logger.info(`Dry run: would ${plannedAction} ${sourceBranch} into ${targetBranch}.`);
      return { ...base, action: plannedAction, synced: false, reason: 'dry-run' };
    }

    if (useFastForward) {
      const sha = await github.getBranchHeadSha(repo, sourceBranch);
      await github.updateBranchRef(repo, targetBranch, sha, false);
      this.logger.info(`Fast-forwarded ${targetBranch} to ${sha}.`);
      return {
        ...base,
        action: 'fast-forward',
        synced: true,
        resultSha: sha,
        reason: 'fast-forward',
      };
    }

    // Diverged (or forced) -> server-side merge.
    const outcome = await github.mergeBranches(
      repo,
      targetBranch,
      sourceBranch,
      `Merge ${sourceBranch} into ${targetBranch}`,
    );

    if (outcome.status === 'merged') {
      this.logger.info(`Merged ${sourceBranch} into ${targetBranch} (${outcome.sha}).`);
      return { ...base, action: 'merge', synced: true, resultSha: outcome.sha, reason: 'merge' };
    }

    if (outcome.status === 'nothing') {
      return { ...base, action: 'none', synced: false, reason: 'already-merged' };
    }

    // Conflict -> reuse or open a sync PR.
    this.logger.warning(
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

    return {
      ...base,
      action: 'pull-request',
      synced: false,
      pullRequestNumber: pullRequest.number,
      pullRequestUrl: pullRequest.htmlUrl,
      reason: 'merge-conflict',
    };
  }

  public static resetInstance(): void {
    BranchSyncService.instance = undefined as unknown as BranchSyncService;
  }
}
