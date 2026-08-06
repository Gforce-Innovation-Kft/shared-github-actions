# 0002 — Naming convention and repository structure

- **Status:** accepted
- **Date:** 2026-08-06
- **Affects:** every directory under `.github/actions/`, every file under `.github/workflows/`,
  `gforce-gha-src/actions/`, `docs/`, and — by relocation — `sf-docker-images`.

## Context

The repository grew one action at a time and accumulated three naming conventions at once:

| Style | Examples |
|---|---|
| verb-first, no domain | `get-aws-secret`, `create-release-pr`, `sync-branches` |
| domain-first, inconsistent word order | `sf-delta-package`, `sf-find-tests`, `sf-scratch-org` |
| domain-first, object-then-verb | `sf-org-login`, `sf-package-create`, `sf-package-install`, `sf-package-promote` |

Workflows had the same problem in a different shape: `.github/workflows/` mixes workflows that
are the repository's own CI (`ci.yml`, `release.yml`, `sf-ops-dispatch-smoke.yml`) with
workflows that exist to be called from other repositories (`sf-release.yml`,
`sf-pr-validate.yml`, …). GitHub forbids subdirectories under `.github/workflows/`, so the two
kinds cannot be separated structurally — only by name. Nothing in the filename distinguished
them, and `sf-ops-dispatch-smoke.yml` in particular read like a reusable workflow while being
an internal test.

Separately, `docker-build-test-push.yml` lived here despite `sf-docker-images` being its only
consumer, and `docs/` had grown to 350 KB of which roughly 250 KB was one-off process residue
from AI-assisted sessions.

## Decision 1 — `<domain>-<object>-<verb>` for actions

**Decision.** Every action directory is named `<domain>-<object>-<verb>`, where `<domain>` is
the system the action talks to: `sf`, `aws`, `github`, `git`, `docker`.

| Before | After |
|---|---|
| `get-aws-secret` | `aws-secret-get` |
| `create-release-pr` | `github-release-pr-create` |
| `sync-branches` | `github-branch-sync` |
| `sf-delta-package` | `sf-source-delta` |
| `sf-find-tests` | `sf-apex-test-select` |
| `sf-scratch-org` | `sf-org-scratch-create` |
| `sf-org-login` | unchanged |
| `sf-package-create` · `sf-package-install` · `sf-package-promote` | unchanged |
| `sf-ops-callback` | unchanged |

**Why the domain goes first.** A flat `.github/actions/` listing sorts by domain, so every
Salesforce action is one contiguous block and the AWS and GitHub actions cannot be mistaken for
Salesforce ones. Verb-last means related actions on the same object sort adjacently
(`sf-package-create`, `-install`, `-promote`).

**Why `github-` and not `git-` for `github-branch-sync`.** It fast-forwards or merges via the
GitHub REST API and opens a pull request on conflict. It never shells out to `git`. The `git-`
prefix stays reserved for actions that drive the plumbing directly; after decision 4 there are
none, and that is the correct outcome.

**Why `sf-source-delta` and not `sf-package-delta`.** It produces a `package.xml` *manifest*
from a git diff, which has nothing to do with a 2GP package. Keeping `package` in the name put
it in the middle of the `sf-package-*` family it has no relationship to. The new name matches
the CLI command it wraps, `sf sgd source delta`.

**Rejected — nesting actions as `.github/actions/sf/package-create/`.** GitHub resolves actions
at any repository path, so this works. But it buys nothing a name prefix does not already give,
and it lengthens every consumer's `uses:` line.

## Decision 2 — `reusable-` marks a `workflow_call` workflow

**Decision.** A workflow whose trigger is `workflow_call` is named `reusable-<domain>-<name>.yml`.
Everything else is the repository's own CI and takes no prefix.

| Before | After | Kind |
|---|---|---|
| `ci.yml` | unchanged | internal |
| `release.yml` | unchanged | internal |
| `sf-ops-dispatch-smoke.yml` | `ci-sf-ops-dispatch-smoke.yml` | internal |
| `salesforce-code-analyzer.yml` | `reusable-sf-code-analyze.yml` | reusable |
| `sf-pr-validate.yml` | `reusable-sf-pr-validate.yml` | reusable |
| `sf-release.yml` | `reusable-sf-release.yml` | reusable |
| `sf-package-release.yml` | `reusable-sf-package-release.yml` | reusable |
| `sf-ops-dispatch.yml` | `reusable-sf-ops-dispatch.yml` | reusable |
| `test-simple.yml` | deleted | — |
| `docker-build-test-push.yml` | moved out — see decision 3 | — |

**Why mark the reusable ones rather than the internal ones.** The prefix answers the question a
reader of another repository actually asks — *may I `uses:` this?* — at the point they read the
name. Marking internal workflows instead (`_ci.yml`) answers a question nobody outside the repo
has.

**Why `ci-sf-ops-dispatch-smoke.yml`.** Under this rule an unprefixed name means internal, but
`sf-ops-dispatch-smoke.yml` still reads as a Salesforce reusable workflow at a glance. The `ci-`
prefix groups it with `ci.yml` and removes the ambiguity.

**`test-simple.yml` is deleted.** It echoed a string to prove cross-repo `workflow_call`
resolution worked. That has been proven by five real reusable workflows in production use.

## Decision 3 — `docker-build-test-push.yml` moves to `sf-docker-images`

**Decision.** The workflow leaves this repository and becomes
`sf-docker-images/.github/workflows/reusable-docker-image-build.yml`. Its caller,
`sf-docker-images/.github/workflows/build-and-push.yml`, changes from a cross-repository `@v1`
reference to a local `./.github/workflows/…` one.

**Why.** It had exactly one consumer, in one repository, and no plausible second one — the
pytest-testinfra contract it requires (`tests/test_<image_name>.py`) is specific to that repo's
layout. A reusable workflow with a single caller in another repository is a cross-repo coupling
that buys nothing: every change needs two PRs and a tag move to take effect.

**Consequence — cosign identity changes.** The workflow's path is the certificate identity
(`job_workflow_ref`) for keyless signing. Moving it changes that identity from
`…/shared-github-actions/.github/workflows/docker-build-test-push.yml@…` to
`…/sf-docker-images/.github/workflows/reusable-docker-image-build.yml@…`. Images signed before
the move remain verifiable only with the old identity regex. The `cosign verify` command
documented in `sf-docker-images/README.md` is updated to the new identity and applies to images
published from the move onward. This cost is accepted because it is paid once, whereas the
cross-repo coupling was paid on every change.

## Decision 4 — the git tag push leaves `sf-package-create`

**Decision.** `sf-package-create` drops its `push-tag` input, its tag-creation step and its
`git-tag` output. Its required caller permission falls from `contents: write` to
`contents: read`. `reusable-sf-package-release.yml` pushes the annotated
`pkg/<package>/<versionNumber>` tag itself, after the create step succeeds.

**Why.** L1's contract is one operation against one system. Creating a package version is a
Salesforce operation; tagging the commit that produced it is a git operation. Bundling them made
an action that needs write access to the repository in order to do a thing that has nothing to do
with the repository, and made `contents: write` mandatory for callers that only wanted a package
version.

**Rejected — a `git-tag-push` L1 action.** It would give the `git-` prefix a home, but its only
caller would be one workflow, and a `git tag -a && git push` is two lines. That is the pass-
through layer this restructure exists to remove.

## Decision 5 — delete process residue from `docs/`

**Decision.** Delete `docs/claude-ai-assisted-shared-actions-prompt.md`,
`docs/claude-implementation-review-feedback.md`, `docs/claude-second-pass-review-prompt.md`,
`docs/claude-sf-dispatch-layer-prompt.md`, `docs/bench/`, and `docs/superpowers/`.

Retained: `docs/adr/`, `docs/architecture.md`, `docs/pipeline-map.md`,
`docs/sf-cicd-pipeline-map.xlsx`, `docs/consuming-sf-cicd.md`, `docs/consuming-sf-dispatch.md`,
`docs/typescript-action-authoring.md`.

**Why.** The deleted files are inputs to and transcripts of past authoring sessions — prompts,
review feedback, and superseded plans. They describe how the code came to exist, which git
history already records, rather than how it works or how to use it. `docs/bench/ground-truth.md`
in particular benchmarks a `sf-package-create-node` twin that was never built.

The retained set answers the three questions a reader has: what the system is
(`architecture.md`, `pipeline-map.md`), how to call it (`consuming-*.md`), and why it is shaped
this way (`adr/`).

## Decision 6 — self-references point at `@develop` until a release is cut

**Decision.** The fifteen absolute references from reusable workflows to this repository's own
actions (for example `sf-release.yml` → `.../sf-delta-package@v1`) are rewritten to the new
action names at `@develop`.

**Why absolute and not `./`.** A `./` reference inside a `workflow_call` workflow resolves
against the *caller's* repository, not this one, so it would break for every external consumer.
Absolute self-references are required.

**Why `@develop` rather than `@v1` or `@v2`.** The refs must name the new directories, which do
not exist at `v1`. `v1` stays frozen where it is, so existing consumers are unaffected and keep
working against the old names. Pointing at `@develop` also fixes a real defect:
`ci-sf-ops-dispatch-smoke.yml` currently exercises current dispatcher code against frozen `@v1`
actions, so a change to an action is never smoke-tested before release.

**Consequence.** Cutting a release becomes a two-step operation: rewrite the self-references from
`@develop` to `@vX`, then tag. This is deliberate — it is the point at which the action set is
declared stable — but it is a manual step that must be written into the release procedure in
`CONTRIBUTING.md`.

## Consequences

- Consumers pinned to `@v1` (`sf-develop-demo`, `sf-docker-images`) are unaffected until `v1`
  moves. Re-pointing them is a follow-up, not part of this change.
- `docs/consuming-sf-cicd.md`, `docs/consuming-sf-dispatch.md`, `docs/pipeline-map.md`,
  `docs/architecture.md`, `README.md`, `CLAUDE.md` and `examples/` all name actions and
  workflows, and are rewritten with them.
- `gforce-gha-src/actions/<name>` and `gforce-gha-src/__tests__/actions/<name>` mirror the action
  directory names and are renamed in lockstep.
- `gforce-gha-src/` keeps its name. It is verbose, but renaming it touches eight config files
  and no consumer ever sees it.
- With the Docker workflow gone, this repository covers exactly three domains: Salesforce,
  GitHub, and AWS.
