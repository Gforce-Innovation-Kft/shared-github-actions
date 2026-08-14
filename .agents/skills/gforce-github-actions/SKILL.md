---
name: gforce-github-actions
description: >
  GForce GitHub Actions house standards — reusable workflows from shared-github-actions@v2,
  OIDC to AWS over long-lived keys, action naming, pinned third-party tags, and the
  usage-catalog gate before any breaking change.
  TRIGGER when: authoring, editing, reviewing, or debugging a GitHub Actions workflow,
  composite action, or action.yml in a GForce repo.
  DO NOT TRIGGER when: writing Apex, LWC, Terraform, or Dockerfiles; or when the task only
  reads CI logs without changing workflow definitions.
version: 1.0.0
tags: [github-actions, cicd, gforce, workflows]
---

# GForce GitHub Actions Standard

## Step 0 — Route to the authoritative doc

Detail lives in `Gforce-Innovation-Kft/shared-github-actions`. Read the matching entry before
changing anything; the `action.yml` is the contract, the doc carries the rationale.

| Task | Read |
|---|---|
| Changing any existing action or workflow | `docs/claude-actions-reference.md` (that asset's entry) |
| Understanding how the pipeline composes | `docs/pipeline-map.md` |
| Writing or editing a TypeScript action | `docs/typescript-action-authoring.md` + `docs/architecture.md` |
| Naming a new action or workflow | `docs/adr/0002-naming-and-repo-structure.md` |
| Renaming/removing an input, output, or file | `docs/usage-catalog.md` — **mandatory, see Step 2** |
| Consuming the SF pipeline from another repo | `docs/consuming-sf-cicd.md` |
| Cutting a release | `CONTRIBUTING.md` |
| **Always, last** | `.claude/references/local-standards.md` in the current repo, if it exists |

**L3 override.** A repo's `local-standards.md` is read last and **wins** on conflict. Never copy
this skill into a repo to customize it.

## Step 1 — Hard rules

- **Reference `@v2`.** `v2` carries the ADR 0002 names; `v1` is frozen pre-rename and 404s for
  anything added since. Never write `@v1` in new work. Never `@main`.
- **Compose, never duplicate.** If `shared-github-actions` has a callable for it, call it:
  `Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-<domain>-<name>.yml@v2`
- **OIDC to AWS.** Never long-lived `AWS_ACCESS_KEY_ID` secrets.
- **`permissions: {}` at workflow level**, widened per job only as needed.
- **Pin third-party actions to the floating major tag** (`actions/checkout@v7`). Security-critical
  or unknown publishers: pin the SHA and say why in a comment.
- **Never `latest`** for a container image tag.
- **Clean up credentials in an `if: always()` step.**
- Composite actions have **no `secrets` context** — secrets arrive as inputs.

## Step 2 — The usage-catalog gate

Everything in `shared-github-actions` is consumed by other repos; a change is never local.

Before renaming or removing an input, output, or file, or changing a default:

1. Read that asset's entry in `docs/usage-catalog.md`. Note each consumer's **pinned ref** —
   `@main` breaks on merge; `@v2` is insulated until that tag moves.
2. Zero consumers shown → **confirm with the human.** The scan only sees default branches in
   this org, so zero can mean "not found", not "not used".
3. After a rename, regenerate on `main`: `./.github/scripts/build-usage-catalog.sh` (needs `gh` + `jq`).
4. A changed default is a **breaking change** when the old behaviour was load-bearing.

## Step 3 — Naming

- Actions: `<domain>-<object>-<verb>`, domain ∈ `sf` · `aws` · `github` · `git`.
  `sf-package-create`, `aws-secret-get`. **Never verb-first.**
- Callable workflows: `reusable-<domain>-<name>.yml`. Unprefixed = that repo's own CI.

## Step 4 — Layer discipline (L1–L4)

| Layer | Lives in | Contract |
|---|---|---|
| L1 | `.github/actions/<name>/` | **One** operation. No routing, no context. |
| L2 | `reusable-sf-*.yml` | Composes L1 into a pipeline. Typed inputs/outputs, explicit `secrets:`. |
| L3 | `reusable-sf-ops-dispatch.yml` | Single external entry point. Validates, routes, reports. |
| L4 | consumer repos | Thin `uses:` callers. |

L1 never calls L1. L3 inlines no Salesforce logic. No pass-through layers. Nesting caps at 4.

## Hard stops — never generate

- `@v1` or `@main` refs to `shared-github-actions`
- Long-lived AWS keys where OIDC works
- A `latest` image tag
- Inline duplication of logic that exists as a callable
- A workflow without a `permissions:` block
- A rename or removal without checking the usage catalog first
