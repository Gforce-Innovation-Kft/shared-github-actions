# Part 1 — `sf-package-create`: composite + TypeScript action, and the reusable workflow

**This document is a prompt for Claude Code.** Execute it top to bottom. Each task has a goal,
the files it touches, and a verification gate you must pass before moving on.

**Repository:** `shared-github-actions` (this repo — not a new one).
**Depends on:** nothing.
**Blocks:** Part 2 (`plans/2026-08-05-part2-sf-selfheal.md`).
**Design reference:** `specs/2026-08-05-sf-selfheal-design.md` — read §4 (correlation), §5 (build
pipeline), §14 (composite vs JS) before starting. Do not read the whole thing; those three
sections are what Part 1 implements.

---

## What you are building

A reusable workflow plus **two implementations of the same action**, so they can be benchmarked
against each other in real CI:

| Artifact | Path | What it is |
|---|---|---|
| Composite action | `.github/actions/sf-package-create/` | `sf` CLI in bash |
| TypeScript action | `.github/actions/sf-package-create-node/` | `@salesforce/core` + `@salesforce/packaging`, strict singleton architecture |
| Reusable workflow | `.github/workflows/sf-package-create.yml` | `workflow_call`, selects the implementation |
| Benchmark | `tools/bench/` + `docs/bench/` | measures both, publishes the numbers |

Both implementations must be **behaviourally identical** — same inputs, same outputs, same
artifacts, same exit codes. The benchmark is only meaningful if they are interchangeable.

### What the action does

1. **Preflight** — read Dev Hub limits; if `Package2VersionCreates` headroom is below threshold,
   fail fast with a clear message rather than burning the last slot.
2. **Digest** — compute the workspace digest over the package's `packageDirectories` (post
   `.forceignore` filtering) plus `sfdx-project.json` and `.forceignore` themselves.
3. **Create** — `sf package version create` with `--tag <sha>`, `--branch <branch>`, and
   `--version-description "build:<digest12> run:<runId>"`. Poll to a terminal state.
4. **On success** — push an annotated git tag `pkg/<package>/<versionNumber>` at the commit,
   with full provenance in the tag message. Emit outputs.
5. **On failure** — query the Dev Hub for `Package2VersionCreateRequest` and
   `Package2VersionCreateRequestError` for the request id, write an evidence bundle artifact,
   exit non-zero.

### Explicitly out of scope for Part 1

Do not build these — they belong to Part 2:

- The three-snapshot mutation record (T0/T1/T2) and S3 provenance upload. Part 1 computes the
  **final** digest only; instrumenting the whole pipeline comes later.
- Anything AI: no agent, no model call, no knowledge corpus, no healer.
- Package promotion, install, or delete.

---

## Guardrails

- **Never `any`**, no non-null assertions, no type assertions. Explicit return types on all
  exported functions. `readonly` by default, `undefined` over `null`, string-literal unions over
  `enum`.
- **The entry point has zero logic** — `core.getInput` → `Orchestrator.execute` →
  `core.setOutput` / `core.setFailed`.
- **All input validation lives in the Validator.** Never in the entry, never in the Orchestrator.
- **Composite actions parse JSON with `node`, not `jq`** — `jq` is not guaranteed inside the
  SF CLI container. This is an existing repo convention; follow it.
- **Every shell step in a composite action specifies `shell: bash`.**
- **Clean up credentials in an `if: always()` step.**
- **Never lower the 95% coverage gate.** Keep it at 100%.
- **Always commit `dist/`, never `node_modules/`.**
- **Do not modify the existing actions** (`sync-branches`, `create-release-pr`,
  `sf-find-tests`) except to register the new workspaces.
- **Do not invent Salesforce CLI flags or Tooling API field names.** Task 1 verifies them
  against the installed CLI. If a flag in this plan disagrees with the CLI, the CLI wins — and
  say so in your progress report.

---

## Task 1 — Ground truth and setup

**Goal:** verify every external API surface this plan assumes, before writing code against it.

1. Read `docs/typescript-action-authoring.md` and `docs/architecture.md` in full. They define the
   architecture you must follow; this plan does not restate them.
2. Invoke the `github-actions-docs` skill when writing any `action.yml` or workflow YAML.
3. Verify against the **installed** SF CLI (`sf --version`), not from memory:
   - `sf package version create --help` — confirm `--tag`, `--branch`,
     `--version-description`, `--code-coverage`, `--skip-validation`, `--wait`, `--json`.
   - `sf package version create report --help` — confirm the request-id flag.
   - `sf org list limits --help` — confirm the limit name for package version creates.
   - `sf data query --use-tooling-api` against a Dev Hub for `Package2VersionCreateRequest` and
     `Package2VersionCreateRequestError` — confirm field names, especially the foreign key from
     error → request.
4. Verify the npm surface: `npm view @salesforce/packaging version` and
   `@salesforce/core version`. After installing, **read the shipped `.d.ts` files** to confirm
   the actual exported class and method names for creating and reporting a package version and
   for opening a Tooling connection. Do not write those calls from memory.
5. Record everything you verified in `docs/bench/ground-truth.md` — flag name, field name, source
   command, date, and any place this plan was wrong.

**Gate:** `docs/bench/ground-truth.md` exists and every flag and field used later in this plan
appears in it, marked confirmed or corrected.

---

## Task 2 — Composite action

**Goal:** the simplest working implementation. This is the reference behaviour the TS version
must match.

**Files:** `.github/actions/sf-package-create/action.yml`

Inputs (all optional except where noted; derive rather than require — see design §15):

| Input | Default | Notes |
|---|---|---|
| `package` | *(derived)* | default `packageDirectories` entry; required only for multi-package projects |
| `dev-hub-alias` | `devhub` | |
| `wait-minutes` | `60` | |
| `code-coverage` | `true` | |
| `skip-validation` | `false` | mutually exclusive with `code-coverage` — validate this |
| `installation-key-bypass` | `true` | |
| `preflight-min-headroom` | `2` | remaining creates below this → fail fast |
| `push-tag` | `true` | |
| `evidence-path` | `evidence` | |

Outputs: `version-id` (`04t`), `package-version-id` (`05i`), `version-number`, `request-id`,
`status`, `workspace-digest`, `git-tag`, `evidence-path`.

Steps:

1. Derive `package` from `sfdx-project.json` when not supplied. Fail with a clear message if the
   project defines more than one package and none was given.
2. Preflight limits. Fail fast below `preflight-min-headroom`.
3. Compute the workspace digest (§5 of the design). Implement as a small Node script under
   `.github/actions/sf-package-create/scripts/` — **not** a shell pipeline; `.forceignore`
   filtering is not something to write in bash.
4. `sf package version create … --json`, capture the request id, poll with
   `sf package version create report`.
5. On success and `push-tag: true`, create and push the annotated tag. Tag body per design §4.
   Skip silently if the tag already exists (a rerun must not fail here).
6. On failure, query both Tooling objects and write `<evidence-path>/evidence-bundle.json`.
7. `if: always()` cleanup of any auth artifacts.

**Gate:** `actionlint` clean; the action runs end-to-end against a real Dev Hub, producing a
version and a pushed tag; a deliberately broken `sfdx-project.json` produces an evidence bundle
containing a non-empty `Package2VersionCreateRequestError` message.

---

## Task 3 — Reusable workflow

**Goal:** one entry point for consumers; lets the benchmark run either implementation.

**Files:** `.github/workflows/sf-package-create.yml`

- `workflow_call` with typed inputs mirroring the action, plus
  `implementation: composite | node` (default `composite`).
- Secret: `sfdx-auth-url` (required).
- Runs in `container: gforceinnovation/sf-ci:latest`.
- Checkout with `fetch-depth: 0` (tag resolution and future diffing need full history).
- Declares `permissions: contents: write` (tag push) in the example, and documents it.
- Uploads the evidence artifact on failure, the version report on success.
- Typed outputs matching the action outputs.

**Gate:** `actionlint` clean; a consumer workflow in `examples/sf-package-create.yml` calls it
with `secrets: inherit` and no required inputs.

---

## Task 4 — TypeScript action: types and validator

**Goal:** the typed contract, following `docs/typescript-action-authoring.md` exactly.

**Files:**
- `gforce-gha-src/types/index.ts` — add `ValidatedSfPackageCreateInputs` and the result DTO.
- `gforce-gha-src/libraries/salesforce/models/types.ts` — Salesforce-shaped DTOs
  (`PackageVersionCreateRequest`, `PackageVersionCreateRequestError`, `PackageVersionResult`,
  `DevHubLimits`, `WorkspaceDigest`).
- `gforce-gha-src/actions/sf-package-create/validator.ts` — `Validator` singleton with
  `inputValidation(rawInputs: unknown)`.

Validation rules: `package` optional (resolved later), `wait-minutes` a positive integer,
booleans via `parseBoolean`, `code-coverage` and `skip-validation` not both true,
`preflight-min-headroom` a non-negative integer.

**Gate:** `npm run typecheck:all` passes; validator unit tests cover every rule including both
rejection paths.

---

## Task 5 — TypeScript action: Salesforce client

**Goal:** one thin wrapper per Salesforce operation, mirroring the `clients/github` pattern —
error mapping only, no business logic, no logging.

**Files:** `gforce-gha-src/libraries/salesforce/clients/`
- `salesforce-connection-client.ts` — holds the `@salesforce/core` connection. Token-holding, so
  follow the `GitHubBranchesClient` pattern: `getInstance(alias)` with a mismatch guard plus
  `newInstance(alias)`.
- `package-version-client.ts` — create, report, query request + error records, query
  `Package2Version`.
- `org-limits-client.ts` — read Dev Hub limits.

Throw `SalesforceApiError` (add to `utils/errors.ts` alongside the existing typed errors).

**Gate:** unit tests mock at the client boundary; no `any`; clients contain no `LoggerService`
calls.

---

## Task 6 — TypeScript action: services

**Goal:** the business workflow as singleton services.

**Files:**
- `gforce-gha-src/libraries/salesforce/services/package-version-service.ts` — preflight, create,
  poll, enrich-on-failure. Talks only to the clients above.
- `gforce-gha-src/libraries/salesforce/services/workspace-digest-service.ts` — resolve package
  directories from `sfdx-project.json`, apply `.forceignore` filtering, compute the digest per
  design §5. Uses `FileSystemService`.
- `gforce-gha-src/services/git-tag-service.ts` — create and push the annotated tag; idempotent
  (existing tag is a no-op, not an error).
- `gforce-gha-src/libraries/salesforce/services/evidence-service.ts` — assemble and write the
  evidence bundle. **Redact before writing** — auth URLs, tokens, JWT keys.

**Gate:** 100% coverage on all four; the digest service has a test proving `.forceignore` changes
the digest with no source file changed; the tag service has a test proving re-running is a no-op.

---

## Task 7 — TypeScript action: orchestrator, entry, manifest

**Goal:** wire it together and register the workspace.

**Files:**
- `gforce-gha-src/actions/sf-package-create/orchestrator.ts` — `execute()` reads as a numbered
  list of delegated steps. No loops, no regex, no transformations, no I/O.
- `.github/actions/sf-package-create-node/index.ts` — the entry skeleton from the authoring doc.
- `.github/actions/sf-package-create-node/action.yml` — `using: node20`, `main: dist/index.js`,
  identical inputs/outputs to the composite action.
- `.github/actions/sf-package-create-node/package.json` — copy an existing action's shape.
- Register in root `package.json` `workspaces` and in `.github/actions/package.json` `build:all`.

**Gate:** `npm run bundle:all` produces `dist/index.js`; `npm run all` passes clean.

---

## Task 8 — Tests

**Goal:** the coverage gate and a real end-to-end path.

**Files:** `gforce-gha-src/__tests__/` mirroring source paths, plus
`__tests__/integration/sf-package-create.integration.test.ts`.

Follow the repo conventions exactly: `method_scenario_expectedResult` names, `// Given` / `// When`
(exactly one call) / `// Then`, mock at the singleton boundary, `resetInstance()` in `afterEach`
for every touched singleton, typed errors via `toBeInstanceOf` + `toThrow('<message>')`.

The integration test drives `Orchestrator.execute()` end-to-end with clients mocked, and asserts
`dist/index.js` exists.

**Gate:** `npm run all` passes with coverage at 100%.

---

## Task 9 — Benchmark

**Goal:** answer the composite-vs-TS question with numbers instead of argument.

**Files:** `tools/bench/` (harness) and `docs/bench/package-create.md` (results).

Read design §14 first. **The create call is I/O-bound on the Salesforce build and is expected to
show no meaningful difference** — do not present that as a finding. The difference, if any, lives
in repeated calls.

Scenarios:

| # | Scenario | Why |
|---|---|---|
| a | single create + poll | expected: no meaningful difference |
| b | evidence collection (6 Tooling queries + project parse + digest) | expected: TS ~5× |
| c | 30-call tool sequence (reports, limits, dependency resolution, ancestry) | expected: TS ~10×+ |
| d | workspace digest, 200-file and 5,000-file fixtures | expected: TS decisively |

Method: same `sf-ci` image, same runner class, same Dev Hub. 10 runs each. Report wall clock
p50/p95, CPU seconds, peak RSS, GH-minutes.

**Write the expectations into the results doc before running**, then report actual against
expected. If the numbers contradict the expectation, the numbers win — say so plainly and update
the recommendation in design §14.

**Gate:** `docs/bench/package-create.md` contains a results table, the raw numbers, and a
recommendation. A split outcome (composite for create, TS for the tool layer) is a legitimate
and expected conclusion.

---

## Task 10 — Documentation

- `examples/sf-package-create.yml` — consumer example, `secrets: inherit`, minimal inputs.
- Rows in `README.md` and `CLAUDE.md` action/workflow tables, with least-privilege permissions
  stated (`contents: write` for the tag push — explain why).
- A note in `CLAUDE.md` that two implementations exist and why, linking to the benchmark.

**Gate:** `npm run all` passes; `actionlint` clean.

---

## Definition of done

- [ ] `npm run all` passes; coverage 100%; `dist/` committed and in sync
- [ ] Both implementations produce byte-identical outputs and artifacts for the same input
- [ ] A real package version is created, tagged in git, and the tag body carries the digest
- [ ] A deliberately broken project produces an evidence bundle with a non-empty
      `Package2VersionCreateRequestError` message
- [ ] Preflight refuses to run when Dev Hub headroom is below threshold
- [ ] Rerunning against an existing tag is a no-op, not a failure
- [ ] `docs/bench/package-create.md` published with real numbers
- [ ] `docs/bench/ground-truth.md` records every verified flag and field
- [ ] No existing action modified beyond workspace registration

## Report back

State plainly: what you verified in Task 1 and where this plan was wrong; the benchmark numbers
and whether they matched the stated expectation; anything you could not complete and why.
