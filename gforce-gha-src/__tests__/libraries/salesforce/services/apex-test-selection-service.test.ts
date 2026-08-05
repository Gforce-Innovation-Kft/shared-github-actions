import { ApexTestSelectionService } from '../../../../libraries/salesforce/services/apex-test-selection-service';
import { FileSystemService } from '../../../../services/file-system-service';
import { LoggerService } from '../../../../services/logger-service';

const REQUEST = {
  packageXmlPath: 'delta/package.xml',
  sourceDir: 'force-app',
  testSuffixes: ['Test', '_Test', 'Tests'],
};

function manifest(members: string): string {
  return `<Package><types>${members}<name>ApexClass</name></types></Package>`;
}

beforeEach(() => {
  jest.spyOn(LoggerService.getInstance(), 'info').mockImplementation(() => {});
  jest.spyOn(LoggerService.getInstance(), 'warning').mockImplementation(() => {});
});

afterEach(() => {
  ApexTestSelectionService.resetInstance();
  FileSystemService.resetInstance();
  LoggerService.resetInstance();
  jest.restoreAllMocks();
});

describe('selectTests', () => {
  test('selectTests_noApexInDelta_returnsHasApexFalseWithoutScanningSources', () => {
    // Given
    const readFileSpy = jest
      .spyOn(FileSystemService.getInstance(), 'readFile')
      .mockReturnValue('<Package></Package>');
    const listSpy = jest.spyOn(FileSystemService.getInstance(), 'listFilesByExtension');

    // When
    const result = ApexTestSelectionService.getInstance().selectTests(REQUEST);

    // Then
    expect(readFileSpy).toHaveBeenCalledWith('delta/package.xml');
    expect(listSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ tests: [], testCount: 0, hasApex: false, changedApexNames: [] });
  });

  test('selectTests_wildcardMember_warnsAndReturnsNoScopedTests', () => {
    // Given
    jest
      .spyOn(FileSystemService.getInstance(), 'readFile')
      .mockReturnValue(manifest('<members>*</members><members>InvoiceService</members>'));
    const warningSpy = jest.spyOn(LoggerService.getInstance(), 'warning');
    const listSpy = jest.spyOn(FileSystemService.getInstance(), 'listFilesByExtension');

    // When
    const result = ApexTestSelectionService.getInstance().selectTests(REQUEST);

    // Then
    expect(warningSpy).toHaveBeenCalledWith(
      'Delta manifest uses a wildcard Apex member — cannot scope tests; caller should run local tests.',
    );
    expect(listSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      tests: [],
      testCount: 0,
      hasApex: true,
      changedApexNames: ['InvoiceService'],
    });
  });

  test('selectTests_changedClassWithNamingAndReferenceMatches_returnsSortedTests', () => {
    // Given
    const files = FileSystemService.getInstance();
    jest
      .spyOn(files, 'listFilesByExtension')
      .mockReturnValue([
        'force-app/classes/InvoicesSelector.cls',
        'force-app/classes/InvoicesSelectorTest.cls',
        'force-app/classes/InvoiceServiceTest.cls',
        'force-app/classes/UnrelatedTest.cls',
      ]);
    jest.spyOn(files, 'readFile').mockImplementation((path: string): string => {
      if (path === 'delta/package.xml') {
        return manifest('<members>InvoicesSelector</members>');
      }
      if (path.endsWith('InvoicesSelector.cls')) {
        return 'public class InvoicesSelector {}';
      }
      if (path.endsWith('InvoicesSelectorTest.cls')) {
        return '@IsTest class InvoicesSelectorTest {}';
      }
      if (path.endsWith('InvoiceServiceTest.cls')) {
        return '@IsTest class InvoiceServiceTest { InvoicesSelector selector; }';
      }
      return '@IsTest class UnrelatedTest {}';
    });

    // When
    const result = ApexTestSelectionService.getInstance().selectTests(REQUEST);

    // Then
    expect(files.listFilesByExtension).toHaveBeenCalledWith('force-app', '.cls');
    expect(result).toEqual({
      tests: ['InvoiceServiceTest', 'InvoicesSelectorTest'],
      testCount: 2,
      hasApex: true,
      changedApexNames: ['InvoicesSelector'],
    });
  });

  test('selectTests_manifestUnreadable_propagatesError', () => {
    // Given
    jest.spyOn(FileSystemService.getInstance(), 'readFile').mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    // When
    const act = (): unknown => ApexTestSelectionService.getInstance().selectTests(REQUEST);

    // Then
    expect(act).toThrow(Error);
    expect(act).toThrow('ENOENT: no such file');
  });
});
