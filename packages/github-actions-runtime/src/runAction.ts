/**
 * The common action runner. Every TypeScript action's `main.ts` is reduced to a
 * single call here: read -> validate -> build context -> execute -> write or
 * fail. Service composition (the shared GitHub client), repo resolution, and the
 * top-level failure handling all live here so individual actions never re-copy
 * them.
 */
import * as core from '@actions/core';
import { OctokitGitHubService, type ActionContext, type Result } from '@gforce/core';
import { ActionsLogger } from './ActionsLogger';
import { readRepoFromEnvironment } from './readRepoFromEnvironment';

/** The four pieces an action supplies; everything else is shared. */
export interface GitHubActionDefinition<
  Raw,
  Validated extends { readonly githubToken: string },
  Value,
> {
  /** Read raw input strings from the Action runtime. */
  readonly readInputs: () => Raw;
  /** Validate + normalize raw inputs (portable, lives in core). */
  readonly validateInputs: (raw: Raw) => Validated;
  /** Run the portable use case against the resolved context. */
  readonly execute: (input: Validated, context: ActionContext) => Promise<Result<Value>>;
  /** Map the typed result onto Action outputs. */
  readonly writeOutputs: (value: Value) => void;
}

/**
 * Drive a {@link GitHubActionDefinition} to completion. `overrides` lets tests
 * inject a fake context (github/logger/repo) without touching the environment
 * or constructing a real client.
 */
export async function runGitHubAction<
  Raw,
  Validated extends { readonly githubToken: string },
  Value,
>(
  definition: GitHubActionDefinition<Raw, Validated, Value>,
  overrides: Partial<ActionContext> = {},
): Promise<void> {
  try {
    const input = definition.validateInputs(definition.readInputs());
    const context: ActionContext = {
      repo: overrides.repo ?? readRepoFromEnvironment(),
      logger: overrides.logger ?? new ActionsLogger(),
      github: overrides.github ?? OctokitGitHubService.getInstance(input.githubToken),
    };
    const result = await definition.execute(input, context);
    if (result.ok) {
      definition.writeOutputs(result.value);
    } else {
      core.setFailed(result.error.message);
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}
