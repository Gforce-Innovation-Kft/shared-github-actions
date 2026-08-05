import {
  isApexTestBody,
  selectRelevantTests,
  toApexSourceName,
} from '../../../../libraries/salesforce/selectors/apex-test-selectors';
import type { ApexSource } from '../../../../libraries/salesforce/models/types';

function source(name: string, body: string, isTest: boolean): ApexSource {
  return { name, body, isTest };
}

describe('toApexSourceName', () => {
  test('toApexSourceName_posixPath_returnsBaseNameWithoutExtension', () => {
    // Given
    const path = 'force-app/main/default/classes/InvoiceService.cls';

    // When
    const name = toApexSourceName(path);

    // Then
    expect(name).toBe('InvoiceService');
  });

  test('toApexSourceName_windowsPath_returnsBaseNameWithoutExtension', () => {
    // Given
    const path = 'force-app\\main\\default\\classes\\InvoiceService.cls';

    // When
    const name = toApexSourceName(path);

    // Then
    expect(name).toBe('InvoiceService');
  });
});

describe('isApexTestBody', () => {
  test('isApexTestBody_isTestAnnotation_returnsTrue', () => {
    // Given
    const body = '@IsTest\nprivate class InvoiceServiceTest {}';

    // When
    const result = isApexTestBody(body);

    // Then
    expect(result).toBe(true);
  });

  test('isApexTestBody_legacyTestMethodKeyword_returnsTrue', () => {
    // Given
    const body = 'public class Old { static testMethod void run() {} }';

    // When
    const result = isApexTestBody(body);

    // Then
    expect(result).toBe(true);
  });

  test('isApexTestBody_plainClass_returnsFalse', () => {
    // Given
    const body = 'public class InvoiceService {}';

    // When
    const result = isApexTestBody(body);

    // Then
    expect(result).toBe(false);
  });
});

describe('selectRelevantTests', () => {
  const SUFFIXES = ['Test', '_Test', 'Tests'];

  test('selectRelevantTests_changedTestClass_runsDirectly', () => {
    // Given
    const sources = [source('InvoiceServiceTest', '@IsTest class InvoiceServiceTest {}', true)];

    // When
    const tests = selectRelevantTests(sources, ['InvoiceServiceTest'], SUFFIXES);

    // Then
    expect(tests).toEqual(['InvoiceServiceTest']);
  });

  test('selectRelevantTests_namingConventionMatch_selectsSuffixedTest', () => {
    // Given
    const sources = [
      source('InvoiceService', 'public class InvoiceService {}', false),
      source('InvoiceServiceTest', '@IsTest class InvoiceServiceTest {}', true),
      source('UnrelatedTest', '@IsTest class UnrelatedTest {}', true),
    ];

    // When
    const tests = selectRelevantTests(sources, ['InvoiceService'], SUFFIXES);

    // Then
    expect(tests).toEqual(['InvoiceServiceTest']);
  });

  test('selectRelevantTests_referenceInTestBody_selectsReferencingTest', () => {
    // Given
    const sources = [
      source('FxRateService', 'public class FxRateService {}', false),
      source(
        'InvoiceServiceTest',
        '@IsTest class InvoiceServiceTest { void x() { FxRateService.convert(); } }',
        true,
      ),
      source('UnrelatedTest', '@IsTest class UnrelatedTest {}', true),
    ];

    // When
    const tests = selectRelevantTests(sources, ['FxRateService'], SUFFIXES);

    // Then
    expect(tests).toEqual(['InvoiceServiceTest']);
  });

  test('selectRelevantTests_multipleMatches_returnsSortedUniqueNames', () => {
    // Given
    const sources = [
      source('InvoicesSelector', 'public class InvoicesSelector {}', false),
      source(
        'InvoiceServiceTest',
        '@IsTest class InvoiceServiceTest { InvoicesSelector s; }',
        true,
      ),
      source('InvoicesSelectorTest', '@IsTest class InvoicesSelectorTest {}', true),
    ];

    // When
    const tests = selectRelevantTests(sources, ['InvoicesSelector'], SUFFIXES);

    // Then
    expect(tests).toEqual(['InvoiceServiceTest', 'InvoicesSelectorTest']);
  });

  test('selectRelevantTests_noMatches_returnsEmptyList', () => {
    // Given
    const sources = [source('UnrelatedTest', '@IsTest class UnrelatedTest {}', true)];

    // When
    const tests = selectRelevantTests(sources, ['InvoiceService'], SUFFIXES);

    // Then
    expect(tests).toEqual([]);
  });
});
