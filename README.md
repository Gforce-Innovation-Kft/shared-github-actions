# Shared GitHub Actions

Reusable GitHub Actions for `gforceinnovation`: **TypeScript actions** (a portable
core + thin adapters), **composite actions**, and **callable workflows** for
Salesforce CI/CD. Reference them from any repo in the org.

```text
TypeScript action: gforceinnovation/shared-github-actions/.github/actions/<name>@main
Composite action:  gforceinnovation/shared-github-actions/.github/actions/<name>@main
Reusable workflow: gforceinnovation/shared-github-actions/.github/workflows/<name>.yml@main
```

## TypeScript Actions

Thin Node20 adapters over portable business logic in `packages/`. Each ships a
committed `dist/index.js`. Full input/output lists live in each `action.yml`;
runnable callers are in [`examples/`](examples).

### `sync-branches`

Synchronize one branch into another: fast-forward when possible, else a
server-side merge, else open a "sync" pull request on conflict.

- **Key inputs:** `source-branch`*, `target-branch`*, `strategy` (`auto` | `fast-forward` | `merge`, default `auto`), `dry-run` (default **`true`**), `github-token` (default `${{ github.token }}`).
- **Key outputs:** `synced`, `action`, `result-sha`, `pull-request-number`, `pull-request-url`, `ahead-by`, `behind-by`, `reason`.
- **Permissions:** `contents: write` (moves the target ref / merges) + `pull-requests: write` (opens the sync PR on conflict).

### `create-release-pr`

Create or update a release pull request between two branches, with a templated
title/body, labels, and reviewers.

- **Key inputs:** `source-branch`*, `target-branch`*, `release-version`*, `title`, `body-template` (`{{version}}`/`{{source}}`/`{{target}}`/`{{commits}}`/`{{files}}`), `draft` (default `false`), `labels`, `reviewers`, `dry-run` (default **`true`**), `github-token` (default `${{ github.token }}`).
- **Key outputs:** `pull-request-number`, `pull-request-url`, `created`, `updated`.
- **Permissions:** `contents: read` (compare only) + `pull-requests: write`.

> `dry-run` defaults to `true` on both actions — a caller must explicitly opt in
> to mutating state.

## Composite Actions

- **`get-aws-secret`** — fetch a secret from AWS Secrets Manager via OIDC role
  assumption; JSON fields are exported as env vars.
- **`sf-jwt-login`** — authenticate to a Salesforce org via JWT bearer flow
  (wraps `get-aws-secret`, decodes the key, cleans up).

## Reusable Workflows

- **`salesforce-code-analyzer.yml`** — run Salesforce Code Analyzer with quality
  gates; posts PR comments. Caller needs `pull-requests: write`, `contents: read`,
  `actions: read`.
- **`test-simple.yml`** — minimal echo workflow for verifying cross-repo calls.

## Repository Layout

npm-workspaces monorepo:

```text
packages/core                      # portable business logic + GitHub services (no @actions/*)
packages/github-actions-runtime    # @actions/core adapter: logger, repo-from-env, runGitHubAction
.github/actions/<name>             # thin TypeScript action adapters (committed dist/)
.github/actions/get-aws-secret     # composite actions
.github/workflows                  # CI + reusable workflows
examples/                          # runnable caller workflows
docs/                              # architecture + authoring guides
```

See [`docs/architecture.md`](docs/architecture.md) for the layering and
[`docs/typescript-action-authoring.md`](docs/typescript-action-authoring.md) for
how to add the next action.

## Development

```bash
npm ci                  # install workspaces (Node 20+)
npm run all             # format:check + lint + typecheck + bundle + test + dist:verify
npm run test:all        # all workspace tests (per-package 90% coverage gate)
npm run bundle:all      # rebuild every action's dist/index.js
npm run typecheck:all   # tsc --noEmit across workspaces
```

**Run `npm run all` and ensure it passes before opening a PR.** A pre-commit hook
rebuilds and re-stages action bundles; CI's `dist:verify` fails on a stale bundle.

## Conventions

- Reference actions/workflows by branch or tag (`@main`, `@v1`), never a moving
  default in production.
- Commit prefixes: `Add:`, `Fix:`, `Update:`, `Docs:`, `Test:`, `Refactor:`.
- Composite actions use `using: "composite"` with `shell: bash`; always clean up
  secrets in an `if: always()` step.

## License

MIT
