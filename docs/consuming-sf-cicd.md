# Consuming the Salesforce CI/CD workflows

Two reusable workflows give a Salesforce project a complete trunk-based
CI/CD pipeline against a single org (Dev Hub / production). The consumer
carries two thin callers; all logic lives here behind the `v1` release tag.

## The flows

**PR validation** (`sf-pr-validate.yml`) — code health on every PR:

- `jest` — runs `npm test` when the consumer's `package.json` has a `test`
  script; skips with a notice otherwise.
- `scratch-org` — creates a 1-day scratch org from
  `config/scratch-orgs/ci.json`, deploys the project, assigns permission
  sets, runs `RunLocalTests` with coverage, uploads the results, always
  deletes the org.

**Release** (`sf-release.yml`) — one workflow, two phases:

- On `pull_request`: generates a delta package (sfdx-git-delta), selects
  the relevant Apex tests with `sf-apex-test-select` (naming + reference scan),
  check-only deploys the delta against the target org
  (`RunSpecifiedTests`; falls back to `RunLocalTests` when Apex changed but
  no covering tests were found; no test run for metadata-only deltas), and
  saves the deploy request id in the `sf-release-<run_number>` artifact.
- On `push` to main (or `workflow_dispatch`): behind the caller's
  environment gate, quick-deploys the validated request
  (`sf project deploy quick`). Falls back to a delta deploy (same recorded
  test plan), then to a full deploy of every `packageDirectories` entry.
  `full-deploy: true` forces the full path (bootstrap / re-baseline).

Quick deploy is only used when the validated org id and PR head SHA match
and the validation is under 10 days old — pair this with a `main` branch
ruleset that requires branches to be up to date before merging.

## Caller setup

1. Repo secret `DEVHUB_AUTH_URL` — the SFDX auth URL of the target org
   (`sf org auth show-sfdx-auth-url --target-org <alias> --json` → `sfdxAuthUrl`;
   `sf org display` redacts it as of CLI 2.14x). Never commit it.
2. GitHub Environment `devhub` with required reviewers — the manual deploy
   gate.
3. The two caller workflows — copy `examples/sf-pr-validate.yml` and
   `examples/sf-release.yml`.
4. A `main` ruleset: require PRs, require the `jest`, `scratch-org` and
   `validate` checks, and require branches to be up to date.

## Inputs, secrets, outputs

See the workflow files' `workflow_call` blocks for the full typed list:

- [`sf-pr-validate.yml`](../.github/workflows/reusable-sf-pr-validate.yml) —
  `container-image`, `checkout-submodules`, `retention-days`; secret
  `sfdx-auth-url`.
- [`sf-release.yml`](../.github/workflows/reusable-sf-release.yml) — adds
  `environment` (default `devhub`) and `full-deploy`; outputs the deploy
  request ids and the selected tests.

## Building blocks

| Piece | Role |
|-------|------|
| `sf-org-login` (composite) | SFDX auth-URL login with `if: always()` cleanup |
| `sf-source-delta` (composite) | Delta `package.xml` between two refs + component table |
| `sf-apex-test-select` (TypeScript action) | Delta-scoped Apex test selection |

Composite/TS actions inside the reusable workflows are referenced by
absolute `@v1` refs because actions resolve against the **caller's**
checkout. Everything ships together in one release: consumers on `@v1`
always get matching workflow + action versions.

## Fork limitation

Both workflows need the `sfdx-auth-url` secret; GitHub does not expose
secrets to `pull_request` runs from forks, so fork PRs fail validation.
Use same-repo branches.
