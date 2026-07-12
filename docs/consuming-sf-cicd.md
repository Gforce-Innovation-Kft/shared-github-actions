# Consuming the Salesforce CI/CD workflows

A complete Salesforce CI/CD pipeline — delta validation with tests, static
analysis, a sticky PR comment, a gated deploy with quick-deploy promotion, a
GitHub Deployment record and a downloadable audit artifact per run — from two
caller workflows of ~15 lines each.

## What you get

| Stage | Workflow | What happens |
|-------|----------|--------------|
| Pull request | [`sf-validate.yml`](../.github/workflows/sf-validate.yml) | sfdx-git-delta package → check-only deploy with tests against the target org → Code Analyzer on changed files → optional scratch-org validation → sticky PR comment → `sf-validate-<run>` artifact |
| Merge to main | [`sf-deploy.yml`](../.github/workflows/sf-deploy.yml) | GitHub Environment gate (required reviewers) → quick deploy of the PR-validated request (fallback: delta deploy, then full deploy) → GitHub Deployment status with the Salesforce deploy-request URL → `sf-deploy-<env>-<run>` audit artifact |

Both run inside [`gforceinnovation/sf-ci`](https://hub.docker.com/r/gforceinnovation/sf-ci)
(Salesforce CLI + sfdx-git-delta preinstalled), overridable via `container-image`.

## Caller setup

### 1. Secret

One repository secret holding the SFDX auth URL of the target org:

```bash
sf org display --target-org <alias> --verbose --json | jq -r '.result.sfdxAuthUrl' \
  | gh secret set DEVHUB_AUTH_URL --repo <org>/<repo>
```

Hardened variant: store it as an **environment secret** named per environment and
call `sf-deploy.yml` with `secrets: inherit` — the secret then only exists behind
the environment's protection rules.

### 2. Caller workflows

`.github/workflows/pr-validate.yml`:

```yaml
name: PR Validate
on:
  pull_request:
    branches: [main]
permissions:
  contents: read
  pull-requests: write
  actions: read
jobs:
  validate:
    uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/sf-validate.yml@v1
    secrets:
      sfdx-auth-url: ${{ secrets.DEVHUB_AUTH_URL }}
```

`.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  deployments: write
  actions: read
jobs:
  production:
    uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/sf-deploy.yml@v1
    with:
      environment: production
    secrets:
      sfdx-auth-url: ${{ secrets.DEVHUB_AUTH_URL }}
```

Full-featured versions (scratch-org validation, bootstrap dispatch input) are in
[`examples/sf-validate.yml`](../examples/sf-validate.yml) and
[`examples/sf-deploy.yml`](../examples/sf-deploy.yml).

### 3. GitHub Environment + required reviewers

Free on public repos. Create the environment named in the caller's
`environment:` input and add reviewers — every deploy then waits for approval:

```bash
gh api -X PUT repos/<org>/<repo>/environments/production \
  --input - <<'JSON'
{ "reviewers": [{ "type": "User", "id": <user-id> }] }
JSON
```

Optional environment **variables** read by `sf-deploy.yml`:

| Variable | Purpose |
|----------|---------|
| `SF_ORG_ALIAS` | CLI alias for the org (defaults to the environment name) |

The environment URL shown on the Deployments page comes from the authenticated
org's instance URL automatically.

### 4. Branch ruleset on main

Require a pull request and the validation status checks, **with "require
branches to be up to date"** — that keeps the validated delta identical to what
merges, which is what makes quick deploy safe. Set it up after the first PR run
so the exact check names are visible.

## How quick deploy travels

1. The PR run's check-only deploy produces a Salesforce deploy request id; the
   run uploads it in `validation.json` (with org id, PR head SHA, timestamp)
   inside the `sf-validate-<run>` artifact.
2. On merge, `sf-deploy.yml` resolves merge commit → PR → head SHA → successful
   validation run → downloads the artifact.
3. The request is quick-deployed **only if** the org id matches the deploy
   target, the validated SHA matches the merged PR head, and the validation is
   younger than Salesforce's 10-day quick-deploy window.
4. Any mismatch (or a consumed/expired request) falls back to a delta deploy;
   an unusable delta base falls back to a full deploy. The decision and reason
   are recorded in `quick-deploy-decision.json` in the audit artifact.

## The audit trail

Every deploy is answerable months later from two places:

- **GitHub Deployments** (repo sidebar → Environments): who approved, when it
  ran, direct link to the Salesforce deploy request.
- **Artifacts**: `sf-validate-<run>` (delta manifest, validation result,
  validation.json) and `sf-deploy-<env>-<run>` (delta manifest, deploy result
  JSON, JUnit test results, quick-deploy decision).

Artifacts expire after `retention-days` (default 90, the GitHub free-tier
maximum). For longer audit retention, export them to S3/object storage on a
schedule — that is the enterprise upgrade path, deliberately not built in here.

## Notes and caveats

- The reusable workflows reference this repo's composite actions
  (`sf-org-login`, `sf-delta-package`) at `@main` — same version-skew caveat as
  `sf-jwt-login` → `get-aws-secret`: callers pinned to an old workflow tag still
  get current composite actions.
- Rebase-merges rewrite SHAs, so the quick-deploy lookup cannot match them —
  the delta-deploy fallback covers it. Use merge or squash merges.
- `full-deploy: true` deploys **every** `packageDirectories` entry from
  `sfdx-project.json` (bootstrap/re-baseline); the delta paths only scan
  `source-dir`.
- The `environment:` key itself creates a native deployment record in addition
  to the API-created one that carries the Salesforce URL — you will see both on
  the environment page; this is cosmetic.
- AWS-based JWT auth (`sf-jwt-login`) remains available for callers that have
  AWS OIDC set up; these workflows deliberately use plain GitHub secrets so the
  pipeline works with zero cloud dependencies.
