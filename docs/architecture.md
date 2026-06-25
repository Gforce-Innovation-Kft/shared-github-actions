# Architecture

This repo is an npm-workspaces monorepo with three layers: a portable,
GitHub-Actions-agnostic TypeScript **core**, a small **runtime** package that
owns everything `@actions/*`-specific, and the thin **action adapters** that wire
them together for the runner.

```
packages/core                      # portable business logic + GitHub service (no @actions/*)
packages/github-actions-runtime    # @actions/core adapter: logger, repo-from-env, runGitHubAction
.github/actions/sync-branches      # thin adapter -> @gforce/core + @gforce/github-actions-runtime
.github/actions/create-release-pr  # thin adapter -> @gforce/core + @gforce/github-actions-runtime
```

## Layers and the dependency rule

```
action adapter  ->  @gforce/github-actions-runtime (@actions/core, env)  ->  @gforce/core (use cases, services, utils)
                \------------------------------------------------------>  @gforce/core
```

The rule, enforced by direction: **`packages/core` never imports `@actions/core`
or any runner API.** It may depend on `@octokit/rest` (a portable npm library).
Everything runtime-specific — reading the repo from `GITHUB_REPOSITORY`, logging
to the Actions UI, the top-level read/validate/execute/fail loop — lives in
`@gforce/github-actions-runtime`. Logging crosses the boundary through the
`Logger` port; the runtime supplies an `@actions/core`-backed implementation.
Pure helpers that the runtime needs (e.g. `parseRepoRef('owner/repo')`) stay in
core; only the environment access (`process.env.GITHUB_REPOSITORY`) lives in the
runtime.

## Per-domain services + one wrapper per API operation

Every external GitHub call is wrapped **exactly once** as a typed method on a
per-domain service **port**, implemented **only** by its `Octokit*Service` (the
only modules that touch `@octokit/rest`). The ports mirror the type layout:

| Domain (module)        | Port                  | Wrapper(s)                                                     |
| ---------------------- | --------------------- | -------------------------------------------------------------- |
| `branch/`              | `BranchService`       | `compareBranches`, `getBranchHeadSha`, `updateBranchRef`, `mergeBranches` (maps `409` -> `conflict`) |
| `pull-request/`        | `PullRequestService`  | `listOpenPullRequests`, `createPullRequest`, `updatePullRequest`, `addLabels`, `requestReviewers` |
| `action/`             | `ActionsService` (stub) | `dispatchWorkflow` (reserved — no impl yet)                  |

`github/gitHubService.ts` defines the **facade** `GitHubService extends
BranchService, PullRequestService` and `github/octokitGitHubService.ts` composes
the per-domain services, delegating each method. Use cases (`syncBranches`,
`createReleasePr`) and adapters depend on the facade, never a raw client, so the
same wrapper is reused across actions. A new action is assembled from existing
wrappers; a new domain adds a `*Service` port + `Octokit*Service` and folds into
the facade.

### Singletons (static instance methods) + one shared client

Each service owns its own lifecycle through the same static trio
(`getInstance(token)` cached / `newInstance(token)` isolated / `resetInstance()`
test-only); `getInstance` throws on a token mismatch rather than acting under the
wrong identity. To keep a **single rate-limit budget**, the one authenticated
`Octokit` is owned by a `client/GitHubClient` singleton:

- `GitHubClient.getInstance(token)` builds the client once; every
  `Octokit*Service.getInstance(token)` wraps that same client.
- `OctokitGitHubService.getInstance(token)` composes the branch + PR singletons,
  so one client backs the whole facade.
- `*.newInstance(token)` builds an isolated client (the facade's `newInstance`
  shares one fresh client across its sub-services).

Every constructor stays injectable (`new OctokitBranchService(octokit)`,
`new OctokitGitHubService(branch, pulls)`), so tests pass fakes. The runtime's
`runGitHubAction` calls `OctokitGitHubService.getInstance` when no service
override is supplied.

## Result and errors

Use cases return `Result<T, AppError>` (`ok` / `err`) rather than throwing across
the boundary. The `Octokit*Service`s wrap API failures in `GitHubApiError` (via
the shared `client/octokitSupport` helper; `ValidationError`/`AppError` for the
rest). The adapter turns an `err` into `core.setFailed`.

## The adapter template

Each action adapter is reduced to four runtime-bound pieces; everything reusable
(validation, input/output types, validated->request mapping, repo parsing,
service composition, the run loop) lives in `@gforce/core` or
`@gforce/github-actions-runtime`:

```
src/
  index.ts        # ncc entry: builds the GitHubActionDefinition, run(), and a
                  #   `require.main === module` guard that calls run() only when
                  #   executed as the action (not when imported by tests)
  inputReader.ts  # @actions/core getInput -> Raw*Inputs (type from core)
  outputWriter.ts # result -> core.setOutput (kebab-case)
```

`index.ts` is declarative — it names the four collaborators and delegates the loop:

```ts
export const syncBranchesAction = {
  readInputs,                              // local: @actions/core getInput
  validateInputs: validateSyncBranchesInputs, // core: Raw -> Validated
  execute: runSyncBranchesAction,          // core: Validated + ActionContext -> Result
  writeOutputs,                            // local: core.setOutput
};

export function run(overrides?: Partial<ActionContext>): Promise<void> {
  return runGitHubAction(syncBranchesAction, overrides);
}
```

`runGitHubAction` (in the runtime package) does `read -> validate -> build
context -> execute -> writeOutputs | setFailed`. It builds the `ActionContext`
(repo from `readRepoFromEnvironment()`, `ActionsLogger`,
`OctokitGitHubService.getInstance(token)`) unless a test passes overrides — which
keeps the whole pipeline runner-free in tests.

## Build, bundle, and the committed `dist`

- **Core is consumed from TypeScript source.** `@gforce/core`'s `main`/`types`/
  `exports` point at `src/index.ts`. It is private and never published, so there
  is no build ordering between core and the actions — ts-jest, `tsc`, and ncc
  all read the latest source. A jest `moduleNameMapper` mirrors this for tests.
- **Each action bundles to a committed `dist/index.js`** via `@vercel/ncc`
  (self-contained: core + octokit inlined). GitHub runs `dist/index.js`, so it
  **must** be committed and current. `.gitignore` ignores `packages/*/dist` but
  keeps `.github/actions/*/dist`. The pre-commit hook rebuilds and re-stages the
  bundle; CI's `dist:verify` (`git diff --exit-code`) fails on a stale bundle.

## Testing and coverage

- **Per-package** 90% threshold (branches/functions/lines/statements) — weak
  action or runtime coverage can't hide behind a global number. The actions and
  the runtime package report 100% across the board; core reports 100%
  statements/functions/lines.
- Coverage requires `sourceMap: true` in `tsconfig.base.json`: with
  `isolatedModules`, ts-jest injects helper code (e.g. `__importStar` for
  `import * as core`) at the top of the emitted JS. Without source maps istanbul
  reports the **emitted** line numbers and mis-maps coverage. Source maps map it
  back to the original `.ts`.
- All tests mock GitHub — no network, no runner. `__integration__/` drives each
  action end-to-end through `run()` (real read/validate/execute/write via
  `runGitHubAction`) against an in-memory fake service injected as a context
  override, and asserts the committed bundle exists.

## Future-work stubs

`git-service/` and `sfdx-service/` are **interface + type declarations only** (no
runtime code, excluded from coverage). They document where a local-git or SFDX
wrapper would live for future actions, following the same port/adapter shape.
