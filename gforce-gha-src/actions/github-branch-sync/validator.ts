/**
 * Validates and sanitizes the raw github-branch-sync inputs. All input validation
 * lives here — never in the entry point or the Orchestrator.
 */
import { SYNC_STRATEGIES, type ValidatedSyncBranchesInputs } from '../../types';
import { ValidationError } from '../../utils/errors';
import { parseBoolean, parseEnum, readStringInput, requireNonEmpty } from '../../utils/validation';

export class Validator {
  private static instance: Validator;

  private constructor() {}

  public static getInstance(): Validator {
    if (!Validator.instance) {
      Validator.instance = new Validator();
    }
    return Validator.instance;
  }

  public inputValidation(rawInputs: unknown): ValidatedSyncBranchesInputs {
    const sourceBranch = requireNonEmpty(
      'source-branch',
      readStringInput(rawInputs, 'source-branch'),
    );
    const targetBranch = requireNonEmpty(
      'target-branch',
      readStringInput(rawInputs, 'target-branch'),
    );
    const githubToken = requireNonEmpty('github-token', readStringInput(rawInputs, 'github-token'));

    if (sourceBranch === targetBranch) {
      throw new ValidationError('source-branch and target-branch must be different');
    }

    return {
      sourceBranch,
      targetBranch,
      githubToken,
      strategy: parseEnum(
        'strategy',
        readStringInput(rawInputs, 'strategy'),
        SYNC_STRATEGIES,
        'auto',
      ),
      dryRun: parseBoolean(readStringInput(rawInputs, 'dry-run'), true),
    };
  }

  public static resetInstance(): void {
    Validator.instance = undefined as unknown as Validator;
  }
}
