# Shared GitHub Actions

Reusable GitHub Actions for `Gforce-Innovation-Kft`: **TypeScript actions** (a portable
core + thin adapters), **composite actions**, and **callable workflows** for
Salesforce CI/CD. Reference them from any repo in the org.

```text
TypeScript action: Gforce-Innovation-Kft/shared-github-actions/.github/actions/<name>@v2
Composite action:  Gforce-Innovation-Kft/shared-github-actions/.github/actions/<name>@v2
Reusable workflow: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-<name>.yml@v2
```

See [Versioning](#versioning) for how to pin (`@v2`, `@v2.0.0`, or a full
commit SHA — avoid `@main` in production callers).

**Naming** ([ADR 0002](docs/adr/0002-naming-and-repo-structure.md)): actions are
`<domain>-<object>-<verb>` (`sf-package-create`, `aws-secret-get`,
`github-branch-sync`); workflows you may call are prefixed `reusable-`, and
anything unprefixed is this repo's own CI.

> **Pin `@v2` for everything below.** `v1` is frozen at the pre-rename layout and
> contains only `get-aws-secret`, `create-release-pr`, `sync-branches`,
> `sf-delta-package`, `sf-find-tests`, `sf-jwt-login`, `sf-org-login`, plus the
> unprefixed `salesforce-code-analyzer.yml`, `sf-pr-validate.yml` and
> `sf-release.yml`. Everything else on this page — the `sf-package-*` actions,
> `sf-org-scratch-create`, `sf-ops-callback`, the dispatcher — does not exist at
> `@v1` at all, so a `@v1` ref to one of those fails to resolve.

**New here?** [`docs/pipeline-map.md`](docs/pipeline-map.md) is the whole system
on one page: flow diagrams of the four layers, the Salesforce dispatch chain, and
what is still missing. The same content as sortable tables:
[`docs/sf-cicd-pipeline-map.xlsx`](docs/sf-cicd-pipeline-map.xlsx).

## TypeScript Actions

Thin Node20 entry points over a strict, class-based singleton architecture in
`gforce-gha-src/`. Each ships a committed `dist/index.js`. Full input/output
lists live in each `action.yml`; runnable callers are in [`examples/`](examples).

### `github-branch-sync`

Synchronize one branch into another: fast-forward when possible, else a
server-side merge, else open a "sync" pull request on conflict.

- **Key inputs:** `source-branch`*, `target-branch`*, `strategy` (`auto` | `fast-forward` | `merge`, default `auto`), `dry-run` (default **`true`**), `github-token` (default `${{ github.token }}`).
- **Key outputs:** `synced`, `action`, `result-sha`, `pull-request-number`, `pull-request-url`, `ahead-by`, `behind-by`, `reason`.
- **Permissions:** `contents: write` (moves the target ref / merges) + `pull-requests: write` (opens the sync PR on conflict).

### `github-release-pr-create`

Create or update a release pull request between two branches, with a templated
title/body, labels, and reviewers.

- **Key inputs:** `source-branch`*, `target-branch`*, `release-version`*, `title`, `body-template` (`{{version}}`/`{{source}}`/`{{target}}`/`{{commits}}`/`{{files}}`), `draft` (default `false`), `labels`, `reviewers`, `dry-run` (default **`true`**), `github-token` (default `${{ github.token }}`).
- **Key outputs:** `pull-request-number`, `pull-request-url`, `created`, `updated`.
- **Permissions:** `contents: read` (compare only) + `pull-requests: write`.

> `dry-run` defaults to `true` on both actions — a caller must explicitly opt in
> to mutating state.

### `sf-apex-test-select`

Select the Apex test classes relevant to a delta `package.xml` — naming-convention
matches plus a reference scan of test classes in the source tree.

- **Key inputs:** `package-xml`*, `source-dir` (default `force-app`),
  `test-suffixes` (default `Test,_Test,Tests`), `github-token` (default
  `${{ github.token }}` — this action makes no GitHub API calls; the input
  exists only for the shared runtime).
- **Key outputs:** `tests`, `test-count`, `has-apex`.
- **Permissions:** none (no GitHub API calls).

## Composite Actions

- **`aws-secret-get`** — fetch a secret from AWS Secrets Manager via OIDC role
  assumption; JSON fields are exported as env vars (reference them as
  `${{ env.FIELD }}`, not step outputs). Requires `id-token: write` +
  `contents: read`.
- **`sf-org-login`** — authenticate to a Salesforce org, either from an SFDX auth
  URL held in a GitHub secret (`auth-method: auth-url`, the default, no cloud
  dependency) or via the JWT bearer flow with credentials from AWS Secrets
  Manager (`auth-method: jwt`, needs `id-token: write` + `aws-role-arn`).
  Outputs `org-id`, `username`, `instance-url`, `access-token` (masked); cleans
  up every credential file in an `if: always()` step.
  Replaces the former `sf-jwt-login` — see [CLAUDE.md](CLAUDE.md#sf-org-login--githubactionssf-org-loginactionyml).
- **`sf-source-delta`** — generate a delta `package.xml` between two git refs
  with sfdx-git-delta. Inputs `from-ref`*, `to-ref`, `output-dir`, `source-dir`,
  `generate-delta`; outputs `package-path`, `has-changes`, `component-count`.
  Requires a `fetch-depth: 0` checkout.
- **`sf-org-scratch-create`** — create a scratch org, refusing to start when the Dev Hub
  has no capacity (both `ActiveScratchOrgs` and `DailyScratchOrgs` are checked).
  **Does not delete the org** — composite actions cannot register a `post:` step,
  so pair it with your own `if: always()` `sf org delete scratch`.
- **`sf-package-create`** — build **one** 2GP package version: Dev Hub headroom
  preflight, `sf package version create`, and `Package2VersionCreateRequestError`
  evidence on failure. Outputs `package-name`, `version-id` (`04t`),
  `version-number`. Needs only `contents: read` — the provenance tag is pushed by
  `reusable-sf-package-release.yml`, not here.
- **`sf-package-promote`** — promote a `04t` to released. Refuses a version built
  with `--skip-validation` unless `allow-unvalidated`; an already-released
  version is success, not failure. Outputs `status`, `version-number`.
- **`sf-package-install`** — install one `04t` into a target org, polling to a
  terminal state. Preflights the org so an already-installed version is success;
  surfaces Salesforce's own install errors on failure. Outputs `status`,
  `install-request-id`.
- **`sf-ops-callback`** — report a dispatched operation's terminal status back
  into Salesforce, keyed by the requester's correlation id. `dry-run: true`
  renders the payload without posting.

## Reusable Workflows

- **`reusable-sf-ops-dispatch.yml`** — **L3, the single external entry point** for
  Salesforce-initiated operations (`create-version`, `promote`, `install`).
  Validates the request, routes it to exactly one L2/L1 path, and reports the
  terminal status back through `sf-ops-callback`. An operation that matches no
  route fails the run instead of showing green. See
  [ADR 0001](docs/adr/0001-salesforce-dispatch-layer.md) and
  [docs/consuming-sf-dispatch.md](docs/consuming-sf-dispatch.md).

- **`reusable-sf-package-release.yml`** — **L2, the 2GP release pipeline**:
  `validate` (the only job that spends a scratch org — skip it with
  `run-validate: false`) → `package` (`sf-package-create`, then push the annotated
  `pkg/<package>/<versionNumber>` provenance tag) → `release` (cut the GitHub
  Release; runs even when validation was skipped). Jobs are ordered by cost, not
  dependency: a tree that does not compile spends zero of the 6/day validated
  package creates. Outputs `version-id` (`04t`), `version-number`, `git-tag`.
  Secrets: `sfdx-auth-url` (required, Dev Hub), `scratch-org-auth-url` (optional —
  validate in an existing org and keep it, for debugging the flow). Caller needs
  `contents: write`.

- **`reusable-sf-code-analyze.yml`** — run Salesforce Code Analyzer with quality
  gates; posts PR comments. Caller needs `pull-requests: write`, `contents: read`,
  `actions: read`.
- **`reusable-sf-pr-validate.yml`** — PR code health: `jest` runs `npm test` when the
  consumer's `package.json` has a `test` script (skips with a notice
  otherwise); `scratch-org` creates a 1-day scratch org from
  `config/scratch-orgs/ci.json`, deploys, assigns permission sets, runs
  `RunLocalTests` with coverage, uploads results, always deletes the org.
  Secret: `sfdx-auth-url`. Caller needs `contents: read`. See
  [docs/consuming-sf-cicd.md](docs/consuming-sf-cicd.md).
- **`reusable-sf-release.yml`** — one workflow, two phases: on `pull_request`, a delta
  package + `sf-apex-test-select`-selected Apex tests, check-only deploy against the
  target org, and an `sf-release-<run>` handoff artifact; on `push` to main (or
  `workflow_dispatch`), behind the caller's environment gate, quick-deploys the
  validated request (fallback: delta → full; `full-deploy: true` forces the
  full path). Secret: `sfdx-auth-url`. Caller needs `contents: read`,
  `actions: read`. See [docs/consuming-sf-cicd.md](docs/consuming-sf-cicd.md).

> **Docker moved out.** `docker-build-test-push.yml` now lives in
> [`sf-docker-images`](https://github.com/Gforce-Innovation-Kft/sf-docker-images)
> as `.github/workflows/reusable-docker-image-build.yml`, alongside its only
> consumer. See [ADR 0002](docs/adr/0002-naming-and-repo-structure.md),
> decision 3. This repository covers Salesforce, GitHub, and AWS.

### Internal CI (not callable)

Workflows without the `reusable-` prefix are this repo's own CI: `ci.yml`
(quality + smoke), `ci-sf-ops-dispatch-smoke.yml` (routes all three dispatcher
operations with `dry-run: true`), `catalog-refresh.yml` (weekly consumer rescan,
opens a PR on drift), and `release.yml` (tag → Release + floating major tag).

## Versioning

Releases follow semver, published as git tags with a floating major tag:

| Pin | Example | Behavior |
|-----|---------|----------|
| Major tag | `@v2` | **Recommended.** Moves with every non-breaking release; you get fixes automatically. |
| Exact tag | `@v2.0.0` | Immutable; bump manually. |
| Commit SHA | `@93cb6ef…` | Strictest supply-chain pin; pair with Dependabot to stay current. |
| `@main` | — | Development only. Unreleased, may break at any time. |

Pushing a `vX.Y.Z` tag triggers [`release.yml`](.github/workflows/release.yml),
which creates the GitHub Release and force-moves the `vX` major tag. Breaking
changes bump the major (callers on the old `@v1` are unaffected until they move
to `@v2`).

`v2.0.0` is the breaking release: it renames every action and workflow per
[ADR 0002](docs/adr/0002-naming-and-repo-structure.md). Migrating from `@v1` means
changing the paths in your `uses:` lines, not just the tag — the mapping table is
in decisions 1 and 2 of that ADR.

The release procedure for maintainers is in
[CONTRIBUTING.md](CONTRIBUTING.md#release-process). It has a manual step: a major
bump must rewrite the reusable workflows' own self-references to the new tag
*before* tagging.

**Development happens on `main`.** `develop` was merged and deleted on 2026-08-06 —
open PRs against `main`.

## Repository Layout

npm-workspaces monorepo:

```text
gforce-gha-src/                    # ALL TypeScript implementation (single source of truth):
                                   #   actions/<name>/ (Orchestrator + Validator singletons),
                                   #   clients/github/ (sub-clients + facade), services/,
                                   #   libraries/salesforce/, selectors, utils, __tests__/
.github/actions/<name>             # action.yml + entry index.ts + committed esbuild dist/index.js
.github/actions/aws-secret-get     # composite actions
.github/workflows                  # CI + reusable workflows
.github/scripts                    # build-usage-catalog.sh (regenerates docs/usage-catalog.*)
examples/                          # runnable caller workflows
docs/                              # architecture + authoring guides + pipeline map
docs/adr/                          # architecture decision records
.agents/skills/                    # vendored agent skills (symlinked into .claude/skills/)
skills-lock.json                   # content hashes for the vendored skills
```

See [`docs/architecture.md`](docs/architecture.md) for the layering and
[`docs/typescript-action-authoring.md`](docs/typescript-action-authoring.md) for
how to add the next action.

## Development

```bash
npm ci                  # install workspaces (Node 20+)
npm run all             # format:check + lint + typecheck + bundle + test + dist:verify
npm run test:all        # all workspace tests (95% coverage gate, 100% actual)
npm run bundle:all      # rebuild every action's dist/index.js (esbuild)
npm run typecheck:all   # tsc --noEmit across workspaces
```

**Run `npm run all` and ensure it passes before opening a PR.** A pre-commit hook
rebuilds and re-stages action bundles; CI's `dist:verify` fails on a stale bundle.

## Conventions

- Reference actions/workflows by release tag (`@v2`, `@v2.0.0`) — see
  [Versioning](#versioning); never `@main` in production.
- Third-party actions in this repo are pinned to full commit SHAs with a
  `# vX.Y.Z` comment; Dependabot keeps them current.
- Commit prefixes: `Add:`, `Fix:`, `Update:`, `Docs:`, `Test:`, `Refactor:`.
- Composite actions use `using: "composite"` with `shell: bash`; always clean up
  secrets in an `if: always()` step.

## License

MIT
