# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

A collection of reusable GitHub Actions composite actions and callable workflows for Salesforce CI/CD pipelines. The GitHub org is `gforceinnovation`.

## Reference Pattern

From other repos, reference items using:
- Composite actions: `gforceinnovation/shared-github-actions/.github/actions/<action-name>@main`
- Reusable workflows: `gforceinnovation/shared-github-actions/.github/workflows/<workflow-name>.yml@main`

## Composite Actions

### `get-aws-secret` (`.github/actions/get-aws-secret/action.yml`)

Fetches a secret from AWS Secrets Manager using OIDC role assumption. Parsed JSON secret fields are set as environment variables.

**Inputs:** `aws-region` (default `eu-central-1`), `secret-name`, `aws-role-arn`
**Outputs:** Secret fields exposed as env vars (e.g. `$JWT_KEY_B64`, `$USERNAME`, `$CLIENT_ID`, `$INSTANCE_URL`).

### `sf-jwt-login` (`.github/actions/sf-jwt-login/action.yml`)

Authenticates to a Salesforce org via JWT bearer flow. Internally calls `get-aws-secret`, decodes a base64 JWT key, runs `sf org login jwt`, and cleans up key files.

**Inputs:** `aws-region`, `secret-name` (default `salesforce/gabor-devhub`), `aws-role-arn`, `org-alias` (default `devhub`), `set-default-dev-hub` (default `true`)
**Outputs:** `org-id`, `username`
**Expected AWS secret JSON fields:** `JWT_KEY_B64`, `USERNAME`, `CLIENT_ID`, `INSTANCE_URL`.

## Reusable Workflows

### `salesforce-code-analyzer` (`.github/workflows/salesforce-code-analyzer.yml`)

Runs Salesforce Code Analyzer (`forcedotcom/run-code-analyzer@v2`) with configurable quality gates. Sets up Node.js, Java, Python, installs SF CLI and the code-analyzer plugin. Posts results as PR comments. Requires `pull-requests: write`, `contents: read`, `actions: read` permissions in the caller.

**Key inputs:** `workspace`, `fail-on-sev1-violations`, `fail-on-sev2-violations`, `max-violations`, `fail-on-changed-files-only`
**Outputs:** `exit-code`, `num-violations`, `num-sev1-violations`, `num-sev2-violations`

### `test-simple` (`.github/workflows/test-simple.yml`)

A minimal test workflow that echoes a message. Used for verifying cross-repo workflow calls work.

## Authoring Conventions

- Reusable workflows must use `workflow_call` trigger with typed inputs/outputs.
- Composite actions live under `.github/actions/<name>/action.yml` and use `using: "composite"`.
- All shell steps in composite actions must specify `shell: bash`.
- Commit messages use prefix format: `Add:`, `Fix:`, `Update:`, `Docs:`, `Test:`, `Refactor:`.
- Always clean up sensitive files (keys, credentials) in an `if: always()` step.
