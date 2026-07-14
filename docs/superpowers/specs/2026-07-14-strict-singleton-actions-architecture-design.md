# Strict Singleton Actions Architecture — Design

Date: 2026-07-14
Status: Approved (user pre-approved plan; interactive section review skipped on request)

## Goal

Restructure the TypeScript GitHub Actions to the strict, class-based, singleton,
MVC-style architecture the user supplied (the "spec prompt"), while keeping the
proven mechanisms of the current implementation. Behavior-preserving: every
`action.yml` interface (inputs, outputs, defaults — including `dry-run: true`)
stays identical; consumers never notice.

## Decisions (from brainstorming Q&A)

1. **Precedence:** spec structure, layer rules, singleton shape, and testing
   conventions are law; current mechanisms that are strictly better and don't
   violate layer rules are kept (see Deviations).
2. **Naming:** `<SRC>` = `gforce-gha-src/` at repo root; `<SCOPE>` = `@gforce`.
3. **Scope:** full migration of all three TS actions (`sync-branches`,
   `create-release-pr`, `sf-find-tests`); `packages/*` deleted at the end.
4. **Approach:** strangler, action-by-action; repo builds green after every phase.

## Target layout

```
.github/actions/
  package.json            # shared scripts (build:all) + shared config holder — NOT a nested workspace root
  tsconfig.json           # shared strict TS config for action entries
  jest.config.js          # shared Jest config for action entry tests (--passWithNoTests)
  <action-name>/          # sync-branches | create-release-pr | sf-find-tests
    action.yml            # unchanged interface
    index.ts              # entry ONLY: getInput → Orchestrator.getInstance().execute() → setOutput/setFailed
    package.json          # @gforce/<action-name>, esbuild build, file:../../../gforce-gha-src dep
    dist/index.js         # committed esbuild bundle
  (composite actions unchanged: get-aws-secret, sf-jwt-login, sf-org-login, sf-delta-package)

gforce-gha-src/
  package.json            # "gforce-gha-src", private
  tsconfig.json           # strict, per spec §11
  jest.config.cjs         # per spec §11; coverageThreshold 95% global
  actions/
    sync-branches/        # orchestrator.ts (Orchestrator singleton), validator.ts (Validator singleton)
    create-release-pr/    # orchestrator.ts, validator.ts
    sf-find-tests/        # orchestrator.ts, validator.ts
  clients/
    github/
      index.ts                                    # barrel
      core/github-client-core.ts                  # OctokitType, createOctokit, isApiError/toGitHubApiError — NOT a singleton
      repos/github-branches-client.ts             # GitHubBranchesClient singleton
      repos/types.ts                              # BranchComparison, MergeOutcome, …
      pull-requests/github-pull-requests-client.ts # GitHubPullRequestsClient singleton
      pull-requests/types.ts                      # ExistingPr, CreatePullRequestParams, …
      github-client.ts                            # GitHubClient facade; owns shared Octokit + token guard
  libraries/
    salesforce/
      services/apex-test-selection-service.ts     # ApexTestSelectionService singleton
      selectors/                                  # pure test-name matching / reference-scan selectors
      utils/                                      # package.xml member parsing helpers
  services/
    logger-service.ts          # LoggerService — the ONE @actions/core logging wrapper
    github-context-service.ts  # GithubContextService — repo from GITHUB_REPOSITORY
    file-system-service.ts     # FileSystemService — recursive source reads (from nodeSourceFileReader)
    branch-sync-service.ts     # BranchSyncService — sync-branches business workflow
    release-pr-service.ts      # ReleasePrService — create-release-pr business workflow
  types/index.ts               # shared DTOs (per-action input/result types re-exported)
  utils/
    errors.ts                  # AppError, ValidationError, GitHubApiError
    validation.ts              # required/enum/boolean-ish parse helpers
    parse-repo-ref.ts          # 'owner/repo' → { owner, repo }
  __tests__/                   # mirrors source; plus __tests__/integration/ (excluded from unit run)
```

## Code mapping (old → new)

| Current | New |
| --- | --- |
| `packages/core/src/github-service/client/gitHubClient.ts` + `octokitSupport.ts` | `clients/github/core/github-client-core.ts` (helpers) + facade lifecycle in `clients/github/github-client.ts` |
| `branch/branchService.ts` (`OctokitBranchService`) | `clients/github/repos/github-branches-client.ts` (`GitHubBranchesClient`) |
| `pull-request/pullRequestService.ts` (`OctokitPullRequestService`) | `clients/github/pull-requests/github-pull-requests-client.ts` (`GitHubPullRequestsClient`) |
| `github/gitHubService.ts` (`OctokitGitHubService` facade) | `clients/github/github-client.ts` (`GitHubClient` facade, delegates to sub-clients) |
| `actions/syncBranches/syncBranches.ts` (use case) | `services/branch-sync-service.ts` |
| `actions/syncBranches/validateSyncBranchesInputs.ts` | `actions/sync-branches/validator.ts` |
| `actions/createReleasePr/createReleasePr.ts` | `services/release-pr-service.ts` |
| `actions/createReleasePr/validateCreateReleasePrInputs.ts` | `actions/create-release-pr/validator.ts` |
| `actions/findRelevantTests/findRelevantTests.ts` | `libraries/salesforce/services/apex-test-selection-service.ts` (+ selectors/utils) |
| `actions/findRelevantTests/nodeSourceFileReader.ts` | `services/file-system-service.ts` |
| `actions/findRelevantTests/validateFindTestsInputs.ts` | `actions/sf-find-tests/validator.ts` |
| `packages/github-actions-runtime` (`runGitHubAction`, `ActionsLogger`, `readRepoFromEnvironment`) | dissolved: entry template per spec §6; `services/logger-service.ts`; `services/github-context-service.ts` |
| `packages/github-actions/src/<name>/{index,inputReader,outputWriter}.ts` | `.github/actions/<name>/index.ts` (single plain `run()`) |
| `packages/core/src/utils/{errors,validation}` | `gforce-gha-src/utils/` |
| `packages/core/src/utils/result/result.ts` | retired (see Error handling) |
| `git-service/`, `sfdx-service/` stubs | dropped (YAGNI; recreate under `clients/` when a real need appears) |

## Idioms

**Singleton shape.** Spec §4 trio (`private static instance`, `getInstance`,
`resetInstance`). Deviation kept from current code: token-holding classes
(`GitHubClient` facade and sub-clients) use `getInstance(token)` with the
token-mismatch guard (throws `ValidationError`) plus `newInstance(token)` for
isolated instances; stateless orchestrators/validators/services use the literal
spec shape. Constructors stay `private` except where injection is needed for
`newInstance`.

**Error handling.** Throw-based per spec: `Validator.inputValidation()` throws
`ValidationError`; clients map API failures once to `GitHubApiError` (409 →
`'conflict'` stays a *value*, `MergeOutcome`, not an exception); services throw
domain errors; `index.ts` catches → `core.setFailed`. The `Result<T, E>` utility
is retired — domain outcomes remain discriminated unions on return types.

**Logging.** Clients never log (spec §3). `LoggerService` wraps `@actions/core`
logging and is the only `core.*` logging call site; orchestrators/services use it.

**Orchestrators.** Numbered delegated steps only (spec §5). Example
(sync-branches): 1. `Validator.inputValidation` → 2. `GithubContextService.getRepo`
→ 3. `BranchSyncService.sync` → return outputs. All branching/looping lives in
the services.

**No artifact-uploader files yet** — none of the three actions uploads
artifacts. `artifact-uploader.ts` is added per action when a real need appears.

## Testing

- All tests in `gforce-gha-src/__tests__/`, mirroring source paths.
- Naming `method_scenario_expectedResult`; mandatory `// Given` / `// When`
  (exactly one call) / `// Then` sections.
- Mock at the singleton boundary: `jest.spyOn(X.getInstance(), 'method')`;
  never mock `@actions/*`/`fs`/`@octokit` modules directly — except inside the
  client/service that *owns* that module (client tests use an injected fake
  Octokit via `newInstance`).
- `resetInstance()` in `afterEach` for every singleton touched.
- Spy assertions always via `toHaveBeenCalledWith`; typed errors via
  `toBeInstanceOf` + `toThrow('<message>')`.
- Coverage: global 95% threshold (spec §10); actual target 100% (current level).
- Integration tests preserved as a good part: `__tests__/integration/<name>.integration.test.ts`
  drives `Orchestrator.execute()` end-to-end with clients mocked at the boundary
  and asserts the committed bundle exists; excluded from the unit run
  (`testPathIgnorePatterns`), run via `test:integration`.

## Build, workspaces, CI

- **Single npm workspace root** stays the repo root `package.json`:
  `workspaces: ["gforce-gha-src", ".github/actions/sync-branches", ".github/actions/create-release-pr", ".github/actions/sf-find-tests"]`
  (enumerated — composite action dirs have no `package.json`).
- Per-action `package.json` per spec §11: esbuild bundle (`--platform=node
  --target=node20`), `--passWithNoTests` test script, `typecheck -p ../tsconfig.json`,
  `"gforce-gha-src": "file:../../../gforce-gha-src"`.
- `.github/actions/package.json` holds `build:all` (spec §12) but is **not** a
  nested workspace root.
- esbuild replaces ncc. `dist:verify` (git-diff glob over `.github/actions/*/dist`)
  and the pre-commit rebuild hook stay, paths updated.
- Root `npm run all` keeps the same gate: format + lint + typecheck + bundle +
  test + dist:verify.
- CI (`ci.yml`): same jobs, updated workspace/bundle paths; smoke runs unchanged
  (`.github/actions/<name>` paths and interfaces are stable).

## Deviations from the spec prompt (agreed)

1. **ESLint:** keep flat `eslint.config.mjs` (eslint 9) instead of legacy
   `.eslintrc.cjs`; enforce the same rules (`no-explicit-any`,
   `explicit-function-return-type`, `no-console`, no non-null assertions,
   type-checked recommended set).
2. **Prettier:** keep the existing root Prettier config (single source for the
   whole repo) rather than a `<SRC>`-local `.prettierrc`.
3. **Workspace root:** root `package.json` remains the only workspace root; npm
   does not support nested workspace roots.
4. **Token-guarded `getInstance(token)`** on GitHub clients (kept from current
   code) instead of parameterless `getInstance()` + separate `init(token)`.
5. **Jest:** ts-jest per spec; `.github/actions/jest.config.js` exists for the
   spec-mandated per-action `test` script but entry tests live with integration
   tests in `<SRC>` — per-action `test` passes via `--passWithNoTests`.

## Migration phases (strangler)

- **Phase 0 — skeleton + clients:** `gforce-gha-src` package (tsconfig, jest,
  package.json), `utils/`, `types/`, `clients/github/*` (ported from
  `github-service`), `services/logger-service.ts`, `services/github-context-service.ts`,
  workspace rewire, esbuild dev-dep. Old packages untouched; `npm run all` green.
- **Phase 1 — sync-branches:** validator + `BranchSyncService` + orchestrator +
  entry `index.ts` + esbuild bundle + tests (new conventions) + integration test;
  delete `packages/*` sync-branches code/tests.
- **Phase 2 — create-release-pr:** same shape (`ReleasePrService`).
- **Phase 3 — sf-find-tests:** `libraries/salesforce/*` + `FileSystemService`;
  same shape.
- **Phase 4 — teardown:** delete `packages/*` + runtime, update root scripts,
  pre-commit hook, `ci.yml`, `docs/architecture.md`,
  `docs/typescript-action-authoring.md`, `CLAUDE.md`.

Each phase ends with `npm run all` green and freshly committed bundles.
