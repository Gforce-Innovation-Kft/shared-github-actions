/**
 * Local-Git value objects.
 *
 * STUB: reserved for future actions that need to drive a local `git` working
 * tree (as opposed to the GitHub REST API). No runtime code yet.
 */

export interface GitCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CheckoutOptions {
  readonly create?: boolean;
  readonly startPoint?: string;
}
