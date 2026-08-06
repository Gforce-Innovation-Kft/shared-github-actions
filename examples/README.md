# Examples

This directory contains example workflows showing how to use the shared GitHub Actions in different scenarios.

> **⚠️ These pin `@v2`, which is not cut yet.**
> The action and workflow names here follow the convention in
> [ADR 0002](../docs/adr/0002-naming-and-repo-structure.md); those paths exist on
> `develop` and `main` but at no tag. `v1` is frozen at the *pre-rename* layout.
>
> Until `v2` is tagged, either pin `@main` (accepting that it moves) or use `@v1`
> with the old names: `get-aws-secret`, `create-release-pr`, `sync-branches`,
> `sf-delta-package`, `sf-find-tests`, `sf-scratch-org`, and workflows without the
> `reusable-` prefix. Once `v2` exists these examples are correct as written.

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
(fallback delta → full). Includes the `workflow_dispatch` bootstrap path
(`gh workflow run sf-release.yml -f full-deploy=true`).

Full setup guide: [docs/consuming-sf-cicd.md](../docs/consuming-sf-cicd.md).

## Salesforce Code Analyzer Examples

### Example 1: Basic PR Check

**File:** `salesforce-analyzer-basic.yml`

Runs code analysis on every pull request with default settings.

```yaml
name: Basic Code Analysis
on:
  pull_request:

jobs:
  analyze:
    uses: <your-org>/shared-github-action/.github/workflows/reusable-sf-code-analyze.yml@main
    permissions:
      pull-requests: write
      contents: read
      actions: read
```

### Example 2: Legacy Codebase (Changed Files Only)

**File:** `salesforce-analyzer-legacy.yml`

Only checks changed files - useful for large legacy codebases where fixing all violations at once is impractical.

```yaml
name: Code Analysis - Changed Files
on:
  pull_request:

jobs:
  analyze:
    uses: <your-org>/shared-github-action/.github/workflows/reusable-sf-code-analyze.yml@main
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

**File:** `salesforce-analyzer-gradual.yml`

Allows a limited number of violations to decrease over time.

```yaml
name: Code Analysis - Gradual Improvement
on:
  pull_request:

jobs:
  analyze:
    uses: <your-org>/shared-github-action/.github/workflows/reusable-sf-code-analyze.yml@main
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

**File:** `salesforce-analyzer-multi-dir.yml`

Analyzes multiple directories separately.

```yaml
name: Code Analysis - Multiple Directories
on:
  pull_request:

jobs:
  analyze-force-app:
    uses: <your-org>/shared-github-action/.github/workflows/reusable-sf-code-analyze.yml@main
    permissions:
      pull-requests: write
      contents: read
      actions: read
    with:
      workspace: './force-app'
      results-artifact-name: 'force-app-results'

  analyze-apex-common:
    uses: <your-org>/shared-github-action/.github/workflows/reusable-sf-code-analyze.yml@main
    permissions:
      pull-requests: write
      contents: read
      actions: read
    with:
      workspace: './apex-common'
      results-artifact-name: 'apex-common-results'
```

### Example 5: Scheduled Analysis

**File:** `salesforce-analyzer-scheduled.yml`

Runs analysis on a schedule (e.g., nightly) on the main branch.

```yaml
name: Scheduled Code Analysis
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily
  workflow_dispatch:  # Manual trigger

jobs:
  analyze:
    uses: <your-org>/shared-github-action/.github/workflows/reusable-sf-code-analyze.yml@main
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

**File:** `salesforce-analyzer-with-outputs.yml`

Demonstrates using the workflow outputs in downstream jobs.

```yaml
name: Code Analysis with Custom Reporting
on:
  pull_request:

jobs:
  analyze:
    uses: <your-org>/shared-github-action/.github/workflows/reusable-sf-code-analyze.yml@main
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

**File:** `salesforce-analyzer-matrix.yml`

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
    uses: <your-org>/shared-github-action/.github/workflows/reusable-sf-code-analyze.yml@main
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
2. Replace `<your-org>` with your GitHub organization or username
3. Adjust the parameters as needed for your project
4. Save to `.github/workflows/` in your repository
5. Commit and push to activate the workflow

## Additional Resources

- [Getting Started Guide](../GETTING_STARTED.md)
- [Main README](../README.md)
- [Salesforce Code Analyzer Documentation](https://forcedotcom.github.io/sfdx-scanner/)
