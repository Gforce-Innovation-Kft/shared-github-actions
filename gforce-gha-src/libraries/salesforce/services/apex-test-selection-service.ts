/**
 * The sf-apex-test-select business workflow: read the delta manifest, classify the
 * Apex members, load the source tree, and select the relevant test classes.
 * Filesystem access goes through {@link FileSystemService}.
 */
import { FileSystemService } from '../../../services/file-system-service';
import { LoggerService } from '../../../services/logger-service';
import type {
  ApexSource,
  ApexTestSelectionRequest,
  ApexTestSelectionResult,
} from '../models/types';
import {
  isApexTestBody,
  selectRelevantTests,
  toApexSourceName,
} from '../selectors/apex-test-selectors';
import { parseApexMembers } from '../utils/parse-apex-members';

export class ApexTestSelectionService {
  private static instance: ApexTestSelectionService;

  private constructor() {}

  public static getInstance(): ApexTestSelectionService {
    if (!ApexTestSelectionService.instance) {
      ApexTestSelectionService.instance = new ApexTestSelectionService();
    }
    return ApexTestSelectionService.instance;
  }

  private get logger(): LoggerService {
    return LoggerService.getInstance();
  }

  private get files(): FileSystemService {
    return FileSystemService.getInstance();
  }

  public selectTests(request: ApexTestSelectionRequest): ApexTestSelectionResult {
    const manifest = this.files.readFile(request.packageXmlPath);
    const { names: changedNames, hasWildcard } = parseApexMembers(manifest);

    if (changedNames.length === 0 && !hasWildcard) {
      this.logger.info('Delta contains no Apex classes or triggers — no tests to select.');
      return { tests: [], testCount: 0, hasApex: false, changedApexNames: [] };
    }
    if (hasWildcard) {
      this.logger.warning(
        'Delta manifest uses a wildcard Apex member — cannot scope tests; caller should run local tests.',
      );
      return { tests: [], testCount: 0, hasApex: true, changedApexNames: changedNames };
    }

    const sources: readonly ApexSource[] = this.files
      .listFilesByExtension(request.sourceDir, '.cls')
      .map((path) => {
        const body = this.files.readFile(path);
        return { name: toApexSourceName(path), body, isTest: isApexTestBody(body) };
      });

    const tests = selectRelevantTests(sources, changedNames, request.testSuffixes);
    this.logger.info(
      `Selected ${tests.length} test class(es) for ${changedNames.length} changed Apex member(s).`,
    );
    return { tests, testCount: tests.length, hasApex: true, changedApexNames: changedNames };
  }

  public static resetInstance(): void {
    ApexTestSelectionService.instance = undefined as unknown as ApexTestSelectionService;
  }
}
