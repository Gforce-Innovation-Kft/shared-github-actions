/**
 * SfdxService — abstraction over the Salesforce CLI (`sf`/`sfdx`).
 *
 * STUB ONLY. This repository already ships composite actions for Salesforce
 * JWT login; this interface marks the single home for richer, typed SFDX
 * wrappers (login/deploy/package) when a future TypeScript action needs them.
 * Keep CLI process execution behind this interface so it stays unit-testable.
 */
import type { DeployOptions, SfdxCommandResult } from './types';

export interface SfdxService {
  login(params: {
    instanceUrl: string;
    username: string;
    jwtKey: string;
  }): Promise<SfdxCommandResult>;
  deploy(options: DeployOptions): Promise<SfdxCommandResult>;
  createPackageVersion(packageId: string): Promise<SfdxCommandResult>;
}
