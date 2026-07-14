# Architecture

The TypeScript actions follow a strict, class-based, singleton, MVC-style
architecture. All implementation lives in **`gforce-gha-src/`** (the single
source of truth); the only `.ts` file outside it is each action's entry point.
The full design record is
[docs/superpowers/specs/2026-07-14-strict-singleton-actions-architecture-design.md](superpowers/specs/2026-07-14-strict-singleton-actions-architecture-design.md).

```text
.github/actions/
  package.json                 # build:all orchestration (NOT a nested workspace root)
  tsconfig.json                # shared strict TS config for action entries
  jest.config.js               # shared Jest config for entry packages (--passWithNoTests)
  <action-name>/
    action.yml                 # inputs, outputs, permissions notes, runs
    index.ts                   # entry ONLY: getInput -> Orchestrator.execute -> setOutput/setFailed
    package.json               # @gforce/<action-name>: esbuild build, file: dep on gforce-gha-src
    dist/index.js              # committed esbuild bundle (GitHub runs this)

gforce-gha-src/
  actions/<action-name>/       # per-action controllers
    orchestrator.ts            # Orchestrator singleton — execute() as numbered delegated steps
    validator.ts               # Validator singleton — inputValidation()
  clients/github/              # one sub-client per API domain, thin wrappers only
    core/github-client-core.ts # createOctokit + shared-Octokit cache + error mapping (NOT a singleton)
    repos/                     # GitHubBranchesClient + types (BranchComparison, MergeOutcome, ...)
    pull-requests/             # GitHubPullRequestsClient + types
    github-client.ts           # GitHubClient facade — the only client services touch
    index.ts                   # barrel
  libraries/salesforce/        # external-system logic (services/, selectors/, models/, utils/)
  services/                    # generic singleton services shared across actions
  types/index.ts               # shared DTOs (validated inputs, results, RepoRef)
  utils/                       # pure stateless helpers (errors, validation, parse-repo-ref)
  __tests__/                   # mirrors the source tree + __tests__/integration/
```

## Layer rules

| Layer | Allowed | Not allowed |
| --- | --- | --- |
| `index.ts` (entry) | `core.getInput`, `core.setOutput`, `core.setFailed`, one `Orchestrator.getInstance().execute()` call | Business logic, direct service calls, validation |
| Orchestrator | Call Validator, services, simple sequencing | Business rules, transformations, API calls, file I/O |
| Validator | Type/required/format checks, sanitization | External calls, business logic |
| Service | Multi-step workflows, calls to clients, business rules | Direct `octokit.*` calls, `core.getInput`/`setOutput` |
| Client | Wrap one external API (one method per endpoint), own error mapping | Business logic, workflow decisions, logging |
| Selector | Pure read/filter/transform | State mutation, external calls |
| Utils | Pure stateless helpers | State, external calls |

Two services are the sanctioned wrappers for runner APIs: `LoggerService` (the
only `@actions/core` logging call site) and `FileSystemService` (the only
`node:fs` call site). `GithubContextService` is the only reader of runner
environment variables.

## Singletons and the one shared Octokit

Every orchestrator, validator, service, and client is a singleton
(`private static instance` / `getInstance()` / `resetInstance()` for tests).
Token-holding clients extend the shape with a **token guard**:
`getInstance(token)` throws on a token mismatch rather than acting under the
wrong identity, and `newInstance(token)` builds an isolated instance.

To keep a single rate-limit budget, the one authenticated Octokit is cached in
`clients/github/core/github-client-core.ts` (`getSharedOctokit`); every
sub-client's `getInstance` wraps that same instance, and the `GitHubClient`
facade composes the sub-clients. `GitHubClient.resetInstance()` cascades to the
sub-clients and the shared Octokit so test cleanup is one call. Sub-client
constructors stay injectable (tests pass a fake Octokit).

Services reach GitHub only through the facade: new endpoints go on the matching
sub-client (branches/refs → `GitHubBranchesClient`, PRs/reviews →
`GitHubPullRequestsClient`; a new domain gets a new sub-client under
`clients/github/<domain>/`) and are exposed via the facade.

## Errors and outcomes

Throw-based: validators throw `ValidationError`, clients map every API failure
once to `GitHubApiError` (`runOctokit` in `github-client-core`), and the entry
point catches anything into `core.setFailed`. Expected domain outcomes are
**values**, not exceptions — e.g. a 409 merge conflict resolves to
`MergeOutcome = { status: 'conflict' }` and the sync workflow reacts to it.

## Build and the committed `dist`

Each action's `package.json` bundles its `index.ts` with **esbuild**
(`--platform=node --target=node20`) straight into `dist/index.js`, which is
committed (GitHub runs it). The root `bundle:all` script rebuilds every bundle;
the pre-commit hook re-stages `dist` whenever shared source changes; CI's
`dist:verify` (`git diff --exit-code` over `.github/actions/*/dist`) fails on a
stale bundle. `gforce-gha-src` is consumed from TypeScript source via the
`file:` workspace link — there is no separate library build step.

The repo root `package.json` is the **only** npm workspace root (npm does not
support nested roots); `.github/actions/package.json` just holds the
`build:all` orchestration.

## Testing

- All tests live in `gforce-gha-src/__tests__/`, mirroring the source path.
- Naming: `method_scenario_expectedResult`; every body has `// Given`,
  `// When` (exactly one call), `// Then`.
- Mock at the singleton boundary (`jest.spyOn(X.getInstance(), 'method')`);
  never patch `@actions/*`, `fs`, or `@octokit` modules — the owning
  client/service is the exception (client tests inject a fake Octokit through
  the public constructor; `LoggerService`/`FileSystemService` tests touch the
  real module).
- `resetInstance()` in `afterEach` for every singleton used.
- Coverage gate: 95% global on every metric; actual coverage is 100%.
- `__tests__/integration/<name>.integration.test.ts` drives each action's
  `Orchestrator.execute()` end-to-end (clients mocked at the boundary, or the
  real filesystem for sf-find-tests) and asserts the committed bundle exists.
  Run by `test:integration`, chained into the package `test` script.

## CI

`ci.yml` runs the full gate (`format:check`, `lint`, `typecheck:all`,
`bundle:all`, `test:all`, `dist:verify`, actionlint) plus a **smoke job** that
executes every TypeScript action from its committed `dist` on a real runner —
proving `action.yml` wiring, bundle integrity, and output names.
