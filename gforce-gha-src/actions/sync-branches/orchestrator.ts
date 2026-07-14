/**
 * Thin controller for the sync-branches action — a numbered list of delegated
 * steps, no business logic.
 */
import { BranchSyncService } from '../../services/branch-sync-service';
import { GithubContextService } from '../../services/github-context-service';
import type { SyncBranchesResult } from '../../types';
import { Validator } from './validator';

export class Orchestrator {
  private static instance: Orchestrator;

  private constructor() {}

  public static getInstance(): Orchestrator {
    if (!Orchestrator.instance) {
      Orchestrator.instance = new Orchestrator();
    }
    return Orchestrator.instance;
  }

  public async execute(rawInputs: unknown): Promise<SyncBranchesResult> {
    const inputs = Validator.getInstance().inputValidation(rawInputs); // 1. validate
    const repo = GithubContextService.getInstance().getRepo(); // 2. resolve repo
    return BranchSyncService.getInstance().sync({ repo, ...inputs }); // 3. sync
  }

  public static resetInstance(): void {
    Orchestrator.instance = undefined as unknown as Orchestrator;
  }
}
