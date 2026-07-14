import * as path from 'path';

import { FileSystemService } from '../../services/file-system-service';

const FIXTURES = path.join(__dirname, '..', 'support', 'fixtures');

afterEach(() => {
  FileSystemService.resetInstance();
});

describe('FileSystemService', () => {
  test('getInstance_calledTwice_returnsSameInstance', () => {
    // Given
    const first = FileSystemService.getInstance();

    // When
    const second = FileSystemService.getInstance();

    // Then
    expect(second).toBe(first);
  });

  test('readFile_existingFile_returnsUtf8Content', () => {
    // Given
    const manifestPath = path.join(FIXTURES, 'package.xml');

    // When
    const content = FileSystemService.getInstance().readFile(manifestPath);

    // Then
    expect(content).toContain('<name>ApexClass</name>');
  });

  test('readFile_missingFile_throws', () => {
    // Given
    const missingPath = path.join(FIXTURES, 'does-not-exist.xml');

    // When
    const act = (): string => FileSystemService.getInstance().readFile(missingPath);

    // Then
    expect(act).toThrow('ENOENT');
  });

  test('listFilesByExtension_fixtureTree_returnsAllClsFilesRecursively', () => {
    // Given
    const sourceDir = path.join(FIXTURES, 'force-app');

    // When
    const files = FileSystemService.getInstance().listFilesByExtension(sourceDir, '.cls');

    // Then
    expect(files.map((file) => path.basename(file)).sort()).toEqual([
      'FxRateService.cls',
      'InvoiceServiceTest.cls',
      'InvoicesSelector.cls',
      'InvoicesSelectorTest.cls',
      'UnrelatedTest.cls',
    ]);
  });

  test('listFilesByExtension_noMatchingExtension_returnsEmptyList', () => {
    // Given
    const sourceDir = path.join(FIXTURES, 'force-app');

    // When
    const files = FileSystemService.getInstance().listFilesByExtension(sourceDir, '.trigger');

    // Then
    expect(files).toEqual([]);
  });
});
