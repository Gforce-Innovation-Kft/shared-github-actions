# Salesforce CI/CD Redesign — PR Validation + Release Flow

**Date:** 2026-07-12
**Repos:** `shared-github-actions` (logic), `sfdx_template_enterprise` (thin callers)
**Supersedes:** the `sf-validate.yml` / `sf-deploy.yml` pair on PR #6 (branch `feat/sf-cicd-workflows`). That branch is reworked in place; its composites and quick-deploy lookup logic are reused.

## Goal

Two flows for a trunk-based Salesforce project deploying to a single DevHub (production) org:

1. **PR validation** — code health: Jest tests (if any) and a full scratch-org deploy with local Apex tests.
2. **Release** — on PR open: delta validation against DevHub with automatically selected tests, saving the validation id; on merge to main: gated quick deploy of that validated request.

The template repo consumes both with ~10–15 lines of YAML each.

## Decisions (from interview, 2026-07-12)

| Topic | Decision |
|---|---|
| Template file split | Two files: `pr-validate.yml` (pull_request) and `release.yml` (pull_request + push→main in one file) |
| Deploy gate | Manual approval kept — GitHub environment `devhub` (renamed from `production`) with required reviewer |
| Test selection | New `sf-find-tests` TypeScript action: naming match + reference scan of `@IsTest` files; static, no org calls |
| Apex in delta, no tests found | Fall back to `RunLocalTests` |
| Code Analyzer job | Dropped |
| Sticky PR comment | Dropped |
| Shared repo shape | Two reusable workflows composed from composites + the new TS action |
| Action references | Release tags (`@v1`), never commit SHAs |
| Auth | `DEVHUB_AUTH_URL` repo secret (SFDX auth URL) via `sf-org-login`; no AWS |
| Runtime | All jobs (including Jest) run in `gforceinnovation/sf-ci:latest` |

## Architecture

```
shared-github-actions
├── .github/actions/
│   ├── sf-org-login/        (exists — SFDX auth-URL login, if:always() cleanup)
│   ├── sf-delta-package/    (exists — sfdx-git-delta wrapper, component table)
│   └── sf-find-tests/       (NEW — TypeScript action, packages/core + adapter)
└── .github/workflows/
    ├── sf-pr-validate.yml   (NEW reusable — jest + scratch-org jobs)
    └── sf-release.yml       (NEW reusable — validate + quick-deploy jobs)

sfdx_template_enterprise
└── .github/workflows/
    ├── pr-validate.yml      (thin caller → sf-pr-validate.yml@v1)
    └── release.yml          (thin caller → sf-release.yml@v1)
```

Composites inside the reusable workflows are referenced by absolute
`Gforce-Innovation-Kft/shared-github-actions/.github/actions/<name>@v1`
(actions resolve against the caller's checkout, so relative paths do not work).

## Components

### `sf-find-tests` (new TypeScript action)

Follows `docs/typescript-action-authoring.md`: use case in `packages/core`
(no `@actions/*`), thin adapter in `.github/actions/sf-find-tests/` with
committed `dist/index.js`, unit tests in core.

- **Inputs:** `package-xml` (path to delta manifest, required), `source-dir`
  (default `force-app`), `test-suffixes` (default `Test,_Test,Tests`).
- **Logic:**
  1. Parse `ApexClass` / `ApexTrigger` members from the delta manifest.
  2. Changed classes that are themselves `@IsTest` → include directly in the run.
  3. For remaining changed names: include `<Name><suffix>` classes that exist,
     plus every `@IsTest` class in the repo whose body references a changed
     name (word-boundary match).
- **Outputs:** `tests` (space-separated), `test-count`, `has-apex`.
- The **workflow** (not the action) derives the test level:
  - `has-apex` and `test-count > 0` → `RunSpecifiedTests --tests …`
  - `has-apex` and `test-count == 0` → `RunLocalTests`
  - no Apex in delta → validate without a test flag (production default).

### `sf-pr-validate.yml` (reusable workflow)

Two independent jobs, both in the container:

1. **`jest`** — detect step: repo has `package.json` with a `test` script.
   Found → `npm ci` + `npm test`; not found → skip with a notice (skipped jobs
   satisfy required checks). No input — the command is always `npm test`.
2. **`scratch-org`** — `sf-org-login` (dev hub) → `sf org create scratch`
   from `config/scratch-orgs/ci.json` (static path, no input; 1-day) →
   `sf project deploy start --wait 60` → assign permsets (warn-only loop) →
   `sf apex run test --test-level RunLocalTests --code-coverage` with JUnit
   output → results to step summary + artifact → delete scratch org
   `if: always()`.

**Inputs:** `container-image`, `checkout-submodules`, `retention-days`.
**Secrets:** `sfdx-auth-url`.

### `sf-release.yml` (reusable workflow)

Caller triggers on `pull_request` and `push`→main; jobs gate on
`github.event_name`.

**Job `validate`** (`if: github.event_name == 'pull_request'`):
- Checkout `fetch-depth: 0` → `sf-delta-package@v1` (PR base → head,
  `generate-delta: true`) → `sf-find-tests@v1` → derive test level →
  `sf-org-login` → `sf project deploy validate --manifest delta/package.xml
  [test flags] --json --wait 60`.
- Write `validation.json`: `{deployId, orgId, username, headSha, testLevel,
  tests, componentCount, validatedAt}`.
- Upload artifact **`sf-release-<run_number>`** (delta dir, validate result,
  `validation.json`) — the quick-deploy handoff. Empty delta → skip the
  validate call but still upload with `componentCount: 0`.

**Job `quick-deploy`** (`if: github.event_name == 'push'` or
`workflow_dispatch`), `environment: <input, default devhub>` — pauses for
manual approval; GitHub creates the deployment record automatically (no
Deployments-API scripting):
- Lookup: merge commit → associated PR → head SHA → successful validate run →
  download `sf-release-*` artifact (reuses PR #6's tested logic).
- Decision (node script): deployId present, org id matches, head SHA matches,
  `validatedAt` < 10 days → **`sf project deploy quick --job-id`**.
- Fallback chain: stale/invalid → delta redeploy from the artifact manifest
  with the same picked tests → full deploy of **all** `packageDirectories`
  from `sfdx-project.json`. Input `full-deploy: true` forces the full path
  (bootstrap). `componentCount: 0` → skip with a notice.
- Upload audit artifact `sf-deploy-<run_number>`; step summary links to the
  Salesforce deploy-status page.

**Inputs:** `environment` (default `devhub`), `container-image`, `full-deploy`,
`checkout-submodules`, `retention-days`. **Secrets:** `sfdx-auth-url`.
**Outputs:** `deploy-id`, `quick-deployed`, `component-count`.

### Template callers

`pr-validate.yml`: `on: pull_request` → main; concurrency per PR;
calls `sf-pr-validate.yml@v1`; passes `DEVHUB_AUTH_URL`.

`release.yml`: `on: pull_request` → main, `push` → main, `workflow_dispatch`
with boolean `full-deploy`; concurrency `release-main` (no cancel on push);
calls `sf-release.yml@v1` with `environment: devhub` and the `full-deploy`
passthrough.

## Branch ruleset (main)

Require PR; require status checks **with "require branch up to date"** (strict)
— this keeps the PR head SHA identical to the merged content, which is what
makes the saved validation id trustworthy. Required checks: the `jest`,
`scratch-org`, and `validate` check names as observed on the first live run.

## Error handling

- Auth-URL temp file and scratch org removed in `if: always()` steps.
- Unresolvable git refs fail early with a message pointing at `fetch-depth: 0`.
- JSON parsed with `node -pe` (jq not guaranteed in the container).
- Quick-deploy validity failures are not errors — they route to the fallback
  chain and the audit artifact records which mode ran (`quick|delta|full|skip`).
- Salesforce failures surface the deploy request id in the step summary.
- Approval delay > 10 days simply invalidates quick deploy → delta redeploy.

## Testing

- `sf-find-tests`: unit tests in `packages/core` (fixture manifests + fake
  source trees); `npm run all` must pass (format, lint, typecheck, bundle,
  test, dist:verify).
- Workflows: `actionlint` clean; live verification via the template's demo PR
  (`feat/invoice-due-date`) exercising: Jest skip/run, scratch-org run, delta
  validation with picked tests, gated quick deploy after merge.

## Migration / rollout

1. Rework PR #6 branch: delete `sf-validate.yml` + `sf-deploy.yml`, add
   `sf-pr-validate.yml` + `sf-release.yml` + `sf-find-tests`, update
   `README.md`, `CLAUDE.md`, `docs/consuming-sf-cicd.md`, `examples/`.
2. Merge #6 → tag `v1.2.0` → `release.yml` moves `v1`.
3. Rework template PR #5 callers (delete current `deploy.yml`, add
   `release.yml`, slim `pr-validate.yml`), update `docs/CICD.md` (mermaid) and
   references; rename environment `production` → `devhub`; checks go green.
4. Merge #5 → approve gate (or bootstrap via `workflow_dispatch full-deploy`).
5. Rebase `feat/invoice-due-date` onto main → open demo PR → leave open.
6. Create the main branch ruleset with the observed check names.

## Out of scope / dropped

- Salesforce Code Analyzer job and the sticky PR comment (interview decision).
- Manual GitHub Deployments-API scripting (environment jobs record deploys).
- The `lwc-tests` inputs partially added to the old `sf-validate.yml` during
  the interrupted session — superseded by `sf-pr-validate.yml`'s `jest` job.
- Multi-org environment chains and AWS/JWT auth (no AWS available).
