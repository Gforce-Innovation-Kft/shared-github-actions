# Examples

Runnable caller workflows for the shared actions. Copy one into your repo's
`.github/workflows/`, adjust the inputs, and commit.

Every example pins **`@v2`** — the first tag carrying the
[ADR 0002](../docs/adr/0002-naming-and-repo-structure.md) names. `v1` is frozen at the
pre-rename layout, so on `@v1` these paths do not resolve; the old names are
`get-aws-secret`, `create-release-pr`, `sync-branches`, `sf-delta-package`,
`sf-find-tests`, and workflows without the `reusable-` prefix.

## Files in this directory

| File | Calls |
|---|---|
| [`reusable-sf-pr-validate.yml`](reusable-sf-pr-validate.yml) | `reusable-sf-pr-validate.yml` — PR code health |
| [`reusable-sf-release.yml`](reusable-sf-release.yml) | `reusable-sf-release.yml` — validate on PR, gated deploy on merge |
| [`github-branch-sync.yml`](github-branch-sync.yml) | the `github-branch-sync` action |
| [`github-release-pr-create.yml`](github-release-pr-create.yml) | the `github-release-pr-create` action |

The Code Analyzer snippets further down are inline only — there is no file for each.
For the two workflows with no example file here, the caller templates live with their
docs: `reusable-sf-ops-dispatch.yml` in
[docs/consuming-sf-dispatch.md](../docs/consuming-sf-dispatch.md), and
`reusable-sf-package-release.yml` is normally reached through the dispatcher rather
than called directly.

## Salesforce CI/CD Pair

### `reusable-sf-pr-validate.yml`

PR code health (Jest + scratch org): runs `npm test` when present, plus a
scratch-org create/push/test/delete cycle against `config/scratch-orgs/ci.json`.
One repository secret (`DEVHUB_AUTH_URL`) is the only setup.

### `reusable-sf-release.yml`

Release: delta validation on PRs, gated quick deploy on merge. On PRs it
check-only deploys the delta against the target org and records the deploy
request; on merge to main the `devhub` GitHub Environment holds the
required-reviewer gate before the validated request is quick-deployed
(fallback delta → full). Includes the `workflow_dispatch` bootstrap path — save the
example as `.github/workflows/release.yml`, then
`gh workflow run Release -f full-deploy=true`.

Full setup guide: [docs/consuming-sf-cicd.md](../docs/consuming-sf-cicd.md).

## Salesforce Code Analyzer Examples

### Example 1: Basic PR Check

**Inline snippet** — copy the YAML below; there is no file for this variant.

Runs code analysis on every pull request with default settings.

```yaml
name: Basic Code Analysis
on:
  pull_request:

jobs:
  analyze:
    uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-sf-code-analyze.yml@v2
    permissions:
      pull-requests: write
      contents: read
      actions: read
```

### Example 2: Legacy Codebase (Changed Files Only)

**Inline snippet** — copy the YAML below; there is no file for this variant.

Only checks changed files - useful for large legacy codebases where fixing all violations at once is impractical.

```yaml
name: Code Analysis - Changed Files
on:
  pull_request:

jobs:
  analyze:
    uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-sf-code-analyze.yml@v2
    permissions:
      pull-requests: write
      contents: read
      actions: read
    with:
      fail-on-changed-files-only: true
      fail-on-sev1-violations: true
      fail-on-sev2-violations: true
```

### Example 3: Gradual Improvement Strategy

**Inline snippet** — copy the YAML below; there is no file for this variant.

Allows a limited number of violations to decrease over time.

```yaml
name: Code Analysis - Gradual Improvement
on:
  pull_request:

jobs:
  analyze:
    uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-sf-code-analyze.yml@v2
    permissions:
      pull-requests: write
      contents: read
      actions: read
    with:
      max-violations: 50  # Decrease this number over time
      fail-on-sev1-violations: true
      fail-on-sev2-violations: false  # Only fail on critical issues
```

### Example 4: Multiple Directories

**Inline snippet** — copy the YAML below; there is no file for this variant.

Analyzes multiple directories separately.

```yaml
name: Code Analysis - Multiple Directories
on:
  pull_request:

jobs:
  analyze-force-app:
    uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-sf-code-analyze.yml@v2
    permissions:
      pull-requests: write
      contents: read
      actions: read
    with:
      workspace: './force-app'
      results-artifact-name: 'force-app-results'

  analyze-apex-common:
    uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-sf-code-analyze.yml@v2
    permissions:
      pull-requests: write
      contents: read
      actions: read
    with:
      workspace: './apex-common'
      results-artifact-name: 'apex-common-results'
```

### Example 5: Scheduled Analysis

**Inline snippet** — copy the YAML below; there is no file for this variant.

Runs analysis on a schedule (e.g., nightly) on the main branch.

```yaml
name: Scheduled Code Analysis
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily
  workflow_dispatch:  # Manual trigger

jobs:
  analyze:
    uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-sf-code-analyze.yml@v2
    permissions:
      pull-requests: write
      contents: read
      actions: read
    with:
      fail-on-sev1-violations: false
      fail-on-sev2-violations: false
      # Don't fail the workflow, just generate reports
```

### Example 6: Using Outputs

**Inline snippet** — copy the YAML below; there is no file for this variant.

Demonstrates using the workflow outputs in downstream jobs.

```yaml
name: Code Analysis with Custom Reporting
on:
  pull_request:

jobs:
  analyze:
    uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-sf-code-analyze.yml@v2
    permissions:
      pull-requests: write
      contents: read
      actions: read

  report:
    needs: analyze
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: Create Summary Report
        run: |
          echo "## Code Analysis Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "- **Exit Code:** ${{ needs.analyze.outputs.exit-code }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Total Violations:** ${{ needs.analyze.outputs.num-violations }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Critical (Sev 1):** ${{ needs.analyze.outputs.num-sev1-violations }}" >> $GITHUB_STEP_SUMMARY
          echo "- **High (Sev 2):** ${{ needs.analyze.outputs.num-sev2-violations }}" >> $GITHUB_STEP_SUMMARY

      - name: Send Slack Notification
        if: needs.analyze.outputs.num-sev1-violations > 0
        run: |
          # Add your Slack notification logic here
          echo "Would send Slack notification about ${{ needs.analyze.outputs.num-sev1-violations }} critical violations"
```

### Example 7: Matrix Strategy

**Inline snippet** — copy the YAML below; there is no file for this variant.

Runs analysis with different configurations in parallel.

```yaml
name: Code Analysis - Matrix
on:
  pull_request:

jobs:
  analyze:
    strategy:
      matrix:
        config:
          - name: 'strict'
            fail-sev1: true
            fail-sev2: true
            max-violations: 0
          - name: 'moderate'
            fail-sev1: true
            fail-sev2: false
            max-violations: 10
    uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-sf-code-analyze.yml@v2
    permissions:
      pull-requests: write
      contents: read
      actions: read
    with:
      fail-on-sev1-violations: ${{ matrix.config.fail-sev1 }}
      fail-on-sev2-violations: ${{ matrix.config.fail-sev2 }}
      max-violations: ${{ matrix.config.max-violations }}
      results-artifact-name: salesforce-results-${{ matrix.config.name }}
```

## Using These Examples

1. Copy the example that best matches your use case
2. Save it to `.github/workflows/` in your repository
3. Adjust the inputs for your project
4. Add the secrets the workflow declares — `DEVHUB_AUTH_URL` for the CI/CD pair; the
   Code Analyzer examples need none
5. Commit and push to activate the workflow

The `uses:` lines already name `Gforce-Innovation-Kft/shared-github-actions` and pin
`@v2` — leave them as they are unless you have forked this repo.

## Additional Resources

- [Getting Started Guide](../GETTING_STARTED.md)
- [Main README](../README.md)
- [Pipeline map](../docs/pipeline-map.md) — the whole system on one page
- [Consuming the SF CI/CD pair](../docs/consuming-sf-cicd.md)
- [Consuming the SF dispatch layer](../docs/consuming-sf-dispatch.md)
- [Salesforce Code Analyzer Documentation](https://forcedotcom.github.io/sfdx-scanner/)
