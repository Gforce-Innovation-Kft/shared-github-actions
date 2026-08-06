/**
 * Validates and sanitizes the raw github-release-pr-create inputs. All input
 * validation lives here — never in the entry point or the Orchestrator.
 */
import type { ValidatedCreateReleasePrInputs } from '../../types';
import { ValidationError } from '../../utils/errors';
import { parseBoolean, parseList, readStringInput, requireNonEmpty } from '../../utils/validation';

export class Validator {
  private static instance: Validator;

  private constructor() {}

  public static getInstance(): Validator {
    if (!Validator.instance) {
      Validator.instance = new Validator();
    }
    return Validator.instance;
  }

  public inputValidation(rawInputs: unknown): ValidatedCreateReleasePrInputs {
    const sourceBranch = requireNonEmpty(
      'source-branch',
      readStringInput(rawInputs, 'source-branch'),
    );
    const targetBranch = requireNonEmpty(
      'target-branch',
      readStringInput(rawInputs, 'target-branch'),
    );
    const releaseVersion = requireNonEmpty(
      'release-version',
      readStringInput(rawInputs, 'release-version'),
    );
    const githubToken = requireNonEmpty('github-token', readStringInput(rawInputs, 'github-token'));

    if (sourceBranch === targetBranch) {
      throw new ValidationError('source-branch and target-branch must be different');
    }

    const title = (readStringInput(rawInputs, 'title') ?? '').trim();
    const bodyTemplate = (readStringInput(rawInputs, 'body-template') ?? '').trim();

    return {
      sourceBranch,
      targetBranch,
      releaseVersion,
      githubToken,
      title: title.length > 0 ? title : undefined,
      bodyTemplate: bodyTemplate.length > 0 ? bodyTemplate : undefined,
      draft: parseBoolean(readStringInput(rawInputs, 'draft'), false),
      labels: parseList(readStringInput(rawInputs, 'labels')),
      reviewers: parseList(readStringInput(rawInputs, 'reviewers')),
      dryRun: parseBoolean(readStringInput(rawInputs, 'dry-run'), true),
    };
  }

  public static resetInstance(): void {
    Validator.instance = undefined as unknown as Validator;
  }
}
