/**
 * BranchService — the branch-scoped slice of the GitHub REST API: comparing
 * refs, resolving a head SHA, moving a ref, and server-side merges. Implemented
 * only by {@link OctokitBranchService}; orchestrators depend on this interface.
 */
import type { RepoRef } from '../types';
import type { CompareResult, MergeOutcome } from './types';

export interface BranchService {
  /** Compare two refs (`base...head`) and report ahead/behind counts + diff. */
  compareBranches(repo: RepoRef, base: string, head: string): Promise<CompareResult>;

  /** Resolve the current head commit SHA of a branch. */
  getBranchHeadSha(repo: RepoRef, branch: string): Promise<string>;

  /** Move a branch ref to `sha`. Without `force`, only fast-forwards succeed. */
  updateBranchRef(repo: RepoRef, branch: string, sha: string, force?: boolean): Promise<void>;

  /** Server-side merge of `head` into `base`. Conflicts resolve to a typed outcome. */
  mergeBranches(
    repo: RepoRef,
    base: string,
    head: string,
    commitMessage?: string,
  ): Promise<MergeOutcome>;
}
