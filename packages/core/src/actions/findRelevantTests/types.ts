/** Types for the portable find-relevant-tests use case. */
import type { Logger } from '../../utils/logging/logger';

export interface FindTestsRequest {
  readonly packageXmlPath: string;
  readonly sourceDir: string;
  readonly testSuffixes: readonly string[];
}

export interface FindTestsResult {
  readonly tests: readonly string[];
  readonly testCount: number;
  readonly hasApex: boolean;
  readonly changedApexNames: readonly string[];
}

/** Filesystem port so the use case stays testable without touching disk. */
export interface SourceFileReader {
  /** Read a file as UTF-8; throws when unreadable. */
  readFile(path: string): string;
  /** Recursively list paths of `*.cls` files under `dir`. */
  listApexClassFiles(dir: string): string[];
}

export interface FindTestsDeps {
  readonly files: SourceFileReader;
  readonly logger: Logger;
}

/** Raw, unvalidated inputs as read from the GitHub Action runtime. */
export interface RawFindTestsInputs {
  readonly packageXml: string;
  readonly sourceDir: string;
  readonly testSuffixes: string;
  readonly githubToken: string;
}

/** Normalized, validated inputs ready to build a request. */
export interface ValidatedFindTestsInputs {
  readonly packageXml: string;
  readonly sourceDir: string;
  readonly testSuffixes: string[];
  readonly githubToken: string;
}
