/**
 * Validate and normalize the raw sf-find-tests inputs. Portable: plain strings
 * in, never touches `@actions/core`.
 */
import { parseList, requireNonEmpty } from '../../utils/validation/validation';
import type { RawFindTestsInputs, ValidatedFindTestsInputs } from './types';

const DEFAULT_SUFFIXES = ['Test', '_Test', 'Tests'];

export function validateFindTestsInputs(raw: RawFindTestsInputs): ValidatedFindTestsInputs {
  const suffixes = parseList(raw.testSuffixes);
  return {
    packageXml: requireNonEmpty('package-xml', raw.packageXml),
    sourceDir: requireNonEmpty('source-dir', raw.sourceDir),
    githubToken: requireNonEmpty('github-token', raw.githubToken),
    testSuffixes: suffixes.length > 0 ? suffixes : DEFAULT_SUFFIXES,
  };
}
