# Architecture

Two independent layerings, easy to confuse:

1. **The pipeline layering (L1–L4)** — how actions, workflows and consumers
   compose. Described below.
2. **The code layering inside a TypeScript action** — orchestrator, validator,
   service, client, selector. Described under
   [TypeScript actions](#typescript-actions).

## Pipeline layers L1–L4

| Layer | Lives in | Contract |
|---|---|---|
| **L1** capability actions | `.github/actions/<name>/` | **One** Salesforce/CLI operation each. No branching between operations, no knowledge of *why* they were invoked. Idempotent wherever the underlying `sf` command allows. |
| **L2** reusable workflows | `.github/workflows/sf-*.yml` (`workflow_call`) | Compose L1 into a pipeline with business meaning. Typed inputs/outputs, `secrets:` declared explicitly. Never triggered directly by a human or by Salesforce. |
| **L3** dispatch | `.github/workflows/reusable-sf-ops-dispatch.yml` | The single external entry point. Validates a request from Salesforce, routes it to exactly one L2/L1 path, reports the terminal status back. |
| **L4** consumers | the app repo (`sf-develop-demo`) | Thin `uses:` callers on push/PR/tag/dispatch. Out of this repo except for the contract they must honour. |

Rules that keep the layers apart:

- **L1 never calls L1.** A capability action that only picks between two other
  actions is a routing decision wearing an action's clothes; it belongs in L2 or
  L3.
- **L3 inlines no Salesforce logic.** If the dispatcher needs to know something
  about a package, that is an L1 action.
- **No pass-through layer.** A workflow that forwards its inputs unchanged is not
  a layer.
- **Nesting is capped at 4.** L4 → L3 → L2 → (action) already spends three.
- Composite actions have **no `secrets` context** — secrets must arrive as
  inputs.

### The Salesforce ops chain

```text
L4  sf-develop-demo/.github/workflows/sf-ops.yml
      on: repository_dispatch [sf_ops_requested] + workflow_dispatch
      run-name: carries the correlation id (a called workflow's run-name is ignored)
        │  uses:
        ▼
L3  reusable-sf-ops-dispatch.yml   (workflow_call)
      concurrency: sf-ops-<correlation-id>, cancel-in-progress: false
      │
      ├─ normalize              Tier 2 github-script — the only reader of untrusted input
      ├─ create-version   ────► L2 reusable-sf-package-release.yml ─► L1 sf-org-login, sf-org-scratch-create,
      │                                                        sf-package-create
      ├─ create-version-dry-run
      ├─ promote          ────► L1 sf-org-login → sf-package-promote      [environment gate]
      ├─ install          ────► L1 sf-org-login → sf-package-install      [environment gate]
      └─ report (needs: all, if: always())
                          ────► L1 sf-org-login → sf-ops-callback → Apex REST
                                then exits non-zero unless the status is `succeeded`
```

Why it is shaped this way — entry points, routing, the round trip, idempotency
and authorization — is recorded in
[ADR 0001](adr/0001-salesforce-dispatch-layer.md). The request/response contract
the Salesforce side codes against is
[consuming-sf-dispatch.md](consuming-sf-dispatch.md).

Two properties are worth restating because they are what the design is for:

- **A skipped job is green.** An operation matching no route would therefore
  report success. `report` needs every route and fails the run when none of them
  ran.
- **Both dispatch APIs return 204 with no body.** The requester never learns a
  run id, so the run reports back rather than being polled.

## TypeScript actions

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

### Code layer rules (inside one TypeScript action)

Not to be confused with L1–L4 above: these govern the classes within a single
action.

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
  real filesystem for sf-apex-test-select) and asserts the committed bundle exists.
  Run by `test:integration`, chained into the package `test` script.

## CI

`ci.yml` runs the full gate (`format:check`, `lint`, `typecheck:all`,
`bundle:all`, `test:all`, `dist:verify`, actionlint) plus a **smoke job** that
executes every TypeScript action from its committed `dist` on a real runner —
proving `action.yml` wiring, bundle integrity, and output names.
