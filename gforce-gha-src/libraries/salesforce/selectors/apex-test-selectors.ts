/**
 * Pure selectors over Apex sources — no side effects, no I/O. The test
 * selection combines naming-convention matches with a reference scan of every
 * test class body.
 */
import { escapeRegExp } from '../../../utils/escape-reg-exp';
import type { ApexSource } from '../models/types';

// @IsTest annotation or the legacy testMethod keyword marks a test class.
const TEST_MARKER = /@IsTest|\btestmethod\b/i;

/** Derive the Apex class name from a `.cls` file path. */
export function toApexSourceName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1);
  return fileName.replace(/\.cls$/i, '');
}

/** Whether an Apex source body is a test class. */
export function isApexTestBody(body: string): boolean {
  return TEST_MARKER.test(body);
}

/**
 * Select the test classes relevant to `changedNames`: changed test classes run
 * directly; changed non-test classes pull in tests matched by name suffix or by
 * a word-boundary reference in the test body. Result is sorted and de-duped.
 */
export function selectRelevantTests(
  sources: readonly ApexSource[],
  changedNames: readonly string[],
  testSuffixes: readonly string[],
): readonly string[] {
  const testClasses = sources.filter((source) => source.isTest);
  const changedLower = new Set(changedNames.map((name) => name.toLowerCase()));

  const selected = new Set<string>();
  // A changed class that is itself a test class runs directly.
  for (const test of testClasses) {
    if (changedLower.has(test.name.toLowerCase())) {
      selected.add(test.name);
    }
  }
  const changedNonTest = changedNames.filter(
    (name) => !testClasses.some((test) => test.name.toLowerCase() === name.toLowerCase()),
  );
  for (const name of changedNonTest) {
    const reference = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
    for (const test of testClasses) {
      const nameMatch = testSuffixes.some(
        (suffix) => test.name.toLowerCase() === `${name}${suffix}`.toLowerCase(),
      );
      if (nameMatch || reference.test(test.body)) {
        selected.add(test.name);
      }
    }
  }

  return [...selected].sort((a, b) => a.localeCompare(b));
}
