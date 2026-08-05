/** Salesforce domain models shared by the salesforce library layers. */

/** One Apex source file, loaded and classified. */
export interface ApexSource {
  readonly name: string;
  readonly body: string;
  readonly isTest: boolean;
}

/** Apex members pulled out of a package.xml manifest. */
export interface ApexMemberSelection {
  readonly names: readonly string[];
  readonly hasWildcard: boolean;
}

export interface ApexTestSelectionRequest {
  readonly packageXmlPath: string;
  readonly sourceDir: string;
  readonly testSuffixes: readonly string[];
}

export interface ApexTestSelectionResult {
  readonly tests: readonly string[];
  readonly testCount: number;
  readonly hasApex: boolean;
  readonly changedApexNames: readonly string[];
}
