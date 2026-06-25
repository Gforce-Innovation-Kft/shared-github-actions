/**
 * Salesforce (SF/SFDX) CLI value objects.
 *
 * STUB: reserved for future Salesforce CI/CD actions (login, deploy, package).
 * No runtime code yet.
 */

export interface SfdxCommandResult {
  readonly status: number;
  readonly result: unknown;
}

export interface DeployOptions {
  readonly sourceDir: string;
  readonly checkOnly?: boolean;
  readonly testLevel?: 'NoTestRun' | 'RunLocalTests' | 'RunAllTestsInOrg';
}
