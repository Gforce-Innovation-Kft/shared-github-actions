/**
 * Thin controller for the sf-find-tests action — a numbered list of delegated
 * steps, no business logic. This action makes no GitHub API calls, so there is
 * no repo/context step.
 */
import type { ApexTestSelectionResult } from '../../libraries/salesforce/models/types';
import { ApexTestSelectionService } from '../../libraries/salesforce/services/apex-test-selection-service';
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

  public async execute(rawInputs: unknown): Promise<ApexTestSelectionResult> {
    const inputs = Validator.getInstance().inputValidation(rawInputs); // 1. validate
    return ApexTestSelectionService.getInstance().selectTests({
      // 2. select tests
      packageXmlPath: inputs.packageXml,
      sourceDir: inputs.sourceDir,
      testSuffixes: inputs.testSuffixes,
    });
  }

  public static resetInstance(): void {
    Orchestrator.instance = undefined as unknown as Orchestrator;
  }
}
