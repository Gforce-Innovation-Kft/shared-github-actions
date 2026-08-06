# Security Policy

## Supported Versions

Only the latest major release tag (currently `v1`) receives security fixes.
Callers pinned to `@main` or old tags should move to the newest `v1.x.y`.

## Reporting a Vulnerability

Please do **not** open a public issue for security problems.

- Preferred: [GitHub private vulnerability reporting](../../security/advisories/new)
- Alternative: email gforceinnovation@gmail.com

You should receive a response within 7 days. Please include a description of
the issue, steps to reproduce, and the affected action/workflow.

## Hardening Notes for Callers

- Pin these actions/workflows to a release tag (`@v1`) or commit SHA — never a
  mutable branch.
- Grant callers only the permissions documented per action in the
  [README](README.md) (`permissions:` blocks are least-privilege).
- Secrets consumed via `get-aws-secret` / `sf-org-login` (`auth-method: jwt`)
  come from AWS Secrets Manager over OIDC; no long-lived credentials or PATs are
  used, and key files are removed in `if: always()` cleanup steps.
- `sf-org-login` can emit the org's `access-token` for actions that call the
  Salesforce APIs directly. It is `::add-mask::`ed before it reaches any output,
  but treat it as a secret at every call site: pass it through `env:`, never
  into a step summary, an artifact, or a `${{ }}` interpolation inside a script
  body.
