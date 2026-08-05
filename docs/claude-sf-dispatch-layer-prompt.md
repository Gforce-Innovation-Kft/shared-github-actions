# Prompt — 4-layer Salesforce CI/CD orchestration architecture

> Paste into Claude Code from the repo root (`~/gforce/shared-github-actions`), plan mode on.

---

# Task: design and build the 4-layer Salesforce CI/CD orchestration architecture

You are working in `Gforce-Innovation-Kft/shared-github-actions`. Read `CLAUDE.md`,
`docs/architecture.md`, `docs/typescript-action-authoring.md`, and
`docs/consuming-sf-cicd.md` before proposing anything.

## Current state (verify, don't assume)

- **Actions** (`.github/actions/`): `get-aws-secret`, `sf-jwt-login`, `sf-org-login`,
  `sf-delta-package`, `sf-find-tests`, `sf-package-create`, `sf-scratch-org`,
  `sync-branches`, `create-release-pr`
- **Reusable workflows** (`.github/workflows/`): `sf-pr-validate.yml`, `sf-release.yml`,
  `sf-package-release.yml`, `salesforce-code-analyzer.yml`, `docker-build-test-push.yml`,
  `test-simple.yml`

## Target architecture — four layers, strict separation

| Layer | Name | Contract |
|---|---|---|
| L1 | **Capability actions** | One Salesforce/CLI operation each. No branching between operations, no `gh` calls, no knowledge of why they were invoked. Idempotent where the underlying `sf` command allows it. |
| L2 | **Reusable workflows** (`workflow_call`) | Compose L1 into a *pipeline* with a business meaning (PR validation, 2GP release). Typed inputs/outputs, `secrets:` declared explicitly. Never triggered directly by a human or by Salesforce. |
| L3 | **Dispatch layer** (NEW) | The single external entry point. Receives a request from **Salesforce LWC → Apex → GitHub App JWT → dispatch API**, validates it, routes it to the correct L2 workflow or L1 action, and reports the result back so the LWC can render status. |
| L4 | **Consumer workflows** | Live in the app repo (`sf-develop-demo`). Thin `uses:` callers on push/PR/tag. Out of scope here except for the contract they must honour. |

## L1 gap analysis — required deliverables

Existing L1 covers login, scratch org, delta package, test selection, package create.
The dispatch layer needs these operations, so audit what is missing and build it:

- `sf-package-promote` — promote a `04t` version to released, with a guard that refuses
  a version that has not passed validation
- `sf-package-install` — install a `04t` into a target org (installation key, wait,
  security type, upgrade type), poll to a terminal state, surface the install errors
- `sf-run-tests` — run Apex tests against an authenticated org (`RunLocalTests` /
  `RunSpecifiedTests`), emit JUnit + coverage as artifacts and as step-summary
- `sf-package-list` / version resolution — resolve "latest released version of package X"
  so the dispatcher can accept a package *name* instead of a raw `04t`

For each: does it belong as a new action, or as an input to an existing one? Justify.
Do not create an action whose only job is to `if:` between two other actions.

## Implementation tier — pick the cheapest thing that holds

Every L1 action must declare which of these three tiers it lives in, and why. Escalate a
tier only when the one below it starts producing unreadable YAML — and **downgrade** an
existing action if the reverse turns out to be true.

**Tier 1 — composite action (`using: "composite"`), the default.**
Fits when the action is: invoke `sf`, parse a JSON result with `node -e` or `jq`, set a
couple of outputs, write a step summary. Straight-line shell, no retry loop, no polling,
no data model. `sf-org-login`, `sf-jwt-login`, `sf-delta-package` are correctly Tier 1.

**Tier 2 — `actions/github-script` (https://github.com/actions/github-script).**
Reach for this when the logic is *GitHub API glue* rather than Salesforce work: listing
workflow runs, resolving a run by correlation id, posting a check/comment, dispatching a
downstream workflow, reading artifacts. `github-script` hands you a pre-authenticated
`github` (Octokit REST + GraphQL + paginate), `context`, `core`, and `io` with **no bundle
to build and no `dist/` to keep in sync** — which is exactly the property that makes it
right for the L3 dispatch layer's plumbing. Rules if you use it:

- Pin it (`actions/github-script@v7`), pass the token explicitly via `github-token:`.
- Keep the inline `script:` short. If it grows past roughly 40 lines, or needs its own
  helpers, or needs a unit test — that is the signal to go to Tier 3, not to keep typing.
- Never interpolate `${{ }}` into the script body (script injection). Pass values through
  `env:` and read `process.env.X`.
- Use `core.setOutput` / `core.setFailed`, not `console.log` markers.
- No Salesforce CLI orchestration inside `github-script` — it is for the GitHub side.

**Tier 3 — TypeScript action backed by `gforce-gha-src/`.**
The moment an action carries real logic — polling a Salesforce request to a terminal state,
retry/backoff, parsing `sfdx-project.json` or `package.xml`, quota preflight arithmetic,
routing decisions with more than two branches, anything worth a unit test — it becomes a
TypeScript action. It then **must** follow the existing architecture rather than inventing
a new one:

- Implementation lives in `gforce-gha-src/`; the only `.ts` outside it is the action's
  `index.ts` entry point (getInput → `Orchestrator.execute` → setOutput/setFailed, zero logic).
- Per-action `Orchestrator` singleton (`execute()` = numbered delegated steps) + `Validator`
  singleton (`inputValidation()`), per `docs/typescript-action-authoring.md`.
- Salesforce logic belongs under `gforce-gha-src/libraries/salesforce`; GitHub API calls go
  through the `GitHubClient` facade only; runner APIs only via the sanctioned
  `LoggerService` / `FileSystemService` / `GithubContextService` wrappers.
- Throw-based errors (`ValidationError`, `GitHubApiError`) caught in the entry point;
  expected outcomes stay typed values, not exceptions.
- Tests in `gforce-gha-src/__tests__` mirroring source, `method_scenario_expectedResult`
  naming, Given/When/Then, mocked at the singleton boundary, 95% coverage gate.
- Committed esbuild `dist/index.js`; `npm run all` must pass before any PR.

**Expected split for this work:** the new Salesforce capability actions with polling
(`sf-package-install`, `sf-package-promote`'s validation guard, version resolution) are
Tier 3 candidates — say so explicitly if you disagree. The L3 dispatcher's correlation-id
lookup and callback plumbing is the strongest Tier 2 `github-script` candidate. Do not
write a Tier 3 action for something a six-line composite already does correctly.

## L3 — the part that needs the most design thought

Answer these **before writing YAML**, and record the answers as an ADR in `docs/`:

1. **`workflow_dispatch` vs `repository_dispatch`.** Salesforce is calling the GitHub REST
   API with a GitHub App installation token. `workflow_dispatch` gives you typed inputs,
   a UI, and per-ref targeting — but caps at **10 inputs** and needs the workflow file to
   exist on the target ref. `repository_dispatch` gives you an arbitrary `client_payload`
   JSON — but **only ever runs on the default branch** and has no UI. Which one, and why?
   Can both entry points feed one shared implementation?

2. **Routing without dynamic `uses:`.** GitHub does **not** allow expressions in a `uses:`
   value — you cannot compute which reusable workflow to call. So routing must be static
   jobs guarded by `if: inputs.operation == '…'`. Design this so adding an operation is a
   local change, and so the skipped jobs do not make the run look green when the requested
   operation was invalid. An `operation` value that matches no job **must fail the run**.

3. **Round trip back to Salesforce.** The LWC needs to know what happened. Compare:
   (a) LWC polls `GET /actions/runs/{id}` using the run id returned by the dispatch call —
   except `workflow_dispatch` returns **204 with no body**, so how is the run id recovered?
   (b) the workflow calls back into Salesforce at the end (REST/Platform Event) with a
   `correlation-id` the caller supplied. Pick one, state the failure modes of the other.

4. **Correlation and idempotency.** Every dispatched request carries a `correlation-id`.
   It must appear in the run name (`run-name:`) so a run is findable, and in the callback.
   A retried dispatch with the same correlation id must not create a second package version.

5. **Authorization.** The Apex layer decides *who* may promote or install. The dispatcher
   must still defend itself: validate every input, reject unknown operations, use
   `environment:` gates for destructive operations (promote is irreversible; install into
   production is not a dev action), and keep `permissions:` least-privilege per job.

## Hard constraints

- Composite actions have **no `secrets` context** — secrets must be passed as inputs.
- Reusable workflows nest at most 4 levels; L3 → L2 → (action) already spends two.
- All composite shell steps: `shell: bash`. Credentials cleaned in `if: always()` steps.
- `uses:` refs use org `Gforce-Innovation-Kft` — the old `gforceinnovation` login is dead.
- Salesforce API version 65.0.
- Commit prefixes: `Add:` / `Fix:` / `Update:` / `Docs:` / `Test:` / `Refactor:`.

## Process

1. Use the `superpowers:brainstorming` skill to pin down the L3 design with me — do not
   skip to a plan. Bring the five questions above as the agenda, plus the Tier 1/2/3 call
   for each new action.
2. Then `superpowers:writing-plans` → a plan file under `docs/superpowers/plans/`,
   phased so each phase is independently mergeable and testable.
3. Only then implement, phase by phase, pausing for review between phases.

## Deliverables

- ADR: `docs/adr/NNNN-salesforce-dispatch-layer.md` — decisions 1–5 with rejected options,
  plus the implementation-tier table (action → Tier 1/2/3 → justification).
- L1 gap actions with `action.yml` inputs/outputs documented in `CLAUDE.md`.
- `.github/workflows/sf-ops-dispatch.yml` — the L3 entry point.
- `docs/consuming-sf-dispatch.md` — the Apex/LWC side of the contract: exact request shape,
  operation catalogue, response/callback shape, error taxonomy, required App permissions.
- A `test-simple.yml`-style smoke path so the dispatch contract can be verified without
  burning a `Package2VersionCreates` quota slot (6/day).

## Definition of done

An LWC in `sf-develop-demo` can request "create package version", "promote version",
"install version into org X" — each request lands on exactly one L2/L1 path, is traceable
by correlation id, cannot silently no-op, and reports terminal status back to Salesforce.
`npm run all` passes.

## Do not

- Do not build the LWC or Apex side in this repo.
- Do not add a layer that only forwards inputs unchanged.
- Do not let the dispatcher inline Salesforce logic that belongs in an L1 action.
- Do not write a second TypeScript architecture alongside `gforce-gha-src/`.
- Do not inline `${{ }}` expressions into a `github-script` `script:` body.
- Do not touch `docker-build-test-push.yml`'s path — it is a cosign certificate identity.
