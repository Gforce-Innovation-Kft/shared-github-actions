/**
 * Select the Apex test classes relevant to a delta package: naming-convention
 * matches plus a reference scan of every test class in the source tree. Pure
 * and filesystem-agnostic — file access goes through the injected reader.
 */
import { ok, err, type Result } from '../../utils/result/result';
import { asAppError } from '../../utils/errors/errors';
import type { ActionContext } from '../types';
import { createNodeSourceFileReader } from './nodeSourceFileReader';
import type {
  FindTestsDeps,
  FindTestsRequest,
  FindTestsResult,
  ValidatedFindTestsInputs,
} from './types';

const APEX_TYPES = new Set(['ApexClass', 'ApexTrigger']);
// @IsTest annotation or the legacy testMethod keyword marks a test class.
const TEST_MARKER = /@IsTest|\btestmethod\b/i;

interface ApexSource {
  readonly name: string;
  readonly body: string;
  readonly isTest: boolean;
}

/** Pull ApexClass/ApexTrigger member names out of a package.xml manifest. */
export function parseApexMembers(manifestXml: string): { names: string[]; hasWildcard: boolean } {
  const names: string[] = [];
  let hasWildcard = false;
  for (const block of manifestXml.match(/<types>[\s\S]*?<\/types>/g) ?? []) {
    const typeName = block.match(/<name>\s*([^<\s]+)\s*<\/name>/)?.[1] ?? '';
    if (!APEX_TYPES.has(typeName)) {
      continue;
    }
    for (const member of block.matchAll(/<members>\s*([^<]+?)\s*<\/members>/g)) {
      if (member[1] === '*') {
        hasWildcard = true;
      } else {
        names.push(member[1]);
      }
    }
  }
  return { names, hasWildcard };
}

export function findRelevantTests(request: FindTestsRequest, deps: FindTestsDeps): FindTestsResult {
  const manifest = deps.files.readFile(request.packageXmlPath);
  const { names: changedNames, hasWildcard } = parseApexMembers(manifest);
  if (changedNames.length === 0 && !hasWildcard) {
    deps.logger.info('Delta contains no Apex classes or triggers — no tests to select.');
    return { tests: [], testCount: 0, hasApex: false, changedApexNames: [] };
  }
  if (hasWildcard) {
    deps.logger.warning(
      'Delta manifest uses a wildcard Apex member — cannot scope tests; caller should run local tests.',
    );
    return { tests: [], testCount: 0, hasApex: true, changedApexNames: changedNames };
  }

  const sources: ApexSource[] = deps.files.listApexClassFiles(request.sourceDir).map((path) => {
    const body = deps.files.readFile(path);
    const fileName = path.replace(/\\/g, '/').split('/').pop() ?? '';
    return { name: fileName.replace(/\.cls$/i, ''), body, isTest: TEST_MARKER.test(body) };
  });
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
      const nameMatch = request.testSuffixes.some(
        (suffix) => test.name.toLowerCase() === `${name}${suffix}`.toLowerCase(),
      );
      if (nameMatch || reference.test(test.body)) {
        selected.add(test.name);
      }
    }
  }

  const tests = [...selected].sort((a, b) => a.localeCompare(b));
  deps.logger.info(
    `Selected ${tests.length} test class(es) for ${changedNames.length} changed Apex member(s).`,
  );
  return { tests, testCount: tests.length, hasApex: true, changedApexNames: changedNames };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Action seam: map validated inputs + context onto the use case. */
export async function runFindTestsAction(
  input: ValidatedFindTestsInputs,
  context: ActionContext,
): Promise<Result<FindTestsResult>> {
  try {
    const result = findRelevantTests(
      {
        packageXmlPath: input.packageXml,
        sourceDir: input.sourceDir,
        testSuffixes: input.testSuffixes,
      },
      { files: createNodeSourceFileReader(), logger: context.logger },
    );
    return ok(result);
  } catch (error) {
    return err(asAppError(error));
  }
}
