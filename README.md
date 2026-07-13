# Shared GitHub Actions

Reusable GitHub Actions for `Gforce-Innovation-Kft`: **TypeScript actions** (a portable
core + thin adapters), **composite actions**, and **callable workflows** for
Salesforce CI/CD. Reference them from any repo in the org.

```text
TypeScript action: Gforce-Innovation-Kft/shared-github-actions/.github/actions/<name>@v1
Composite action:  Gforce-Innovation-Kft/shared-github-actions/.github/actions/<name>@v1
Reusable workflow: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/<name>.yml@v1
```

See [Versioning](#versioning) for how to pin (`@v1`, `@v1.2.0`, or a full
commit SHA — avoid `@main` in production callers).

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

### `sf-find-tests`

Select the Apex test classes relevant to a delta `package.xml` — naming-convention
matches plus a reference scan of test classes in the source tree.

- **Key inputs:** `package-xml`*, `source-dir` (default `force-app`),
  `test-suffixes` (default `Test,_Test,Tests`), `github-token` (default
  `${{ github.token }}` — this action makes no GitHub API calls; the input
  exists only for the shared runtime).
- **Key outputs:** `tests`, `test-count`, `has-apex`.
- **Permissions:** none (no GitHub API calls).

## Composite Actions

- **`get-aws-secret`** — fetch a secret from AWS Secrets Manager via OIDC role
  assumption; JSON fields are exported as env vars (reference them as
  `${{ env.FIELD }}`, not step outputs). Requires `id-token: write` +
  `contents: read`.
- **`sf-jwt-login`** — authenticate to a Salesforce org via JWT bearer flow
  (wraps `get-aws-secret`, decodes the key, cleans up).
- **`sf-org-login`** — authenticate to a Salesforce org from an SFDX auth URL
  held in a GitHub secret (no cloud dependency). Outputs `org-id`, `username`,
  `instance-url`; cleans up the auth file.
- **`sf-delta-package`** — generate a delta `package.xml` between two git refs
  with sfdx-git-delta. Inputs `from-ref`*, `to-ref`, `output-dir`, `source-dir`,
  `generate-delta`; outputs `package-path`, `has-changes`, `component-count`.
  Requires a `fetch-depth: 0` checkout.

## Reusable Workflows

- **`salesforce-code-analyzer.yml`** — run Salesforce Code Analyzer with quality
  gates; posts PR comments. Caller needs `pull-requests: write`, `contents: read`,
  `actions: read`.
- **`sf-pr-validate.yml`** — PR code health: `jest` runs `npm test` when the
  consumer's `package.json` has a `test` script (skips with a notice
  otherwise); `scratch-org` creates a 1-day scratch org from
  `config/scratch-orgs/ci.json`, deploys, assigns permission sets, runs
  `RunLocalTests` with coverage, uploads results, always deletes the org.
  Secret: `sfdx-auth-url`. Caller needs `contents: read`. See
  [docs/consuming-sf-cicd.md](docs/consuming-sf-cicd.md).
- **`sf-release.yml`** — one workflow, two phases: on `pull_request`, a delta
  package + `sf-find-tests`-selected Apex tests, check-only deploy against the
  target org, and an `sf-release-<run>` handoff artifact; on `push` to main (or
  `workflow_dispatch`), behind the caller's environment gate, quick-deploys the
  validated request (fallback: delta → full; `full-deploy: true` forces the
  full path). Secret: `sfdx-auth-url`. Caller needs `contents: read`,
  `actions: read`. See [docs/consuming-sf-cicd.md](docs/consuming-sf-cicd.md).
- **`docker-build-test-push.yml`** — build → test → push for **one** Docker image
  (callers fan out with a matrix). Buildx build with per-image GHA cache scope,
  pytest-testinfra + Trivy SARIF test stage, multi-arch Docker Hub push with
  SBOM/provenance, **keyless cosign signing**, optional Docker Hub README sync,
  and a `version-report-<image>` artifact (Node/npm/SF CLI/plugin versions read
  from the built image) for release-note aggregation. Key inputs: `image-name`,
  `context`, `push` (default `false`), `image-description`; secret:
  `dockerhub-token` (only needed when `push: true`). Caller needs
  `contents: read`, `checks: write`, `pull-requests: write`,
  `security-events: write`, and `id-token: write` (cosign). Artifact names derive
  from `image-name`, so it must be unique per caller run. Do **not** rename or
  move the workflow file — its path is part of the cosign certificate identity,
  and renaming breaks every documented `cosign verify` command.
- **`test-simple.yml`** — minimal echo workflow for verifying cross-repo calls.

## Versioning

Releases follow semver, published as git tags with a floating major tag:

| Pin | Example | Behavior |
|-----|---------|----------|
| Major tag | `@v1` | **Recommended.** Moves with every non-breaking release; you get fixes automatically. |
| Exact tag | `@v1.2.0` | Immutable; bump manually. |
| Commit SHA | `@93cb6ef…` | Strictest supply-chain pin; pair with Dependabot to stay current. |
| `@main` | — | Development only. Unreleased, may break at any time. |

Pushing a `vX.Y.Z` tag triggers [`release.yml`](.github/workflows/release.yml),
which creates the GitHub Release and force-moves the `vX` major tag. Breaking
changes bump the major (callers on the old `@v1` are unaffected until they move
to `@v2`). The release procedure for maintainers is in
[CONTRIBUTING.md](CONTRIBUTING.md#release-process).

## Repository Layout

npm-workspaces monorepo:

```text
packages/core                      # portable business logic + GitHub services (no @actions/*)
packages/github-actions-runtime    # @actions/core adapter: logger, repo-from-env, runGitHubAction
packages/github-actions            # ALL thin action adapters + their tests (one folder per action)
.github/actions/<name>             # action.yml + committed dist/index.js ONLY (built from packages/)
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

- Reference actions/workflows by release tag (`@v1`, `@v1.2.0`) — see
  [Versioning](#versioning); never `@main` in production.
- Third-party actions in this repo are pinned to full commit SHAs with a
  `# vX.Y.Z` comment; Dependabot keeps them current.
- Commit prefixes: `Add:`, `Fix:`, `Update:`, `Docs:`, `Test:`, `Refactor:`.
- Composite actions use `using: "composite"` with `shell: bash`; always clean up
  secrets in an `if: always()` step.

## License

MIT
