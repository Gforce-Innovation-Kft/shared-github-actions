# 0001 — Salesforce ops dispatch layer

- **Status:** accepted
- **Date:** 2026-08-06
- **Affects:** `.github/workflows/reusable-sf-ops-dispatch.yml`, `.github/actions/sf-ops-callback`,
  `.github/actions/sf-package-promote`, `.github/actions/sf-package-install`,
  `.github/actions/sf-org-login`

## Context

`shared-github-actions` had two of the four intended layers: **L1** capability actions and
**L2** reusable workflows. Salesforce could already fire at GitHub — `GitHubActionsService`
does `workflow_dispatch`, `GitHubDispatchService` does `repository_dispatch`, both with a
GitHub App installation token — but nothing on the GitHub side received it. The only handlers
that existed (`sf-develop-demo/.github/workflows/dispatch-*.yml`) accepted any payload, did
nothing, and reported green.

So an LWC could start work it could not name, could not trace, and could not learn the outcome
of. This ADR records the design of **L3**, the dispatch layer that closes those three holes.

| Layer | Lives in | Contract |
|---|---|---|
| L1 | `.github/actions/*` | One Salesforce/CLI operation each. No branching between operations, no knowledge of why it was invoked. |
| L2 | `.github/workflows/sf-*.yml` | Composes L1 into a pipeline with business meaning. Typed inputs/outputs, explicit `secrets:`. Never triggered by a human or by Salesforce. |
| **L3** | `.github/workflows/reusable-sf-ops-dispatch.yml` | **The single external entry point.** Validates, routes to exactly one L2/L1 path, reports the terminal status back. |
| L4 | consumer repos (`sf-develop-demo`) | Thin `uses:` callers. Out of scope here except for the contract they honour — see [consuming-sf-dispatch.md](../consuming-sf-dispatch.md). |

## Decision 1 — Accept both entry points, normalize once

**Decision.** L3 is a `workflow_call` workflow. The L4 caller declares both
`repository_dispatch: [sf_ops_requested]` and `workflow_dispatch` and forwards either into the
same `uses:`. L3's `normalize` job reads `github.event.client_payload` when present and falls
back to the forwarded inputs — `github.event` is visible inside a called workflow, which
`sf-release.yml` already relies on.

**Why.** Both mechanisms already exist on the Salesforce side and neither is sufficient alone.

**Rejected — `repository_dispatch` only.** It only ever runs the default branch's workflow file,
so a change to the dispatcher could never be exercised on a PR branch before merging.

**Rejected — `workflow_dispatch` only.** Hard cap of 10 inputs, and the workflow file must
already exist on the target ref. It also has no `client_payload`, so every future field costs a
typed input.

## Decision 2 — Static routing jobs, and a fail-closed report job

**Decision.** One job per operation, each guarded by
`if: needs.normalize.outputs.operation == '<op>'`. A `report` job `needs:` every route, runs
`if: always()`, and computes `succeeded | failed | cancelled | no-route`. It exits non-zero
unless the status is `succeeded`.

**Why.** GitHub does not allow expressions in `uses:`, so routing cannot be dynamic. The real
hazard is the other half: **GitHub reports a skipped job as green**, so an operation matching no
route would look like success to both the run list and the requester. `report` is the only thing
standing between a typo and a false green. Adding an operation stays a local change: one entry in
`normalize`'s allow-list, one job.

**Rejected — one job with `if:` chains inside.** Unreadable past two operations, and skipped
steps still report green, so it reintroduces the exact failure it was meant to avoid.

## Decision 3 — The run calls Salesforce back

**Decision.** A terminal `sf-ops-callback` (L1) POSTs the outcome to an Apex REST endpoint, keyed
by the requester's `correlation-id`. It runs in the `if: always()` `report` job, so a failed
operation still produces a callback with `status: failed`.

**Why.** Both dispatch APIs return **HTTP 204 with an empty body**. The requester never learns a
run id.

**Rejected — the LWC polls `GET /actions/runs`.** To poll, it must first find the run, which means
searching runs by `run-name` after a 204. That is racy in a way that cannot be fixed from the
client: for several seconds after the 204 the run does not exist yet, and "not created yet" is
indistinguishable from "rejected". It also costs a REST call per poll per user, against a shared
installation rate limit. `run-name:` still carries the correlation id, but for humans reading the
run list — not as a lookup key.

**Consequence.** A rejected request must still be reportable, so `normalize` does not fail the job
on a bad request. It sets `valid=false` and passes the reason to `report`, which calls back and
*then* fails the run. The one unreportable case is a malformed `correlation-id`, since there is
then no key to record against; that run warns and fails.

## Decision 4 — Correlation id keys concurrency, and each operation is idempotent

**Decision.** Two mechanisms, because they cover different retries.

1. `concurrency: group: sf-ops-<correlation-id>, cancel-in-progress: false` — a duplicate
   delivery **while the first run is in flight** queues behind it.
2. Per-operation already-done detection for a retry **after** the first run finished:
   `promote` returns `already-released`, `install` preflights `InstalledSubscriberPackage` and
   returns `already-installed`. Both are successes, not failures.

`cancel-in-progress` stays `false` on purpose: cancelling a package build orphans a scratch org
and abandons a `Package2VersionCreates` slot that has already been spent.

**Why.** A correlation id is only an idempotency key if something enforces it. The concurrency
group alone does not — a retry 40 minutes later starts cleanly and burns a second quota slot.

**Rejected — a git tag as a claim ticket.** TOCTOU between `git ls-remote` and `git push`, and it
permanently pollutes the tag namespace with one tag per request.

**Not yet closed.** `create-version` has no equivalent short-circuit: `sf package version create`
already accepts `--tag`, which writes a queryable `Package2Version.Tag`, so a preflight SOQL can
resolve an existing `04t` for the same correlation id without touching the quota. `sf-package-create`
hardcodes `--tag "$GITHUB_SHA"` today; making it an input and threading `corr:<id>` through is the
remaining work.

## Decision 5 — The dispatcher defends itself

**Decision.** Apex decides *who* may promote or install. The dispatcher assumes that decision can
be wrong or forged and defends independently:

- `normalize` allow-lists `operation` and regex-validates every value **before any other job
  runs**: `correlation-id` `^[A-Za-z0-9_-]{8,64}$`, `version-id` `^04t[A-Za-z0-9]{12,15}$`,
  `package` `^[A-Za-z0-9 ._-]{1,80}$`, `target-org-alias` `^[A-Za-z0-9._-]{1,80}$`.
- `promote` and `install` run under a GitHub `environment:`. Promotion is irreversible and a
  released version is installable by subscribers forever; installing into production is not a dev
  action.
- Workflow-level `permissions: {}`; each job opts in to the minimum (`normalize` needs none).
- Untrusted values reach `github-script` through `env:` only. A `${{ }}` inside a `script:` body is
  string-substituted before Node parses it — that is script injection, not templating.

**Rejected — trusting the Apex authorization alone.** It is one JWT away from being the only
control, and it cannot defend the runner against its own inputs.

## Implementation tiers

Every L1 action declares the cheapest tier that holds. Tier 1 is the default; escalate only when
the tier below produces unreadable YAML, and downgrade when the reverse is true.

| Component | Tier | Justification |
|---|---|---|
| `sf-ops-callback` | **1** — composite | Build a payload, one `sf api request rest` POST, one step summary. Straight-line shell. |
| `sf-package-promote` | **1** — composite | `sf package version promote` is **synchronous** — there is no request object to poll. The validation guard is one Tooling query and one boolean. |
| `sf-package-install` | **1** — composite | `sf package install --wait` polls to a terminal state **inside the CLI**. Same shape as the existing `sf-package-create`: run, capture JSON, surface `SubscriberPackageVersionInstallRequest.Errors` on failure. |
| `sf-package-resolve` (next) | **3** — TypeScript | Version-number ordering and 2GP's **non-transitive** dependency flattening are a data model plus an algorithm — the only genuinely unit-testable logic in this batch. |
| `normalize` + `report` | **2** — `actions/github-script` | Pure GitHub-side glue: read context, validate, aggregate `needs`, set outputs. No bundle, no `dist/`, no Salesforce CLI. |

Two deliberate disagreements with the original brief, which invited them:

- It expected `sf-package-promote` and `sf-package-install` to be Tier 3. They are not. Neither
  needs a polling loop, retry/backoff, or a data model — the CLI already provides what Tier 3
  would have been written to provide. *"Do not write a Tier 3 action for something a six-line
  composite already does correctly."*
- It named `actions/github-script@v7`. This repo's existing usage is `@v9`
  (`sf-release.yml:254`); the two in-repo docs that mention a version disagree with each other
  (`@v7` and `@v8`). New code follows the code, not the docs: **`@v9`**.

`sf-run-tests` was also in the brief's gap list and is **not** built. It serves none of the
operations in the definition of done and duplicates `sf-pr-validate.yml`, which already runs
`RunLocalTests` with coverage in a scratch org.

## Consequences

- The chain is traceable end to end by a single correlation id, and it cannot silently no-op.
- Adding an operation touches exactly two places in one file, plus its L1 action.
- `run-name:` cannot carry the correlation id from here — a called workflow's `run-name` is
  ignored, the caller's applies. The L4 template sets it; see
  [consuming-sf-dispatch.md](../consuming-sf-dispatch.md).
- `sf-org-login` now emits a masked `access-token`, because Tier 3 actions talk to the Salesforce
  APIs directly rather than shelling out to `sf`. Emitting it is squarely a login action's job and
  keeps Salesforce logic out of the dispatcher, but it widens what a compromised step can read.
- The smoke path can prove routing, aggregation and the callback contract with no org, no secret
  and no quota. It cannot prove the Salesforce operations themselves.
