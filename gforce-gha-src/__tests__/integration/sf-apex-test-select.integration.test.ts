/**
 * End-to-end: raw kebab-case inputs -> Validator -> ApexTestSelectionService ->
 * real FileSystemService against the on-disk fixtures. Also asserts the
 * committed bundle the runner executes exists.
 */
import * as fs from 'fs';
import * as path from 'path';

import { Orchestrator } from '../../actions/sf-apex-test-select/orchestrator';
import { FileSystemService } from '../../services/file-system-service';
import { LoggerService } from '../../services/logger-service';

const FIXTURES = path.join(__dirname, '..', 'support', 'fixtures');

beforeEach(() => {
  jest.spyOn(LoggerService.getInstance(), 'info').mockImplementation(() => {});
});

afterEach(() => {
  Orchestrator.resetInstance();
  FileSystemService.resetInstance();
  LoggerService.resetInstance();
  jest.restoreAllMocks();
});

describe('sf-apex-test-select end-to-end', () => {
  test('execute_fixtureDelta_selectsNamingAndReferenceMatchesFromRealFiles', async () => {
    // Given
    const rawInputs = {
      'package-xml': path.join(FIXTURES, 'package.xml'),
      'source-dir': path.join(FIXTURES, 'force-app'),
      'test-suffixes': '',
      'github-token': 'test-token',
    };

    // When
    const result = await Orchestrator.getInstance().execute(rawInputs);

    // Then
    expect(result).toEqual({
      tests: ['InvoiceServiceTest', 'InvoicesSelectorTest'],
      testCount: 2,
      hasApex: true,
      changedApexNames: ['InvoicesSelector', 'FxRateService'],
    });
  });

  test('bundle_committedDistIndexJs_exists', () => {
    // Given
    const bundlePath = path.resolve(
      __dirname,
      '../../../.github/actions/sf-apex-test-select/dist/index.js',
    );

    // When
    const exists = fs.existsSync(bundlePath);

    // Then
    expect(exists).toBe(true);
  });
});
