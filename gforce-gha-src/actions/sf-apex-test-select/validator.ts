/**
 * Validates and sanitizes the raw sf-apex-test-select inputs. All input validation
 * lives here — never in the entry point or the Orchestrator.
 */
import type { ValidatedSfFindTestsInputs } from '../../types';
import { parseList, readStringInput, requireNonEmpty } from '../../utils/validation';

const DEFAULT_SUFFIXES = ['Test', '_Test', 'Tests'] as const;

export class Validator {
  private static instance: Validator;

  private constructor() {}

  public static getInstance(): Validator {
    if (!Validator.instance) {
      Validator.instance = new Validator();
    }
    return Validator.instance;
  }

  public inputValidation(rawInputs: unknown): ValidatedSfFindTestsInputs {
    const suffixes = parseList(readStringInput(rawInputs, 'test-suffixes'));
    return {
      packageXml: requireNonEmpty('package-xml', readStringInput(rawInputs, 'package-xml')),
      sourceDir: requireNonEmpty('source-dir', readStringInput(rawInputs, 'source-dir')),
      githubToken: requireNonEmpty('github-token', readStringInput(rawInputs, 'github-token')),
      testSuffixes: suffixes.length > 0 ? suffixes : DEFAULT_SUFFIXES,
    };
  }

  public static resetInstance(): void {
    Validator.instance = undefined as unknown as Validator;
  }
}
