# Claude Prompt: Implementation Review Feedback

Use this prompt with Claude Code from the root of this repository:

```text
Review the current implementation as a senior DevOps/TypeScript architect and refactor it to better match the shared-action architecture goal.

Main goal:
This repository must be a portable shared GitHub Actions platform. The `.github/actions/<action>/src` layer should be as small as possible. Anything reusable, testable, or domain-related should move into `packages/core` or a shared package. The action folders should only contain the GitHub Actions runtime adapter: read inputs, call shared module, write outputs, set failure.

Findings to fix:

1. Replace the current factory-style GitHub service API

Current file:
`packages/core/src/github-service/gitHubServiceFactory.ts`

The current API is called `getGitHubService(token)` and lives in a `Factory` file, but it actually behaves like a singleton. Rename/rework this to a clearer instance provider.

Desired API:

- `getInstance(token: string): GitHubService`
  - Always returns the same cached instance.
  - If an instance already exists and a different token is passed, either ignore explicitly with documentation or preferably throw a clear error to avoid silently using the wrong token.
- `newInstance(token: string): GitHubService`
  - Always creates a fresh `GitHubService`.
  - Used by tests or advanced callers that explicitly need isolation.
- `resetInstance(): void`
  - Test-only helper.

Suggested naming:

- File: `packages/core/src/github-service/gitHubServiceProvider.ts`
- Exports:
  - `getGitHubServiceInstance`
  - `newGitHubServiceInstance`
  - `resetGitHubServiceInstance`

Avoid the word `factory` unless the method always creates a new object.

2. Move more logic out of `.github/actions/*`

Current issue:
There is too much logic in:

- `.github/actions/sync-branches/src/main.ts`
- `.github/actions/create-release-pr/src/main.ts`
- `.github/actions/*/src/inputValidator.ts`
- `.github/actions/*/src/types.ts`

The action layer currently resolves repo context, validates domain inputs, builds orchestration requests, creates services, and maps validated input types. This is too much for the GitHub Actions adapter.

Refactor target:

`.github/actions/<action>/src` should only contain:

- `inputReader.ts`
  - Reads raw strings from `@actions/core`.
- `main.ts`
  - Calls a shared runner/helper.
  - Handles top-level `core.setFailed`.
- `outputWriter.ts`
  - Writes outputs using `core.setOutput`.
- Minimal action-specific wiring only if absolutely required.

Move these into shared code:

- Input validation and normalization.
- Raw input type definitions where they are not GitHub Actions-specific.
- Mapping from validated input to use-case request.
- Repo parsing from `owner/repo`.
- Service composition where possible.
- Common logger adapter if it remains duplicated.
- Common action runner pattern.

3. Add reusable shared action-support modules

Create shared modules so every future action does not copy the same patterns.

Suggested structure:

```text
packages/core/src/
  actions/
    syncBranches/
      syncBranches.ts
      validateSyncBranchesInputs.ts
      types.ts
    createReleasePr/
      createReleasePr.ts
      validateCreateReleasePrInputs.ts
      types.ts
  github-service/
    gitHubServiceProvider.ts
    parseRepoRef.ts
  utils/
    validation/
    result/
    errors/
```

If you need code that depends on `@actions/core`, do not put that in portable `packages/core`. Instead create a small internal runtime package, for example:

```text
packages/github-actions-runtime/
  src/
    ActionsLogger.ts
    runAction.ts
    readRepoFromEnvironment.ts
```

But keep this package clearly separate from portable business logic.

4. Keep `packages/core` portable

`packages/core` should be usable outside GitHub Actions.

Allowed in `packages/core`:

- Domain use cases.
- GitHub service interfaces.
- Octokit implementation if intentionally treated as a reusable GitHub API adapter.
- Validation helpers.
- Repo/ref/branch/PR/commit types.
- SFDX service interfaces.

Not allowed in `packages/core`:

- `@actions/core`
- GitHub Actions env access as a hard dependency.
- `core.getInput`
- `core.setOutput`
- `core.setFailed`

If repo parsing is needed, implement a pure helper:

```ts
parseRepoRef(value: string): RepoRef
```

Then the action adapter can do:

```ts
parseRepoRef(process.env.GITHUB_REPOSITORY ?? '')
```

5. Avoid duplicated action adapter code

Currently `ActionsLogger` is duplicated in both actions:

- `.github/actions/sync-branches/src/logger.ts`
- `.github/actions/create-release-pr/src/logger.ts`

Move it to shared runtime support or another shared adapter utility. Do not copy this into every action.

6. Simplify action `main.ts`

Current `main.ts` files contain `RunDeps`, `resolveRepo`, `execute`, and orchestration request building.

Refactor toward something like:

```ts
export async function run(): Promise<void> {
  await runGitHubAction({
    readInputs,
    validateInputs: validateSyncBranchesActionInputs,
    execute: runSyncBranchesAction,
    writeOutputs,
  });
}
```

Where the real `validateSyncBranchesActionInputs` and `runSyncBranchesAction` live in shared modules.

7. Remove unnecessary action dependencies

The action packages currently depend on `@octokit/rest` directly:

- `.github/actions/sync-branches/package.json`
- `.github/actions/create-release-pr/package.json`

If the action source does not directly import Octokit, remove `@octokit/rest` from action package dependencies. Keep it only where the concrete Octokit implementation lives.

8. Fix validation gate

`npm run all` currently fails at Prettier format check.

Fix formatting in all reported files, then run:

```bash
npm run all
```

Do not stop at typecheck/test passing. The full gate must pass.

Current validation status:

- `npm run typecheck:all`: passes.
- `npm run lint`: passes with one warning.
- `npm run test:all`: passes.
- `npm run all`: fails because Prettier reports 13 files with formatting issues.

9. CI actionlint should not be best-effort

Current CI uses `continue-on-error: true` for actionlint.

Make actionlint fail CI unless there is a documented reason not to. This repo is specifically a shared GitHub Actions repository, so workflow/action linting should be strict.

10. Keep tests and coverage strong

After refactoring:

- Preserve or improve current Jest coverage.
- Add/update tests for:
  - new GitHub service instance provider
  - token mismatch behavior
  - `newInstance`
  - `resetInstance`
  - moved input validators
  - moved repo parsing
  - shared action runner/helper
- Rebuild bundled `dist/index.js` files.
- Verify `npm run all` passes.

Expected outcome:

- `.github/actions/*/src` becomes a thin GitHub Actions adapter.
- `packages/core` owns portable business logic, validation, typed use cases, and reusable services.
- Singleton service creation has clear `getInstance` and `newInstance` semantics.
- No duplicated logger/runtime helper code across actions.
- Full validation passes.
```
