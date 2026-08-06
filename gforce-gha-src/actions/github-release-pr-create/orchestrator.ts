/**
 * Thin controller for the github-release-pr-create action — a numbered list of
 * delegated steps, no business logic.
 */
import { GithubContextService } from '../../services/github-context-service';
import { ReleasePrService } from '../../services/release-pr-service';
import type { CreateReleasePrResult } from '../../types';
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

  public async execute(rawInputs: unknown): Promise<CreateReleasePrResult> {
    const inputs = Validator.getInstance().inputValidation(rawInputs); // 1. validate
    const repo = GithubContextService.getInstance().getRepo(); // 2. resolve repo
    return ReleasePrService.getInstance().createOrUpdate({ repo, ...inputs }); // 3. create or update the PR
  }

  public static resetInstance(): void {
    Orchestrator.instance = undefined as unknown as Orchestrator;
  }
}
