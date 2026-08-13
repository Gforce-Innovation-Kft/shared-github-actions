# The org deployment engine

`reusable-sf-org-deploy.yml` deploys Salesforce metadata from git to a
long-lived org. This page holds the reasoning; the workflow itself stays short
enough to read in one sitting.

## Shape

```
┌─ build ─────────────────────────── environment: <env> ─┐
│  checkout → what changed? → freeze an artifact → upload │
└─────────────────────────────────────────────────────────┘
                        ↓  artifact only
┌─ deploy ────────────────────────── environment: <env> ─┐
│  download → verify checksum → deploy or validate → mark │
└─────────────────────────────────────────────────────────┘
```

The job boundary **is** the artifact boundary.

## Five decisions, and why

### 1. The deploy job has no `actions/checkout`

Not an oversight. Without source it *cannot* rebuild what it deploys, so "build
once, deploy the same artifact" is enforced by the shape of the workflow rather
than by a rule someone has to remember. The only git operation in that job is
the marker move, which uses a bare clone.

### 2. Replacements happen at convert, not deploy

Salesforce string replacement fires when source format is converted to metadata
format. The SFDX docs rule out replacements on `deploy start --metadata-dir`,
and honour them on `convert source` only when
`SF_APPLY_REPLACEMENTS_ON_CONVERT=true`.

So "deploy a stored artifact" and "use replacements" are mutually exclusive
unless the convert is explicit. Doing it in `sf-artifact-build` is what lets an
artifact be frozen *and* carry environment-specific values.

Verified: without the flag the placeholder survives the convert; with it the
replacement applies.

### 3. The delta base is a git tag, moved only on success

`deployed/<env>` marks what that org last received.

- **Failure leaves it alone**, so the next run recomputes an identical delta.
  That is what makes retries idempotent.
- **A validate run never moves it** — nothing was deployed, and moving it would
  make the next delta skip components that never landed.
- **A missing tag falls back to full mode**, which is what a first deployment to
  an empty org needs. It says so loudly, because a silent full deploy is a
  surprise.
- **An org that skipped a release catches up automatically**, because its base
  is its own last deploy rather than the previous release.

### 4. Full manifests come from `packageDirectories`, never from `.`

Scanning the repo root sweeps up anything that merely *looks* like metadata.
In `sf-develop-demo` that was `docs/templates/lwc/component`, a documentation
template. It landed in `package.xml`, `convert --manifest` emitted only package
directories, and the deployment failed with:

> An object 'component' of type LightningComponentBundle was named in
> package.xml, but was not found in zipped directory

`sfdx-project.json` is the authoritative list of what is deployable.

### 5. Secrets never enter the artifact

The artifact is uploaded and retained; anything baked in at convert time is
retained with it. So `config/environments/<env>.json` carries **non-secret**
values only, and real secrets are applied after deployment.

`gitleaks` guards this. It warns when absent from the image, but a **detection
always fails the build**.

## Modes

| `deploy-mode` | Contacts the org | Commits | Moves the marker |
|---|---|---|---|
| `validate` | yes — compiles and runs tests | no | no |
| `deploy` | yes | yes | yes, on success |

`validate` is a real check-only deployment. It is how the pipeline gets proven
end to end without changing an org.

| `mode` | Manifest |
|---|---|
| `delta` | `sfdx-git-delta` from `deployed/<env>` to HEAD |
| `full` | every `packageDirectories` entry |

## Test level

Chosen from the delta rather than fixed:

- `RunSpecifiedTests` when the change selects tests — far cheaper than running
  everything on an org carrying unrelated packages.
- `RunLocalTests` otherwise.
- `test-level` overrides both.

`validate` + `NoTestRun` is rejected: a check-only deployment that runs no tests
validates nothing, and a green gate that checked nothing is worse than no gate.

## What the artifact contains

```
mdapi/                      metadata-format output
  package.xml               what was requested
  destructiveChangesPost.xml  deletions, when the delta has any
deployment.json             the audit record
checksums.txt               sha256 per file
```

`destructiveChangesPost.xml` matters more than it looks: `convert source` emits
only the additive manifest, so without it a component deleted in git simply
stops being mentioned and **orphans in the org forever while the run reports
success**. Post rather than Pre, so deletions apply after additions — a
component being replaced must still exist while its replacement deploys.

`deployment.json` records the commit, the base, the toolchain versions, both
checksums and the Salesforce deploy id. `manifestSha256` covers `package.xml`
alone, so it is independent of environment-specific replacements and answers
"did these two orgs get the same component set?".

## Failure decoder

| Symptom | Cause |
|---|---|
| `named in package.xml, but was not found in zipped directory` | Manifest generated from `.` instead of `packageDirectories` |
| `Artifact checksum mismatch` | Something modified the artifact after it was frozen |
| Build fails on convert with an unset variable | A key is missing from `config/environments/<env>.json` — deliberate; a placeholder must never reach an org |
| Deploy runs, marker did not move | A `validate` run. Expected |
| First run deploys everything | No `deployed/<env>` tag yet |
