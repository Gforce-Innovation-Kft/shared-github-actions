# CLAUDE.md

Guidance for Claude Code in this repository.

## Repository Overview

Reusable GitHub Actions for `Gforce-Innovation-Kft`: **TypeScript actions** (strict,
class-based singleton architecture, single shared source tree), **composite actions**,
and **callable workflows** for Salesforce CI/CD pipelines.

**Per-asset reference** (inputs/outputs/permissions + per-asset traps for every action
and workflow): [`docs/claude-actions-reference.md`](docs/claude-actions-reference.md) —
**read the entry for any asset before changing it.** The `action.yml` / workflow file
is the contract; the reference carries the rationale the YAML cannot.

## Where credential VALUES come from

`sf-org-login`'s `credential-source: github-env` branch reads GitHub Environment secrets/variables
(`SF_JWT_KEY_B64`, `SF_USERNAME`, `SF_CLIENT_ID`, `SF_INSTANCE_URL`) — this repo only consumes
them, it never defines them. Google Secret Manager, in
[`gforce-google-infra`](https://github.com/Gforce-Innovation-Kft/gforce-google-infra), is the
source of truth for those values; its `modules/gh-secret-sync` Terraform module mirrors them into
consumer repos' Environments (`sf-develop-demo` today). That's a stopgap for repos not yet on
`credential-source: gcp` — the not-yet-built branch that would read GCP directly via WIF instead
of GitHub Environment secrets at all (see that repo's
`docs/superpowers/specs/2026-08-19-github-secret-sync-design.md` for the full picture, including
why it's one-directional and never the other way round).

## Naming convention

Recorded in [ADR 0002](docs/adr/0002-naming-and-repo-structure.md). Two rules:

- **Actions** are `<domain>-<object>-<verb>`, domain ∈ `sf` · `aws` · `github` · `git`.
  So `sf-package-create`, `aws-secret-get`. Never verb-first.
- **Workflows** with `workflow_call` are `reusable-<domain>-<name>.yml`; unprefixed
  workflows are this repo's own CI. (GitHub forbids subdirectories under
  `.github/workflows/`, so the name is the only separator.)

## Branching

**Single branch: `main`.** `develop` was merged and deleted on 2026-08-06 — nothing in
this repo may reference `@develop`.

## Before you change ANY action or workflow: check the usage catalog

Everything here is consumed by other repositories — a change is never local.
[`docs/usage-catalog.md`](docs/usage-catalog.md) lists every known consumer of every
asset (repo, file, pinned ref); machine-readable twin in `docs/usage-catalog.json`.

**Required before renaming/removing an input, output, or file, and before changing a default:**

1. Read the catalog entry for the asset. Note each consumer's **pinned ref** — `@main`
   breaks on merge; `@v1`/`@v2` is insulated until that tag moves.
2. Zero consumers shown → confirm with the human (the scan sees default branches in
   this org only).
3. Regenerate after renames/new consumers: `./.github/scripts/build-usage-catalog.sh`
   (needs `gh` + `jq`); CI refreshes weekly. Regenerate on `main` right after a rename.
4. A changed default is a breaking change when the old behaviour was load-bearing
   (e.g. `container-user: root → 1001` waits on sf-docker-images v3.0.0).

## Reference pattern

- Actions: `Gforce-Innovation-Kft/shared-github-actions/.github/actions/<name>@v2`
- Workflows: `Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-<name>.yml@v2`
- **`v2` carries the ADR 0002 names; `v1` is frozen pre-rename** — anything added since
  404s at `@v1`. Re-point consumers to `@v2` when they migrate.
- **Self-references inside reusable workflows must be absolute** (a `./` ref resolves
  against the CALLER's repo). All are pinned to floating `@v2`; moving them to `@vX+1`
  is a release step (ADR 0002, decision 6) — never point them at a branch.

## Pipeline layers (L1–L4)

L1 `.github/actions/<name>/` = one operation · L2 `reusable-sf-*.yml` = composes L1 into a
pipeline · L3 `reusable-sf-ops-dispatch.yml` = the single external entry point · L4 = consumer
repos. L1 never calls L1; L3 inlines no Salesforce logic; nesting caps at 4.

**Full map and rationale: [`docs/pipeline-map.md`](docs/pipeline-map.md)** (mermaid — editing the
diagrams is how to specify a change). Code layering inside a TypeScript action is a different
thing: [`docs/architecture.md`](docs/architecture.md).

## TypeScript actions

All implementation in `gforce-gha-src/`; the only `.ts` outside it is each action's entry point
(getInput → `Orchestrator.execute` → setOutput, zero logic, committed esbuild `dist/index.js`).
Every class is a singleton; services touch only the `GitHubClient` facade. **95% coverage gate.**

**Before any PR: `npm run all`** must pass (format + lint + typecheck + bundle + test + `dist:verify`).

Authoring guide: [`docs/typescript-action-authoring.md`](docs/typescript-action-authoring.md).
Rationale: [`docs/architecture.md`](docs/architecture.md).

## Authoring conventions

- Reusable workflows: `workflow_call` with typed inputs/outputs. Composite actions:
  `.github/actions/<name>/action.yml`, `using: "composite"`, every shell step
  `shell: bash`.
- Commit prefixes: `Add:` `Fix:` `Update:` `Docs:` `Test:` `Refactor:`.
- Clean up credentials in an `if: always()` step.
- Third-party actions pin to the **floating major tag** (`actions/checkout@v7`) —
  never `@main`, never mixed styles. Security-critical or unknown publishers: pin the
  SHA and say why in a comment.
- Dependabot `directories:` must list every action directory containing a `uses:`
  (today: `aws-secret-get`, `sf-org-login`) — a new composite with a third-party
  `uses:` must be added or it goes unwatched.

## Internal CI traps (details in the per-asset reference)

- `ci-sf-ops-dispatch-smoke.yml` **must grant the widest permissions any dispatcher job
  requests** (`contents: write`) even for dry runs — GitHub validates the whole call
  graph up front, and a `startup_failure` produces NO check run (looks like passing).
- `catalog-refresh.yml`: the catalog is generated — never hand-edit.
- `release.yml`: a major bump is two steps — rewrite self-references to `@vX+1` first,
  then tag (CONTRIBUTING.md).

## AI layer

- **L2 skill `gforce-github-actions`** — house standards, installed via `skills-lock.json`.
  Routes to the `docs/` above; read the entry for any asset before changing it.
- **L2 agent `gha-workflow-author`** — writes and reviews workflows. Write scope is bounded to
  `.github/**`; it never commits or pushes.
- **L3 override** — repo-specific rules go in `.claude/references/local-standards.md`. Shared
  skills read it last and it wins. **Never fork a shared skill into this repo.**

<!-- skills-tooling -->
## Skills & AI tooling

Eight repo-scoped skills are committed. They live in `.agents/skills/`, are symlinked
into `.claude/skills/`, and are pinned by content hash in
[`skills-lock.json`](skills-lock.json). All are vendored from upstream — do not
hand-edit a vendored `SKILL.md`; the next update overwrites it and the hash stops
matching.

> **`npx skills check` is not read-only** — despite the name it fetches upstream and
> rewrites the `SKILL.md` files and `skills-lock.json` in place, so it dirties the
> working tree. Run it deliberately, on its own branch, and review the diff and the
> changed hashes as a real content change; never run it mid-PR expecting a report.

Invoke the relevant one when the task matches:

| Skill | Upstream | Use when |
|-------|----------|----------|
| `github-actions-docs` | xixu-me/skills | Authoring or editing a workflow / `action.yml` — keeps YAML aligned with current GitHub Actions syntax (composite, reusable, TypeScript action patterns). The default for most work in this repo. |
| `github-actions-templates` | wshobson/agents | Scaffolding a *new* workflow from a known-good shape, rather than editing an existing one. |
| `code-review` | mattpocock/skills | Reviewing the TypeScript under `gforce-gha-src/` for quality and correctness. |
| `requesting-code-review` | obra/superpowers | Preparing a change for review, before opening the PR. |
| `receiving-code-review` | obra/superpowers | Responding to review feedback on a PR. |
| `dx-org-manage` | forcedotcom/sf-skills | Running scratch-org or snapshot operations against a real org by hand — reproducing what `sf-org-scratch-create` and the `validate` job do, when debugging why they fail. |
| `dx-org-permission-set-assign` | forcedotcom/sf-skills | Assigning permission sets to org users — the step `reusable-sf-pr-validate` performs inside its scratch org. |
| `dx-pkg-post-install-configure` | forcedotcom/sf-skills | Post-install configuration of a managed package — what a consumer does *after* `sf-package-install` lands a version. |

The three `dx-*` skills execute SF CLI operations against a live org. They are here
because this repo's composite actions wrap those same commands, so the skills are how
you reproduce a failing pipeline step interactively. They are **not** a way to change
pipeline behaviour: an action's behaviour lives in its `action.yml`.

**Global tooling available in every session:** rtk (Bash output compression — automatic via hook), lean-ctx (prefer `ctx_*` MCP tools for reads/search — token-compressed), and superpowers process skills.
<!-- /skills-tooling -->
