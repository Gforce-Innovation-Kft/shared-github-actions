# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Reusable GitHub Actions for `Gforce-Innovation-Kft`: **TypeScript actions** (a
strict, class-based singleton architecture with a single shared source tree),
**composite actions**, and **callable workflows** for Salesforce CI/CD pipelines.

## Reference Pattern

From other repos, reference items using:
- Composite / TypeScript actions: `Gforce-Innovation-Kft/shared-github-actions/.github/actions/<action-name>@v1`
- Reusable workflows: `Gforce-Innovation-Kft/shared-github-actions/.github/workflows/<workflow-name>.yml@v1`

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

### `sync-branches`
Fast-forward / merge / open a sync PR on conflict. `dry-run` defaults to `true`.
Caller permissions: `contents: write` + `pull-requests: write`.

### `create-release-pr`
Create or update a release PR (templated body, labels, reviewers). `dry-run`
defaults to `true`. Caller permissions: `contents: read` + `pull-requests: write`.

### `sf-find-tests`
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

### `get-aws-secret` (`.github/actions/get-aws-secret/action.yml`)

Fetches a secret from AWS Secrets Manager using OIDC role assumption. Parsed JSON secret fields are set as environment variables. Requires caller permissions `id-token: write` + `contents: read`.

**Inputs:** `aws-region` (default `eu-central-1`), `secret-name`, `aws-role-arn`
**Outputs:** None declared. Secret fields are exposed as env vars (e.g. `$JWT_KEY_B64`, `$USERNAME`, `$CLIENT_ID`, `$INSTANCE_URL`); reference them as `${{ env.FIELD }}` in later steps, not as step outputs.

### `sf-jwt-login` (`.github/actions/sf-jwt-login/action.yml`)

Authenticates to a Salesforce org via JWT bearer flow. Internally calls `get-aws-secret`, decodes a base64 JWT key, runs `sf org login jwt`, and cleans up key files.

**Inputs:** `aws-region`, `secret-name` (default `salesforce/gabor-devhub`), `aws-role-arn`, `org-alias` (default `devhub`), `set-default-dev-hub` (default `true`)
**Outputs:** `org-id`, `username`
**Expected AWS secret JSON fields:** `JWT_KEY_B64`, `USERNAME`, `CLIENT_ID`, `INSTANCE_URL`.

### `sf-org-login` (`.github/actions/sf-org-login/action.yml`)

Authenticates to a Salesforce org from an SFDX auth URL held in a GitHub secret (`sf org login sfdx-url`) — no cloud dependency. Cleans up the auth-URL file in an `if: always()` step. JSON parsing uses `node` (not `jq`) so it works inside any container that has the SF CLI.

**Inputs:** `sfdx-auth-url` (required — always a secret), `org-alias` (default `target`), `set-default` (default `false`), `set-default-dev-hub` (default `false`)
**Outputs:** `org-id`, `username`, `instance-url`

### `sf-delta-package` (`.github/actions/sf-delta-package/action.yml`)

Generates a delta `package.xml` between two git refs with sfdx-git-delta (installs the plugin on the fly when missing; preinstalled in `gforceinnovation/sf-ci`). Writes a component table to the step summary and `<output-dir>/components.md`. Requires a `fetch-depth: 0` checkout so both refs resolve.

**Inputs:** `from-ref` (required), `to-ref` (default `HEAD`), `output-dir` (default `delta`), `source-dir` (default `force-app`), `generate-delta` (default `false`)
**Outputs:** `package-path`, `has-changes`, `component-count`

### `sf-package-create` (`.github/actions/sf-package-create/action.yml`)

Creates **one** 2GP package version: resolves the package from `sfdx-project.json`, refuses to
start unless the Dev Hub has headroom, runs `sf package version create`, pushes an annotated
`pkg/<package>/<versionNumber>` provenance tag, and on failure queries
`Package2VersionCreateRequestError` so Salesforce's own message lands in the job log.

Preflight checks the limit the run will actually spend: `Package2VersionCreates` (6/day) normally,
`Package2VersionCreatesWithoutValidation` (500/day) when `skip-validation` is true — checking the
wrong one blocks a build against quota it never consumes.

**Inputs:** `package` (falls back to the single or `default: true` entry), `dev-hub-alias` (default `devhub`), `wait-minutes` (default `60`), `code-coverage` (default `true` — set `false` for packages with no Apex tests), `skip-validation`, `installation-key` (empty ⇒ `--installation-key-bypass`), `preflight-min-headroom` (default `2`), `push-tag` (default `true`), `evidence-path`
**Outputs:** `version-id` (`04t`), `package-version-id` (`05i`), `version-number`, `request-id` (`08c`), `status`, `git-tag`
**Caller permissions:** `contents: write` (tag push), or `contents: read` when `push-tag: false`

It does **not** resolve dependency order or install anything — callers own that. `wait-minutes` is
a hard ceiling: if the build is still running when it expires the step fails and prints the
`sf package version create report` command to resume, rather than waiting a second time.

Scope note: the plan in `docs/superpowers/plans/2026-08-05-part1-package-create-action.md` also
specified a TypeScript twin (`sf-package-create-node`), a `sf-package-create.yml` reusable
workflow and a benchmark. **None were built** — only the composite action exists. The workspace
digest that supported that comparison was removed; `--tag "$GITHUB_SHA"` already identifies the
packaged content in CI.

## Reusable Workflows

### `salesforce-code-analyzer` (`.github/workflows/salesforce-code-analyzer.yml`)

Runs Salesforce Code Analyzer (`forcedotcom/run-code-analyzer@v2`) with configurable quality gates. Sets up Node.js, Java, Python, installs SF CLI and the code-analyzer plugin. Posts results as PR comments. Requires `pull-requests: write`, `contents: read`, `actions: read` permissions in the caller.

**Key inputs:** `workspace`, `fail-on-sev1-violations`, `fail-on-sev2-violations`, `max-violations`, `fail-on-changed-files-only`
**Outputs:** `exit-code`, `num-violations`, `num-sev1-violations`, `num-sev2-violations`

### `docker-build-test-push` (`.github/workflows/docker-build-test-push.yml`)

Builds, tests, and pushes **one** Docker image per invocation (callers matrix over their images). Stages: buildx build (per-image GHA cache scope, image tar artifact) → pytest-testinfra + JUnit check + Trivy SARIF → multi-arch Docker Hub push with SBOM/provenance, keyless cosign signing (OIDC), optional Docker Hub README sync, and a `version-report-<image-name>` artifact for the caller's release job. Tag scheme: `{{version}}` + `latest` only. Designed for and consumed by `sf-docker-images`.

**Key inputs:** `image-name` (unique per caller run — artifact names derive from it), `context`, `push` (default `false`; set from the caller's tag ref), `image-description` (enables README sync), `dockerhub-username`, `platforms`, `python-version`, `artifact-retention-days`
**Secrets:** `dockerhub-token` (read/write; only consumed when `push: true`)
**Caller permissions:** `contents: read`, `checks: write`, `pull-requests: write`, `security-events: write`, `id-token: write` (cosign keyless)
**Caller repo contract:** pytest suites at `tests/test_<image_name_with_underscores>.py` + `tests/requirements.txt`.
**Do not rename/move this file** — its path is the cosign certificate identity (`job_workflow_ref`); renaming invalidates all documented `cosign verify` commands.

### `sf-pr-validate` (`.github/workflows/sf-pr-validate.yml`)

PR code health, one half of the SF CI/CD pair (see `docs/consuming-sf-cicd.md`). Jobs: `jest` (runs `npm test` when the consumer's `package.json` has a `test` script; skips with a notice otherwise) and `scratch-org` (creates a 1-day scratch org from `config/scratch-orgs/ci.json`, deploys the project, assigns permission sets, runs `RunLocalTests` with coverage, uploads the results, always deletes the org).

**Key inputs:** `container-image` (default `gforceinnovation/sf-ci:latest`), `checkout-submodules` (default `recursive`), `retention-days`
**Secrets:** `sfdx-auth-url` (required)
**Outputs:** none declared
**Caller permissions:** `contents: read`

### `sf-release` (`.github/workflows/sf-release.yml`)

One workflow, two phases, the other half of the SF CI/CD pair (see `docs/consuming-sf-cicd.md`). On `pull_request`: `sf-delta-package` → `sf-find-tests` (naming + reference scan) → check-only deploy against the target org (`RunSpecifiedTests`, falling back to `RunLocalTests` when Apex changed but no covering tests were found; no test run for metadata-only deltas) → `validation.json` quick-deploy handoff uploaded in the `sf-release-<run_number>` artifact. On `push` to main (or `workflow_dispatch`): behind the caller's `environment` gate, quick-deploys the validated request (looked up merge-commit → PR → head SHA → `sf-release-*` artifact; valid only if org id + head SHA match and <10 days old) → fallback delta deploy (same recorded test plan) → fallback full deploy of **all** `packageDirectories` (`full-deploy: true` forces this — the bootstrap path). Uploads the `sf-deploy-<run_number>` audit artifact (delta manifest, deploy result, JUnit tests, quick-deploy decision).

**Key inputs:** `environment` (default `devhub`), `container-image`, `checkout-submodules`, `retention-days`, `full-deploy` (default `false`)
**Secrets:** `sfdx-auth-url` (required)
**Optional caller environment variable:** `SF_ORG_ALIAS` (defaults to the environment name)
**Outputs:** `component-count`, `deploy-request-id`, `tests` (PR runs); `deploy-id`, `quick-deployed` (push runs)
**Caller permissions:** `contents: read`, `actions: read`

### `test-simple` (`.github/workflows/test-simple.yml`)

A minimal test workflow that echoes a message. Used for verifying cross-repo workflow calls work.

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
| `requesting-code-review` | Preparing a change for review (e.g. before a `create-release-pr` / `sync-branches` PR). |
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
