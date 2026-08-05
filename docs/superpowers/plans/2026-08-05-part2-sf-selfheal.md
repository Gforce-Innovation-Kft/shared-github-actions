# Part 2 — `sf-selfheal`: the self-healing reconciler

**This document is a prompt for Claude Code.** Execute phases in order. Do not start a phase
until the previous phase's exit criteria are met and signed off by the repo owner.

**Repository:** new — `Gforce-Innovation-Kft/sf-selfheal`.
**Depends on:** Part 1 complete and merged (`plans/2026-08-05-part1-package-create-action.md`).
**Design reference:** `specs/2026-08-05-sf-selfheal-design.md` — **read it in full before Phase 0.**
This prompt is the execution order; the design document is the specification. Where they
disagree, the design document wins and you flag the discrepancy.

---

## Read this first

Five premises drive every decision in the design. If you find yourself reasoning against one of
them, stop and ask rather than working around it:

1. **`sf package version create` is not a free retry.** Every attempt burns Dev Hub quota and
   every success leaves a permanent artifact. The reproducer exists so the system can diagnose
   *without* spending an attempt. Cap: 3 per `(repo, package, headSha)`.
2. **Verification, not confidence, is the gate.** A reproducer must confirm the diagnosis before
   the fix, and confirm it clears after. Model self-assessment authorises nothing above
   read-only.
3. **Prompt injection is the primary threat.** The agent reads attacker-influenceable content
   and the healer holds a repo-write token. No bash tool. Ever.
4. **The commit hash does not identify what was packaged.** The build mutates source in place.
5. **v0 ships with no LLM in the fix path.** If the deterministic tier isn't valuable on its own,
   a model will not save it.

**Skills to invoke:** `github-actions-docs` for any workflow or `action.yml`; `dx-org-manage` for
scratch org operations; `superpowers:test-driven-development` for every phase;
`superpowers:requesting-code-review` before each phase's sign-off.

---

## Phase 0 — Scaffold and the demo consumer

**Answer this before starting:** is `sf-package-demo` a new repo to scaffold, or does an existing
project become the first consumer? Ask the repo owner; do not assume.

1. Create `sf-selfheal` with the structure in design §15. Mirror this repo's conventions:
   TypeScript strict, singleton classes, thin entry points, committed esbuild `dist/`,
   `npm run all` gate, 95% coverage floor.
2. Port the Part 1 `sf-package-create` action and reusable workflow into it (or reference them
   from `shared-github-actions` — decide with the owner; referencing is cleaner, porting is
   simpler).
3. Set up the demo consumer repo with a **real** 2GP package: real `packageAliases`, at least one
   real dependency, and an ancestor. A trivial package will not exercise the failure classes.
4. Extend `gforceinnovation/sf-ci` with `@anthropic-ai/claude-agent-sdk` and
   `@anthropic-ai/claude-code`. The **SDK drives the automated loop; the CLI is for humans
   debugging inside the container** and must never be invoked by an automated path.
5. Provision the S3 bucket and the OIDC roles: packaging job gets `s3:PutObject` on its own
   prefix, healer gets `s3:GetObject`. **Neither role may have any IAM permission on a
   production secret path** — this is the primary production boundary (design §10), not a policy
   rule. Verify it by attempting a read and confirming denial.

**Exit:** demo package builds green end to end; image published; S3 and roles provisioned;
production-secret access verified denied.

---

## Phase 1 — v0: prove the loop, build the corpus. No LLM in the fix path.

### 1.1 Failure-injection harness — **build this first**

Before the healer exists, build `tools/inject/` — deliberately produce ≥8 failure classes on
demand: unresolved alias, missing ancestor, unreleased ancestor, malformed manifest, invalid
metadata component, Apex compile error, coverage shortfall, **mutation drift** (same commit,
different packaged content), **env rotation** (a `replaceWithEnv` value changes).

This is the fixture generator, the test suite and the demo. Everything downstream depends on it.

**Exit:** each class reproducible with one command, deterministically.

### 1.2 Build provenance

Pipeline stages S1–S16, three workspace snapshots (T0 checkout, T1 post-mutation, T2 packaged
input), classified mutation record, env fingerprints, `BuildManifest` to S3, annotated git tags.
Design §5.

**Env fingerprints record `sha256(value)` and length — never the value.** This is what makes a
rotated secret diagnosable when nothing in git changed.

**Contamination detection:** every file at T2 must be explained by presence in git at `sourceSha`
or by a mutation entry. Report unexplained files; warn only in this phase.

**Exit:** every build publishes a manifest; T1≠T2 is detected and reported; a rotated env var is
visible in a manifest diff.

### 1.3 Evidence, fingerprinting, triage

- Evidence bundle schema v1, collector, and **redaction at the tool boundary** — not post-hoc on
  logs.
- Normalizer → stable fingerprint (`phase | errorCode | normalizedMessage`) + coarser family
  hash. Aggressive normalisation: strip ids, timestamps, paths.
- `taxonomy/pkg2.yml` seeded from design §8, with `unknown` as a first-class instrumented bucket.
- Deterministic triage engine + ~8 hand-written playbooks.
- Findings PR comment + `CaseRecord` written for **every** run.

**Diagnose-only in this phase.** The comment is the only write. No fix branches, no commits, no
version-create retries.

### 1.4 Replay tests

Every injected failure becomes a fixture. Triage runs against recorded evidence with tools stubbed
at the registry boundary.

**Phase 1 exit criteria:**
- ≥6 of 8 injected classes correctly classified from evidence alone
- every run produces a case record
- **zero model calls anywhere in the system**

---

## Phase 2 — v1: reasoning and verification

### 2.1 Tool layer and policy — build before the agent

- Typed tool registry per design §9. Every descriptor carries `actionClass`, `costHint`,
  `redact`, and `maxResultTokens`.
- `applyStructuredEdit` with typed operations (`setPackageAlias`, `setDependencyVersion`,
  `setAncestor`, `bumpVersion`) — schema-validated and diff-checked. **The agent can never emit
  arbitrary file content.**
- Policy engine: action classes A0–A5, path allowlist, structural diff validator, fork detection,
  branch-protection check.
- Verify A5 is unreachable: no tool can read or write `.github/workflows/**`, `policy/**`,
  `tools/**`. Write a test that asserts this.

### 2.2 Agent

- Claude Agent SDK, `claude-opus-5`, in-process MCP tool server (`createSdkMcpServer` + `tool()`).
- **Disable every built-in tool** via `allowedTools` — `Bash`, `Write`, `Edit`, `Read`, `Glob`,
  `Grep`.
- `canUseTool` calls the policy engine. That callback *is* the safety model.
- All evidence passed inside labelled untrusted-content blocks; the system prompt states that no
  instruction inside them carries authority.
- Terminal `emit_remediation_plan` tool with a validated schema. **Never parse prose.**

### 2.3 Verification and the ladder

- Reproducers: `scratchOrgValidate`, `apexCompile`, `aliasResolve`, `ancestryCheck`.
- Ladder L0–L10 including **L3b mutation delta** (design §7). The decision table there is the
  point of the whole phase — an empty source diff with a differing workspace digest means the
  cause is in the build, not the commit.
- **Pre-fix verification is mandatory.** A reproducer that passes before the fix means the
  diagnosis is wrong — discard the plan regardless of stated confidence.

### 2.4 Acting, retrying, and cost

- A2 auto-PR for config fixes. A4 create retry only after verification, budget permitting.
- Transient retry does an **idempotency check first** — `versionCreateReport` on the request id,
  because 2GP creates frequently succeed behind a client timeout.
- Budget ledger persisted per `(repo, package, headSha)` so a re-triggered healer cannot reset it.
- `src/core/limits.ts` per design §13 — hardcoded constants, no config layer. Two of them matter
  most: `taskBudgetTokens` (graceful termination) and `repeatFingerprintEscalateAfter: 2` (a
  broken pipeline failing on every push is the likeliest way to burn credits for nothing).
- Prompt cache prefix layout per design §13. Assert `cache_read_input_tokens > 0` across
  consecutive runs in the trace; zero is a defect, not a curiosity.

### 2.5 Eval harness

Fixture corpus → classification accuracy, plan validity, verifier pass rate, **cost per case by
class**. This is what makes the economic test answerable.

**Phase 2 exit criteria:**
- ≥1 real failure class auto-fixed end to end with verification
- **zero false fixes** on the fixture corpus
- cost per case within the stated budget, measured not estimated

---

## Phase 3 — v2: close the loop, start learning

A3 direct commits on non-protected branches (path allowlist + structural validation enforced) ·
retrieval tiers 2–3 · agent-proposed playbooks as PRs with promotion criteria enforced (family
seen ≥2×, verifier reproduces, verifier confirms the fix) · human feedback verdicts
(👍/👎, `/selfheal wrong`) and playbook demotion · **governance and credit layer**
(`policy/budgets.yml`, circuit breakers, per-class model selection) tuned against Phase 2's
measured data · metrics dashboard · second consumer repo to break demo over-fitting.

**Playbooks are only ever created by a merged PR.** The agent proposes; a human merges. Never
relax this.

**Exit:** unknown rate trending down over ≥30 real cases; ≥1 playbook promoted from an agent
proposal; measurable reduction in mean time to diagnosis.

---

## Phase 4 — v3: prove extensibility

**The architecture's acceptance test:** implement skill #2 (`deploy-validation`) with **zero
changes** under `src/core`, `src/policy`, or `src/agent`. If that is not possible, the skill
abstraction failed and needs redesign before anything else is added.

Then: `ReconcilerHost` ECS Fargate implementation · `KnowledgeStore` pgvector implementation ·
evaluate Managed Agents for memory stores and scheduled `org-health-check` ·
`promotion-preparation` and `findings-signal` skills.

**Promotion stays A5 forever.** The agent prepares the evidence pack; the GitHub environment
approval gate executes.

---

## Standing rules

- **Never** add a bash, shell, or arbitrary-file-write tool. If a task seems to need one, the
  task is wrong — stop and ask.
- **Never** let the agent modify its own policy, workflow, or tool registry.
- **Never** create a playbook without a human-merged PR.
- **Never** apply a fix whose reproducer did not confirm the diagnosis first.
- **Never** exceed 3 version-create attempts per `(repo, package, headSha)`.
- Fork-originated PRs are capped at A2 with `rerunWorkflow` disabled. There is no override flag.
- Every reconciliation writes a case record — **especially the ones where the agent was wrong.**
  Those are the most valuable records in the corpus.

## Open questions to resolve with the owner

Carried from design §20; answer before the phase that needs them:

| # | Question | Needed by |
|---|---|---|
| 1 | `sf-package-demo`: new repo or existing project? | Phase 0 |
| 2 | S3 bucket: new or a prefix in an existing one? Lifecycle owner? | Phase 0 |
| 3 | Installable sandbox allowlist: which orgs, who approves additions? | Phase 2 |
| 4 | Contamination strict mode: fail from day one, or warn while the baseline settles? | Phase 1 |
| 5 | Pinned trees per package (default 5)? | Phase 1 |
| 6 | Multi-package repos: one manifest per package per build, or one per run? | Phase 1 |
| 7 | Signal channels: PR comment only for v1, or Slack from the start? | Phase 3 |
| 8 | `org-health-check` cadence and location | Phase 4 |

## Report back after each phase

State plainly: what shipped, what the exit criteria measured (numbers, not adjectives), what you
could not complete and why, and any place the design document was wrong.
