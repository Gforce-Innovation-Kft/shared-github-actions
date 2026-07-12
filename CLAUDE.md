# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Reusable GitHub Actions for `Gforce-Innovation-Kft`: **TypeScript actions** (a portable
core plus thin adapters), **composite actions**, and **callable workflows** for
Salesforce CI/CD pipelines.

## Reference Pattern

From other repos, reference items using:
- Composite / TypeScript actions: `Gforce-Innovation-Kft/shared-github-actions/.github/actions/<action-name>@v1`
- Reusable workflows: `Gforce-Innovation-Kft/shared-github-actions/.github/workflows/<workflow-name>.yml@v1`

## TypeScript Actions (npm-workspaces monorepo)

`@actions/core` lives ONLY in the runtime/adapter layer; `packages/core` is
portable and free of any runner API.

| Path | Role |
|------|------|
| `packages/core` | Portable business logic: use cases (`actions/*`), GitHub services (`github-service/*`), validation, result/errors. No `@actions/*`. |
| `packages/github-actions-runtime` | `@actions/core` adapter: `ActionsLogger`, `readRepoFromEnvironment`, the `runGitHubAction` loop. |
| `.github/actions/<name>` | Thin adapter: `index.ts` (definition + guarded `run()`), `inputReader.ts`, `outputWriter.ts`, committed `dist/index.js`. |

GitHub API calls are wrapped once per domain service (`BranchService`,
`PullRequestService`) behind the composed `GitHubService` facade; each service is
a singleton (`getInstance` cached / `newInstance` isolated / `resetInstance`),
all sharing one `GitHubClient` (Octokit). `@octokit/rest` is a dependency of
`packages/core` only.

### `sync-branches`
Fast-forward / merge / open a sync PR on conflict. `dry-run` defaults to `true`.
Caller permissions: `contents: write` + `pull-requests: write`.

### `create-release-pr`
Create or update a release PR (templated body, labels, reviewers). `dry-run`
defaults to `true`. Caller permissions: `contents: read` + `pull-requests: write`.

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

### `sf-validate` (`.github/workflows/sf-validate.yml`)

Salesforce PR validation, designed as one half of the SF CI/CD pair (see `docs/consuming-sf-cicd.md`). Jobs: `validate` (delta package → check-only deploy with tests against the target org → `validation.json` quick-deploy handoff → `sf-validate-<run_number>` artifact, in a container), `analyze` (calls `salesforce-code-analyzer.yml` via same-repo relative ref, changed-files-only), `scratch-org` (optional: create/push/test/delete), `pr-comment` (sticky comment). Composite actions are referenced by absolute `@main` ref (they resolve against the caller's checkout — documented version-skew caveat).

**Key inputs:** `container-image` (default `gforceinnovation/sf-ci:latest`), `test-level`/`test-classes`, `source-dir`, `scratch-org-validation` + `scratch-def-path`, `retention-days`, analyzer gates
**Secrets:** `sfdx-auth-url` (required)
**Outputs:** `has-changes`, `component-count`, `deploy-request-id`, `artifact-name`, analyzer violation counts
**Caller permissions:** `contents: read`, `pull-requests: write`, `actions: read`

### `sf-deploy` (`.github/workflows/sf-deploy.yml`)

Gated Salesforce deploy bound to a caller GitHub Environment (`environment` input — reviewers/wait timers apply there). Creates a GitHub Deployment, then: quick deploy of the PR-validated request (looked up merge-commit → PR → head SHA → `sf-validate-*` artifact; valid only if org id + SHA match and <10 days old) → fallback delta deploy → fallback full deploy of **all** `packageDirectories` (`full-deploy: true` forces this — the bootstrap path). Uploads the `sf-deploy-<environment>-<run_number>` audit artifact (delta manifest, deploy result, JUnit tests, quick-deploy decision) and sets the Deployment status with the Salesforce deploy-request URL.

**Key inputs:** `environment` (required), `quick-deploy` (default `true`), `full-deploy` (default `false`), `test-level`/`test-classes`, `from-ref` (default `github.event.before`), `container-image`, `retention-days`
**Secrets:** `sfdx-auth-url` (required)
**Optional caller environment variable:** `SF_ORG_ALIAS` (defaults to the environment name)
**Outputs:** `deploy-id`, `quick-deployed`, `org-id`, `username`, `artifact-name`
**Caller permissions:** `contents: read`, `deployments: write`, `actions: read`

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
