import {
  findRelevantTests,
  parseApexMembers,
  runFindTestsAction,
} from '../src/actions/findRelevantTests/findRelevantTests';
import { NoopLogger } from '../src/utils/logging/logger';
import { isErr } from '../src/utils/result/result';
import type { SourceFileReader } from '../src/actions/findRelevantTests/types';
import type { ActionContext } from '../src/actions/types';

const MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>InvoicesSelector</members>
    <members>FxRateService</members>
    <name>ApexClass</name>
  </types>
  <types>
    <members>InvoiceTrigger</members>
    <name>ApexTrigger</name>
  </types>
  <types>
    <members>Invoice__c.Due_Date__c</members>
    <name>CustomField</name>
  </types>
  <version>65.0</version>
</Package>`;

const NO_APEX_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>Invoice__c.Due_Date__c</members>
    <name>CustomField</name>
  </types>
  <version>65.0</version>
</Package>`;

const WILDCARD_MANIFEST = `<Package>
  <types><members>*</members><name>ApexClass</name></types>
</Package>`;

function fakeReader(manifest: string, classes: Record<string, string>): SourceFileReader {
  return {
    readFile(path: string): string {
      if (path === 'delta/package/package.xml') return manifest;
      const name = path
        .split('/')
        .pop()!
        .replace(/\.cls$/, '');
      if (name in classes) return classes[name];
      throw new Error(`unreadable: ${path}`);
    },
    listApexClassFiles(): string[] {
      return Object.keys(classes).map((n) => `force-app/main/default/classes/${n}.cls`);
    },
  };
}

const REQUEST = {
  packageXmlPath: 'delta/package/package.xml',
  sourceDir: 'force-app',
  testSuffixes: ['Test', '_Test', 'Tests'],
};

describe('parseApexMembers', () => {
  it('extracts ApexClass and ApexTrigger members, ignoring other types', () => {
    const { names, hasWildcard } = parseApexMembers(MANIFEST);
    expect(names.sort()).toEqual(['FxRateService', 'InvoiceTrigger', 'InvoicesSelector']);
    expect(hasWildcard).toBe(false);
  });

  it('flags wildcard members', () => {
    expect(parseApexMembers(WILDCARD_MANIFEST)).toEqual({ names: [], hasWildcard: true });
  });
});

describe('findRelevantTests', () => {
  it('returns hasApex=false for a metadata-only delta', () => {
    const result = findRelevantTests(REQUEST, {
      files: fakeReader(NO_APEX_MANIFEST, {}),
      logger: NoopLogger,
    });
    expect(result).toEqual({ tests: [], testCount: 0, hasApex: false, changedApexNames: [] });
  });

  it('defers to the caller (empty test list) on a wildcard manifest', () => {
    const result = findRelevantTests(REQUEST, {
      files: fakeReader(WILDCARD_MANIFEST, { AnyTest: '@IsTest class AnyTest {}' }),
      logger: NoopLogger,
    });
    expect(result.hasApex).toBe(true);
    expect(result.tests).toEqual([]);
  });

  it('selects naming matches, reference matches, and changed test classes', () => {
    const classes = {
      InvoicesSelector: 'public class InvoicesSelector {}',
      InvoicesSelectorTest: '@IsTest private class InvoicesSelectorTest {}',
      FxRateService: 'public class FxRateService {}',
      InvoiceServiceTest:
        '@IsTest private class InvoiceServiceTest { static void t() { FxRateService.convert(); } }',
      UnrelatedTest: '@IsTest private class UnrelatedTest {}',
      Helper: 'public class Helper { FxRateService s; }',
    };
    const result = findRelevantTests(REQUEST, {
      files: fakeReader(MANIFEST, classes),
      logger: NoopLogger,
    });
    expect(result.tests).toEqual(['InvoiceServiceTest', 'InvoicesSelectorTest']);
    expect(result.testCount).toBe(2);
    expect(result.hasApex).toBe(true);
  });

  it('includes a changed class that is itself a test class', () => {
    const manifest = `<Package><types><members>InvoicesSelectorTest</members><name>ApexClass</name></types></Package>`;
    const result = findRelevantTests(REQUEST, {
      files: fakeReader(manifest, {
        InvoicesSelectorTest: '@IsTest private class InvoicesSelectorTest {}',
      }),
      logger: NoopLogger,
    });
    expect(result.tests).toEqual(['InvoicesSelectorTest']);
  });

  it('matches names case-insensitively (Apex is case-insensitive)', () => {
    const manifest = `<Package><types><members>fxrateservice</members><name>ApexClass</name></types></Package>`;
    const result = findRelevantTests(REQUEST, {
      files: fakeReader(manifest, {
        FxRateService: 'public class FxRateService {}',
        FxRateServiceTest: '@IsTest class FxRateServiceTest {}',
      }),
      logger: NoopLogger,
    });
    expect(result.tests).toEqual(['FxRateServiceTest']);
  });

  it('recognizes legacy testMethod classes as tests', () => {
    const manifest = `<Package><types><members>Foo</members><name>ApexClass</name></types></Package>`;
    const result = findRelevantTests(REQUEST, {
      files: fakeReader(manifest, {
        Foo: 'public class Foo {}',
        LegacyFooTest: 'private class LegacyFooTest { static testMethod void t() { new Foo(); } }',
      }),
      logger: NoopLogger,
    });
    expect(result.tests).toEqual(['LegacyFooTest']);
  });

  it('runFindTestsAction returns an error when reading the package fails', async () => {
    const context: ActionContext = { logger: NoopLogger };
    const input = {
      packageXml: '/nonexistent/path/package.xml',
      sourceDir: 'force-app',
      testSuffixes: ['Test'],
      githubToken: 'tok',
    };
    const result = await runFindTestsAction(input, context);
    expect(isErr(result)).toBe(true);
  });
});
