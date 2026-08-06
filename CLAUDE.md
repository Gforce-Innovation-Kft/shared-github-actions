# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Reusable GitHub Actions for `Gforce-Innovation-Kft`: **TypeScript actions** (a
strict, class-based singleton architecture with a single shared source tree),
**composite actions**, and **callable workflows** for Salesforce CI/CD pipelines.

## Naming convention

Recorded in [ADR 0002](docs/adr/0002-naming-and-repo-structure.md). Two rules:

- **Actions** are `<domain>-<object>-<verb>`, domain ∈ `sf` · `aws` · `github` · `git`.
  So `sf-package-create`, `aws-secret-get`, `github-branch-sync`. Never verb-first.
- **Workflows** whose trigger is `workflow_call` are `reusable-<domain>-<name>.yml`.
  Anything unprefixed is this repo's own CI (`ci.yml`, `release.yml`,
  `ci-sf-ops-dispatch-smoke.yml`). GitHub forbids subdirectories under
  `.github/workflows/`, so the name is the only available separator.

## Before you change ANY action or workflow: check the usage catalog

Everything here is consumed by other repositories, so a change is never local.
[`docs/usage-catalog.md`](docs/usage-catalog.md) lists every known consumer of every
action and reusable workflow — repo, file, and the ref it is pinned to. There is a
machine-readable twin at [`docs/usage-catalog.json`](docs/usage-catalog.json).

**Required before renaming or removing an input, output, or file, and before
changing a default:**

1. Read the catalog entry for the asset you are touching.
2. Note the **pinned ref** of each consumer. `@develop` consumers break the moment
   you push; `@v1` consumers are insulated until a release re-points them.
3. If the catalog shows no consumers, confirm with the human — the scan covers
   default branches in this org only, so a consumer on a feature branch is
   invisible. Its "Scope and limitations" section spells out what it cannot see.
4. Regenerate after adding a consumer: `./.github/scripts/build-usage-catalog.sh`
   (needs `gh` + `jq`). CI refreshes it weekly via `catalog-refresh.yml`.

A default is a breaking change when the old behaviour was load-bearing. Changing
`container-user` from `root` to `1001`, for instance, breaks every consumer whose
image lacks a passwd entry for UID 1001 — which is why that flip waits on
sf-docker-images v3.0.0.

## Reference Pattern

From other repos, reference items using:
- Composite / TypeScript actions: `Gforce-Innovation-Kft/shared-github-actions/.github/actions/<action-name>@v1`
- Reusable workflows: `Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-<name>.yml@v1`

`v1` is frozen at the pre-rename layout, so existing consumers keep working. The
renamed actions land in the next major tag.

**Self-references inside a reusable workflow** must be absolute — a `./` ref
resolves against the *caller's* repo, not this one. They are pinned to
`@develop` until a release is cut; rewriting them to `@vX` is a release step
(ADR 0002, decision 6).

## Pipeline Layers (L1–L4)

> **Start here for the whole system:** [`docs/pipeline-map.md`](docs/pipeline-map.md)
> — flow diagrams of every layer, the dispatch chain, and what is still missing.
> Its tables are also in [`docs/sf-cicd-pipeline-map.xlsx`](docs/sf-cicd-pipeline-map.xlsx).
> The diagrams are mermaid, so editing them is how to specify a change.

Do not confuse this with the *code* layering inside a TypeScript action — that is
a separate thing, documented in `docs/architecture.md`.

| Layer | Lives in | Contract |
|---|---|---|
| **L1** | `.github/actions/<name>/` | **One** Salesforce/CLI operation each. No branching between operations, no knowledge of why it was invoked. |
| **L2** | `.github/workflows/reusable-sf-*.yml` (`workflow_call`) | Composes L1 into a pipeline with business meaning. Typed inputs/outputs, explicit `secrets:`. Never triggered by a human or by Salesforce. |
| **L3** | `.github/workflows/reusable-sf-ops-dispatch.yml` | The single external entry point for Salesforce. Validates, routes to exactly one L2/L1 path, reports the result back. |
| **L4** | consumer repos | Thin `uses:` callers. Not in this repo. |

Rules: **L1 never calls L1** (an action that only picks between two other actions
is routing, and belongs in L2/L3); **L3 inlines no Salesforce logic**; no
pass-through layer that forwards inputs unchanged; workflow nesting caps at 4 and
L4→L3→L2→action already spends three. Composite actions have **no `secrets`
context** — secrets arrive as inputs.

## TypeScript Actions (strict singleton architecture)

All implementation lives in **`gforce-gha-src/`** — the only `.ts` file outside
it is each action's entry point.

| Path | Role |
|------|------|
| `gforce-gha-src/actions/<name>` | Per-action `Orchestrator` singleton (`execute()` = numbered delegated steps) + `Validator` singleton (`inputValidation()`). |
| `gforce-gha-src/clients/github` | Sub-clients (`GitHubBranchesClient`, `GitHubPullRequestsClient`) + `GitHubClient` facade; one thin wrapper per endpoint, error mapping only. |
| `gforce-gha-src/services` | Shared singleton services: business workflows (`BranchSyncService`, `ReleasePrService`) + the sanctioned runner-API wrappers (`LoggerService`, `FileSystemService`, `GithubContextService`). |
| `gforce-gha-src/libraries/salesforce` | Salesforce logic: `ApexTestSelectionService`, pure selectors, `package.xml` parsing, models. |
| `gforce-gha-src/{types,utils,__tests__}` | Shared DTOs, pure helpers, and ALL tests (mirroring source; `__tests__/integration/` drives orchestrators end-to-end). |
| `.github/actions/<name>` | `action.yml` + entry `index.ts` (getInput → `Orchestrator.execute` → setOutput/setFailed, zero logic) + per-action `package.json` + committed esbuild `dist/index.js`. |

Every class is a singleton (`getInstance` / `resetInstance`; token-holding
clients add a token-mismatch guard and `newInstance`). One shared Octokit backs
all sub-clients (single rate-limit budget); services only ever touch the
`GitHubClient` facade. Errors are throw-based (`ValidationError`,
`GitHubApiError`) and caught in the entry; expected outcomes (e.g. merge
conflict) are typed values. Tests: `method_scenario_expectedResult` naming,
Given/When/Then, mock at the singleton boundary, 95% coverage gate (100%
actual).

### `github-branch-sync`
Fast-forward / merge / open a sync PR on conflict. `dry-run` defaults to `true`.
Caller permissions: `contents: write` + `pull-requests: write`.

### `github-release-pr-create`
Create or update a release PR (templated body, labels, reviewers). `dry-run`
defaults to `true`. Caller permissions: `contents: read` + `pull-requests: write`.

### `sf-apex-test-select`
Select the Apex test classes relevant to a delta `package.xml` —
naming-convention matches plus a reference scan of the source tree. Inputs:
`package-xml` (required), `source-dir` (default `force-app`),
`test-suffixes` (default `Test,_Test,Tests`). Outputs: `tests`, `test-count`,
`has-apex`. Makes no GitHub API calls — `github-token` exists only for the
shared action runtime; no caller permissions required.

**Adding an action:** follow `docs/typescript-action-authoring.md`; the design
rationale is in `docs/architecture.md`. **Before any PR, run `npm run all`**
(format + lint + typecheck + bundle + test + `dist:verify`) and ensure it passes.

## Composite Actions

### `aws-secret-get` (`.github/actions/aws-secret-get/action.yml`)

Fetches a secret from AWS Secrets Manager using OIDC role assumption. Parsed JSON secret fields are set as environment variables. Requires caller permissions `id-token: write` + `contents: read`.

**Inputs:** `aws-region` (default `eu-central-1`), `secret-name`, `aws-role-arn`
**Outputs:** None declared. Secret fields are exposed as env vars (e.g. `$JWT_KEY_B64`, `$USERNAME`, `$CLIENT_ID`, `$INSTANCE_URL`); reference them as `${{ env.FIELD }}` in later steps, not as step outputs.

### `sf-org-login` (`.github/actions/sf-org-login/action.yml`)

The single login action — **two credential sources, one contract**. `auth-method: auth-url` (default) runs `sf org login sfdx-url` from a GitHub secret, no cloud dependency. `auth-method: jwt` runs `aws-secret-get`, decodes the base64 key, and runs `sf org login jwt`. Both end with the same authenticated `sf` CLI under `org-alias`, so downstream actions never branch on how the job authenticated. Inputs are validated before any credential file is written; every credential file is removed in an `if: always()` step. JSON parsing uses `node` (not `jq`) so it works inside any container that has the SF CLI.

**Inputs (shared):** `auth-method` (`auth-url` | `jwt`, default `auth-url`), `org-alias` (default `target`), `set-default` (default `false`), `set-default-dev-hub` (default `false`)
**Inputs (`auth-url`):** `sfdx-auth-url` (required for this method — always a secret)
**Inputs (`jwt`):** `aws-role-arn` (required for this method), `aws-region` (default `eu-central-1`), `secret-name` (default `salesforce/gabor-devhub`)
**Outputs:** `org-id`, `username`, `instance-url`, `access-token` (masked with `::add-mask::` before it is written — for actions that call the Salesforce APIs directly instead of shelling out to `sf`)
**Caller permissions:** none for `auth-url`; `id-token: write` + `contents: read` for `jwt`
**Expected AWS secret JSON fields (`jwt`):** `JWT_KEY_B64`, `USERNAME`, `CLIENT_ID`, `INSTANCE_URL`.

> Replaced the separate `sf-jwt-login` action. Migrate by calling `sf-org-login`
> with `auth-method: jwt` and stating `org-alias`/`set-default-dev-hub`
> explicitly — the merged action defaults to `target`/`false`, not the old
> `devhub`/`true`.

### `sf-source-delta` (`.github/actions/sf-source-delta/action.yml`)

Generates a delta `package.xml` between two git refs with sfdx-git-delta (installs the plugin on the fly when missing; preinstalled in `gforceinnovation/sf-ci`). Writes a component table to the step summary and `<output-dir>/components.md`. Requires a `fetch-depth: 0` checkout so both refs resolve.

**Inputs:** `from-ref` (required), `to-ref` (default `HEAD`), `output-dir` (default `delta`), `source-dir` (default `force-app`), `generate-delta` (default `false`)
**Outputs:** `package-path`, `has-changes`, `component-count`

### `sf-package-create` (`.github/actions/sf-package-create/action.yml`)

Creates **one** 2GP package version: resolves the package from `sfdx-project.json`, refuses to
start unless the Dev Hub has headroom, runs `sf package version create`, and on failure queries
`Package2VersionCreateRequestError` so Salesforce's own message lands in the job log.

It does **not** tag the commit. Creating a version is a Salesforce operation; tagging the commit
that produced it is a git one, and bundling them forced `contents: write` on every caller that
only wanted a version. `reusable-sf-package-release.yml` pushes the annotated
`pkg/<package>/<versionNumber>` tag instead — see [ADR 0002](docs/adr/0002-naming-and-repo-structure.md),
decision 4.

Preflight checks the limit the run will actually spend: `Package2VersionCreates` (6/day) normally,
`Package2VersionCreatesWithoutValidation` (500/day) when `skip-validation` is true — checking the
wrong one blocks a build against quota it never consumes.

**Inputs:** `package` (falls back to the single or `default: true` entry), `dev-hub-alias` (default `devhub`), `wait-minutes` (default `60`), `code-coverage` (default `true` — set `false` for packages with no Apex tests), `skip-validation`, `branch` (empty ⇒ flag omitted; see below), `installation-key` (empty ⇒ `--installation-key-bypass`), `preflight-min-headroom` (default `2`), `evidence-path`
**Outputs:** `package-name`, `version-id` (`04t`), `package-version-id` (`05i`), `version-number`, `request-id` (`08c`), `status`
**Caller permissions:** `contents: read`

It does **not** resolve dependency order or install anything — callers own that. `wait-minutes` is
a hard ceiling: if the build is still running when it expires the step fails and prints the
`sf package version create report` command to resume, rather than waiting a second time.

`branch` is a trap, hence the default of empty: `--branch` does not merely label a version, it
scopes **dependency resolution** to that branch, so a package whose dependencies resolve via
`x.y.z.LATEST` fails with `NoReleaseVersionFoundForBranchError` unless those dependencies were
also built on the same branch.

It currently hardcodes `--tag "$GITHUB_SHA"`. Making that an input is what unlocks
`create-version` idempotency for the dispatcher — `Package2Version.Tag` is queryable, so a
preflight SOQL can short-circuit a retried request without spending a quota slot. See
[ADR 0001](docs/adr/0001-salesforce-dispatch-layer.md), decision 4.

### `sf-org-scratch-create` (`.github/actions/sf-org-scratch-create/action.yml`)

Creates a scratch org, refusing to start when the Dev Hub has no capacity. Both governing limits are checked up front (`ActiveScratchOrgs` — how many may exist at once; `DailyScratchOrgs` — how many per rolling 24h) because hitting either produces the same unhelpful `LIMIT_EXCEEDED` from the CLI.

**Inputs:** `definition-file` (default `config/project-scratch-def.json`), `alias` (default `ci-scratch`), `duration-days` (default `1`), `dev-hub-alias` (default `devhub`), `set-default` (default `true`), `wait` (default `30`)
**Outputs:** `alias`, `org-id`, `username`, `instance-url`
**Caller permissions:** none beyond the checkout

**It does not delete the org.** Composite actions cannot register a `post:` step — that is JavaScript/Docker actions only — so every caller must pair it with its own `if: always()` `sf org delete scratch --target-org <alias> --no-prompt || true`.

### `sf-package-promote` (`.github/actions/sf-package-promote/action.yml`)

Promotes a 2GP version to released. Promotion is irreversible and a released version stays installable by subscribers forever, so this does two things beyond calling the CLI: it **refuses a version built with `--skip-validation`** (the one guard the platform does not apply), and it treats an already-released version as **success**, so a retried request is a no-op. `sf package version promote` is synchronous — no request object to poll — which is why this is a composite.

**Inputs:** `version-id` (required, `04t…`), `dev-hub-alias` (default `devhub`), `allow-unvalidated` (default `false`)
**Outputs:** `status` (`promoted` | `already-released`), `promoted`, `version-number`, `package-id`
**Caller permissions:** `contents: read`

### `sf-package-install` (`.github/actions/sf-package-install/action.yml`)

Installs **one** version into a target org. `sf package install --wait` polls to a terminal state inside the CLI, so there is no polling loop here. Preflights `InstalledSubscriberPackage` in the target org rather than pattern-matching the CLI's failure message, so an already-installed version is success. On failure, queries `SubscriberPackageVersionInstallRequest` and echoes Salesforce's own errors as `::error::` plus an evidence directory for the caller to upload.

**Inputs:** `version-id` (required, `04t…`), `target-org-alias` (default `target`), `installation-key`, `wait-minutes` (default `20`), `publish-wait-minutes` (default `10`), `security-type` (`AdminsOnly` | `AllUsers`, default `AdminsOnly`), `upgrade-type` (`Mixed` | `DeprecateOnly` | `Delete`, default `Mixed`), `evidence-path` (default `evidence`)
**Outputs:** `status` (`installed` | `already-installed`), `installed`, `install-request-id`, `version-id`
**Caller permissions:** `contents: read`

2GP dependencies are **not** transitive — install a chain by calling this once per version, dependencies first.

### `sf-ops-callback` (`.github/actions/sf-ops-callback/action.yml`)

Reports a dispatched operation's terminal status back into Salesforce, keyed by the requester's correlation id. Salesforce's dispatch APIs return HTTP 204 with an empty body, so the requester never learns a run id — this closes the loop from the other side. It **always** reports: a failed operation still produces a callback with `status: failed`, because a request that goes silent is worse than one that fails.

**Inputs:** `correlation-id` (required), `operation` (required), `status` (required — `succeeded` | `failed` | `cancelled` | `no-route`), `outputs-json` (default `{}`, must parse as an object), `error-code`, `error-message`, `run-url`, `apex-rest-path` (default `/services/apexrest/gforce/ops-callback/v1`), `org-alias` (default `callback`), `dry-run` (default `false`)
**Outputs:** `payload` (the rendered JSON, so smoke tests can assert the contract), `http-status`, `delivered`
**Caller permissions:** `contents: read`

`dry-run: true` renders the payload to the step summary without posting — that is what lets the whole chain be smoke-tested with no org and no secret.

Scope note: an earlier plan also specified a TypeScript twin (`sf-package-create-node`), a
dedicated `sf-package-create` reusable workflow and a benchmark. **None were built** — only the
composite action exists. The workspace digest that supported that comparison was removed;
`--tag "$GITHUB_SHA"` already identifies the packaged content in CI.

## Reusable Workflows

### `reusable-sf-code-analyze` (`.github/workflows/reusable-sf-code-analyze.yml`)

Runs Salesforce Code Analyzer (`forcedotcom/run-code-analyzer@v2`) with configurable quality gates. Sets up Node.js, Java, Python, installs SF CLI and the code-analyzer plugin. Posts results as PR comments. Requires `pull-requests: write`, `contents: read`, `actions: read` permissions in the caller.

**Key inputs:** `workspace`, `fail-on-sev1-violations`, `fail-on-sev2-violations`, `max-violations`, `fail-on-changed-files-only`
**Outputs:** `exit-code`, `num-violations`, `num-sev1-violations`, `num-sev2-violations`

> **Docker moved out.** `docker-build-test-push.yml` now lives in `sf-docker-images` as
> `.github/workflows/reusable-docker-image-build.yml`. It had exactly one consumer — that repo —
> so the cross-repo coupling cost two PRs and a tag move per change and bought nothing. See
> [ADR 0002](docs/adr/0002-naming-and-repo-structure.md), decision 3. This repository now covers
> exactly three domains: Salesforce, GitHub, AWS.

### `reusable-sf-pr-validate` (`.github/workflows/reusable-sf-pr-validate.yml`)

PR code health, one half of the SF CI/CD pair (see `docs/consuming-sf-cicd.md`). Jobs: `jest` (runs `npm test` when the consumer's `package.json` has a `test` script; skips with a notice otherwise) and `scratch-org` (creates a 1-day scratch org from `config/scratch-orgs/ci.json`, deploys the project, assigns permission sets, runs `RunLocalTests` with coverage, uploads the results, always deletes the org).

**Key inputs:** `container-image` (default `gforceinnovation/sf-ci:latest`), `checkout-submodules` (default `recursive`), `retention-days`
**Secrets:** `sfdx-auth-url` (required)
**Outputs:** none declared
**Caller permissions:** `contents: read`

### `sf-release` (`.github/workflows/reusable-sf-release.yml`)

One workflow, two phases, the other half of the SF CI/CD pair (see `docs/consuming-sf-cicd.md`). On `pull_request`: `sf-source-delta` → `sf-apex-test-select` (naming + reference scan) → check-only deploy against the target org (`RunSpecifiedTests`, falling back to `RunLocalTests` when Apex changed but no covering tests were found; no test run for metadata-only deltas) → `validation.json` quick-deploy handoff uploaded in the `sf-release-<run_number>` artifact. On `push` to main (or `workflow_dispatch`): behind the caller's `environment` gate, quick-deploys the validated request (looked up merge-commit → PR → head SHA → `sf-release-*` artifact; valid only if org id + head SHA match and <10 days old) → fallback delta deploy (same recorded test plan) → fallback full deploy of **all** `packageDirectories` (`full-deploy: true` forces this — the bootstrap path). Uploads the `sf-deploy-<run_number>` audit artifact (delta manifest, deploy result, JUnit tests, quick-deploy decision).

**Key inputs:** `environment` (default `devhub`), `container-image`, `checkout-submodules`, `retention-days`, `full-deploy` (default `false`)
**Secrets:** `sfdx-auth-url` (required)
**Optional caller environment variable:** `SF_ORG_ALIAS` (defaults to the environment name)
**Outputs:** `component-count`, `deploy-request-id`, `tests` (PR runs); `deploy-id`, `quick-deployed` (push runs)
**Caller permissions:** `contents: read`, `actions: read`

### `sf-ops-dispatch` (`.github/workflows/reusable-sf-ops-dispatch.yml`)

**L3 — the single external entry point.** Salesforce (LWC → Apex → GitHub App JWT → dispatch API) asks for one operation; this routes it to exactly one path and reports the terminal status back. Design record: [ADR 0001](docs/adr/0001-salesforce-dispatch-layer.md). Salesforce-side contract: [docs/consuming-sf-dispatch.md](docs/consuming-sf-dispatch.md).

```text
normalize ─┬─ create-version ──► reusable-sf-package-release.yml (L2)
           ├─ create-version-dry-run
           ├─ promote ────────► sf-package-promote (L1)   [environment gate]
           ├─ install ────────► sf-package-install  (L1)  [environment gate]
           └─ report (needs: all, if: always()) ──► sf-ops-callback (L1)
```

**Key inputs:** `operation` (`create-version` | `promote` | `install`), `correlation-id`, `package`, `version-id`, `target-org-alias`, `environment` (default `sf-ops`), `dry-run`, plus `source-dirs` / `run-validate` / `skip-validation` (create-version) and `allow-unvalidated` (promote)
**Secrets:** `dev-hub-auth-url`, `target-org-auth-url`, `callback-auth-url`, `installation-key` (all optional — which ones are needed depends on the operation)
**Caller permissions:** `contents: write` (the `create-version` route pushes a tag and cuts a release)

Three invariants this file exists to hold, all easy to break by accident:

1. **A skipped job is green.** `report` `needs:` every route and fails the run when none ran, so an operation matching no route is `no-route`, not success.
2. **`normalize` never fails on a bad request.** It sets `valid=false` and passes the reason on, so `report` can still call Salesforce back *before* the run goes red. Failing there would leave the requester waiting on a run it can never learn the fate of.
3. **Untrusted values reach `github-script` through `env:` only.** A `${{ }}` inside a `script:` body is substituted before Node parses it — that is script injection.

`run-name:` cannot carry the correlation id from here: a called workflow's `run-name` is ignored and the caller's applies. The L4 template in the consuming doc sets it.

## Internal CI Workflows

Unprefixed — these are this repo's own CI and are **not** meant to be called from elsewhere.

### `ci.yml`
`quality` (format, lint, typecheck, bundle, test at the 95% gate, `dist:verify`) plus `smoke`,
which drives the local actions with `./` refs and asserts their declared outputs.

### `ci-sf-ops-dispatch-smoke.yml`

Routes all three operations through the dispatcher with `dry-run: true` — no scratch org, no `Package2VersionCreates` slot, no secrets. Runs on PRs that touch the dispatcher or its actions. The negative case (unknown operation must fail) is opt-in via `workflow_dispatch` because its assertion *is* a red run: a job calling a reusable workflow cannot take `continue-on-error`.

### `release.yml`
On a `vX.Y.Z` tag push: creates the GitHub Release and force-moves the floating `vX` tag.
**Before tagging, rewrite the reusable workflows' `@develop` self-references to `@vX`** — see
ADR 0002, decision 6.

## Authoring Conventions

- Reusable workflows must use `workflow_call` trigger with typed inputs/outputs.
- Composite actions live under `.github/actions/<name>/action.yml` and use `using: "composite"`.
- All shell steps in composite actions must specify `shell: bash`.
- Commit messages use prefix format: `Add:`, `Fix:`, `Update:`, `Docs:`, `Test:`, `Refactor:`.
- Always clean up sensitive files (keys, credentials) in an `if: always()` step.

## Installed Skills

Repo-scoped skills live in `.agents/skills/` (symlinked into `.claude/skills/`).
Invoke the relevant one when the task matches:

| Skill | Use when |
|-------|----------|
| `github-actions-docs` | Authoring/editing workflows or `action.yml` — keeps YAML aligned with current GitHub Actions syntax (composite/reusable/TypeScript action patterns). |
| `requesting-code-review` | Preparing a change for review (e.g. before a `github-release-pr-create` / `github-branch-sync` PR). |
| `receiving-code-review` | Responding to review feedback on a PR. |
| `code-review` | Reviewing TypeScript for quality/correctness (`packages/core` + action adapters). |

Manage with `npx skills check` / `npx skills update`.

<!-- skills-tooling -->
## Skills & AI tooling

**External skills** (lockfile-managed — update with `npx skills check` / `npx skills update`):
- `code-review` — from mattpocock/skills
- `github-actions-docs` — from xixu-me/skills
- `github-actions-templates` — from wshobson/agents
- `receiving-code-review` — from obra/superpowers
- `requesting-code-review` — from obra/superpowers

**Global tooling available in every session:** lean-ctx (prefer `ctx_*` MCP tools for reads/search/shell — token-compressed), superpowers process skills, and graphify (no graph built for this repo).
<!-- /skills-tooling -->
