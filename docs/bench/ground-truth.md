# Ground truth — `sf-package-create`

Every external API surface Part 1 depends on, verified against the installed toolchain rather
than recalled. Task 1 of
[plans/2026-08-05-part1-package-create-action.md](../superpowers/plans/2026-08-05-part1-package-create-action.md).

**Verified:** 2026-08-05
**Toolchain:** `@salesforce/cli/2.145.6` · `darwin-arm64` · `node-v22.23.1` · packaging plugin `2.30.4`
**Dev Hub:** `gabor_dev` (`00DgL00000ULZkfUAH`) — 2GP packaging enabled during this task
**Libraries probed:** `@salesforce/packaging@5.0.5`, `@salesforce/core@9.1.0`

Legend: **confirmed** = matches the plan · **corrected** = plan was wrong · **new** = plan
omitted it and it matters.

---

## 1. `sf package version create`

Source: `sf package version create --help`

| Flag | Short | Status | Notes |
|---|---|---|---|
| `--tag` | `-t` | confirmed | "Package version's tag." Carries the commit SHA (design §4). |
| `--branch` | `-b` | confirmed | |
| `--version-description` | `-e` | confirmed | Lands in `Package2Version.Description`. |
| `--code-coverage` | `-c` | confirmed | |
| `--skip-validation` | — | confirmed | No short flag. |
| `--wait` | `-w` | confirmed | Minutes. |
| `--json` | — | confirmed | Global flag. |
| `--installation-key-bypass` | `-x` | confirmed | |
| `--package` | `-p` | confirmed | `0Ho` id or alias. |
| `--target-dev-hub` | `-v` | **new** | **Required** (or the `target-dev-hub` config var). The plan's `dev-hub-alias` input maps here. |
| `--installation-key` | `-k` | **new** | See the mutual-requirement below. |
| `--path` | `-d` | new | Alternative to `--package`. |
| `--async-validation` | — | new | Returns before validations finish. Not used in Part 1. |
| `--skip-ancestor-check` | — | new | Not used in Part 1. |

### Two constraints the CLI enforces that the plan did not capture

**a. `--installation-key` and `--installation-key-bypass` are mutually *required*.** The usage
string is `[-k <value>] [-x]` and the flag help says *"(either --installation-key or
--installation-key-bypass is required)"*. The plan defines only `installation-key-bypass`
(default `true`). Setting it to `false` therefore produces a hard CLI error with no way to
supply a key.

> **Correction applied:** the action takes an additional optional `installation-key` input.
> Validation: exactly one of `installation-key-bypass: true` or a non-empty `installation-key`.

**b. `--code-coverage` and `--skip-validation` are mutually exclusive *in the CLI itself*** —
the usage string is `[-c | --skip-validation]`, and the flag description states *"You can specify
skip validation or code coverage, but not both. Code coverage is calculated during validation."*

The plan's Validator rule is correct; it is belt-and-braces over a constraint the CLI already
enforces. Keep it — it produces a better message and it is the only enforcement the TypeScript
implementation gets.

---

## 2. `sf package version create report`

Source: `sf package version create report --help`

| Flag | Short | Status | Notes |
|---|---|---|---|
| `--package-create-request-id` | `-i` | confirmed | **Required.** Id starts with `08c`. |
| `--target-dev-hub` | `-v` | new | **Required** (or config var). |

---

## 3. `sf org list limits` and the packaging limits

Source: `sf org list limits --help` and a live run against `gabor_dev`.

| Flag | Short | Status | Notes |
|---|---|---|---|
| `--target-org` | `-o` | **corrected** | It is `-o/--target-org`, **not** `-v/--target-dev-hub`. Pass the Dev Hub alias here. |

Live output:

```
Name                                     Remaining  Max
Package2VersionCreates                   6          6
Package2VersionCreatesWithoutValidation  500        500
```

Also confirmed via the REST `/limits` resource (see §6): `Package2VersionCreates` is an object
`{ "Max": 6, "Remaining": 6 }`.

### Correction: preflight must check the limit the run will actually consume

**There are two limits, and `--skip-validation` draws on the other one.** A validated create
consumes `Package2VersionCreates` (6/day). A `--skip-validation` create consumes
`Package2VersionCreatesWithoutValidation` (500/day).

The plan's preflight checks `Package2VersionCreates` unconditionally. That blocks a
`skip-validation: true` build against a quota it is not spending, on an org with 500 slots free.

> **Correction applied:** preflight resolves the limit name from the validated inputs —
> `skip-validation: true` → `Package2VersionCreatesWithoutValidation`, otherwise
> `Package2VersionCreates` — and names the limit it checked in both the log line and the
> failure message.

---

## 4. Tooling API objects

Source: `sf sobject describe -s <name> -t -o gabor_dev` against the live Dev Hub.
Cross-checked against `@salesforce/packaging@5.0.5`
`lib/interfaces/packagingSObjects.d.ts`.

### `Package2VersionCreateRequest`

```
Id, IsDeleted, CreatedDate, CreatedById, LastModifiedDate, LastModifiedById, SystemModstamp,
Package2Id → Package2 (required),
Package2VersionId → Package2Version (nillable),
Tag, Branch, Status (picklist), IsPasswordProtected, InstallKey (encryptedstring),
CalculateCodeCoverage, SkipValidation, IsConversionRequest, Language,
VersionInfo (base64), AsyncValidation, IsDevUsePkgZipRequested,
CalcTransitiveDependencies, DependencyGraphJson (textarea)
```

- `Package2VersionId` is the `05i` and is **null until the request succeeds** — evidence
  collection must tolerate that.
- **`Instance` does not exist on the org.** `packagingSObjects.d.ts` declares
  `Instance: string`, but the live describe has no such field. `SELECT Instance` fails.
  **Trust the describe over the library type.**
- The live object has four fields the library type omits: `AsyncValidation`,
  `IsDevUsePkgZipRequested`, `CalcTransitiveDependencies`, `DependencyGraphJson`.
- Do not `SELECT VersionInfo` in evidence collection — it is the base64 package zip.

**`Status` picklist (live, authoritative):**

```
Queued · Initializing · VerifyingFeaturesAndSettings · VerifyingDependencies ·
VerifyingMetadata · FinalizingPackageVersion · PerformingValidations · Success · Error
```

Terminal states are **`Success`** and **`Error`**; everything else is in progress.

> **Corrected:** the library's `Package2VersionStatus` enum and its exported
> `PackageVersionCreateRequestResultInProgressStatuses` both include **`InProgress`**, which is
> **not in the live picklist**. Poll on "not in {Success, Error}" rather than on a positive list
> of in-progress values — the positive list is wrong in one direction and will drift.

### `Package2VersionCreateRequestError`

```
Id, IsDeleted, CreatedDate, CreatedById, LastModifiedDate, LastModifiedById, SystemModstamp,
ParentRequestId → Package2VersionCreateRequest,
Message (textarea)
```

> **The foreign key the plan asked about is `ParentRequestId`.** Evidence query:
>
> ```sql
> SELECT Id, Message, CreatedDate
> FROM Package2VersionCreateRequestError
> WHERE ParentRequestId = '08c...'
> ```

### `Package2Version` (fields Part 1 reads)

```
Id (05i), Package2Id, SubscriberPackageVersionId → SubscriberPackageVersion (04t, required),
Tag, Branch, AncestorId, ValidationSkipped, ValidatedAsync, Name, Description,
MajorVersion, MinorVersion, PatchVersion, BuildNumber,
CodeCoverage (complexvalue), CodeCoveragePercentages (complexvalue),
HasPassedCodeCoverageCheck, IsReleased, IsDeprecated, HasMetadataRemoved,
BuildDurationInSeconds, EndToEndBuildDurationInSeconds,
TotalNumberOfMetadataFiles, TotalSizeOfMetadataFiles, SnapshotName, ContainsPsld, HasVpi
```

- **There is no single version-number field.** `versionNumber` is composed from
  `MajorVersion.MinorVersion.PatchVersion.BuildNumber`. The git tag
  `pkg/<package>/<versionNumber>` must be assembled from those four.
- `SubscriberPackageVersionId` is the `04t` — the plan's `version-id` output.
- `Id` is the `05i` — the plan's `package-version-id` output.

### Mapping to the action's declared outputs

| Output | Source |
|---|---|
| `request-id` | `Package2VersionCreateRequest.Id` (`08c`) |
| `status` | `Package2VersionCreateRequest.Status` |
| `package-version-id` (`05i`) | `Package2VersionCreateRequest.Package2VersionId` |
| `version-id` (`04t`) | `Package2Version.SubscriberPackageVersionId` |
| `version-number` | `Major.Minor.Patch.Build` from `Package2Version` |

The CLI's `--json` result (`PackageVersionCreateRequestResult`, §5) carries
`SubscriberPackageVersionId` and `VersionNumber` directly, so the **composite** implementation
needs no follow-up `Package2Version` query on the success path.

---

## 5. `@salesforce/packaging@5.0.5` API surface

Read from the shipped `.d.ts`, not from memory.

`PackageVersion` (`lib/package/packageVersion.d.ts`):

| Member | Signature |
|---|---|
| `PackageVersion.create` | `(options: PackageVersionCreateOptions, polling?: { frequency: Duration; timeout: Duration }) => Promise<PackageVersionCreateRequestResult>` |
| `PackageVersion.getCreateStatus` | `(createPackageRequestId: string, connection: Connection) => Promise<PackageVersionCreateRequestResult>` |
| `PackageVersion.getCreateVersionReport` | `(createPackageRequestId: string, connection: Connection) => Promise<PackageVersionCreateRequestResult>` |
| `PackageVersion.pollCreateStatus` | `(requestId, connection, project, polling)` |
| `PackageVersion.waitForCreateVersion` | `(requestId, project, connection, polling)` — **note the swapped 2nd/3rd arguments** vs `pollCreateStatus` |
| `PackageVersion.queryPackage2Version` | `(connection, options?: Package2VersionQueryOptions) => Promise<Partial<Package2Version[]>>` |
| `packageVersionCreateRequest.byId` | `(requestId, connection) => Promise<PackageVersionCreateRequestResult[]>` |

`PackageVersionCreateOptions` keys are **all-lowercase, unseparated** — not camelCase, with
`packageId` the sole exception:

```
connection, project (both required), then partial:
branch · buildinstance · codecoverage · definitionfile · installationkey ·
installationkeybypass · language · packageId · path · postinstallscript · postinstallurl ·
preserve · releasenotesurl · skipancestorcheck · skipvalidation · asyncvalidation ·
generatepkgzip · sourceorg · tag · uninstallscript · validateschema · versiondescription ·
versionname · versionnumber · profileApi
```

`PackageVersionCreateRequestResult`:

```
Id · Status · Package2Id · Package2Name · Package2VersionId · SubscriberPackageVersionId ·
Tag · Branch · Error: any[] · CreatedDate · HasMetadataRemoved · HasPassedCodeCoverageCheck ·
CodeCoverage · VersionNumber · CreatedBy · ConvertedFromVersionId ·
TotalNumberOfMetadataFiles · TotalSizeOfMetadataFiles
```

> **`Error` is typed `any[]` by the library.** The repo bans `any`. Our DTO narrows it at the
> client boundary to `readonly string[]` rather than propagating the library's type inward.

`@salesforce/core@9.1.0` exports used: `AuthInfo`, `Connection`, `SfProject`, `SfProjectJson`,
`NamedPackageDir`, `Messages`. `Connection.create({ authInfo })` after
`AuthInfo.create({ username })`; `SfProject.resolve(path)` then `getPackageDirectories()`.

**Both libraries declare `"engines": { "node": ">=22.0.0" }`** — the plan's `using: node20`
runtime is below their stated floor. GitHub Actions supports `node24`.

---

## 6. Bundling — the finding that changes Part 1

The repo builds every TypeScript action into one committed `dist/index.js` with
`esbuild --bundle --platform=node --target=node20`. **Neither Salesforce library survives that.**

Probe: `scratchpad/sfprobe`, esbuild `0.23.1` (the repo's version), same flags.

| Library | Bundles? | Runs bundled? | Failure |
|---|---|---|---|
| `@salesforce/packaging` (+ core) | yes — **9.3 MB** | **no** | `ENOENT … scandir '<bundle-parent>/messages'` |
| `@salesforce/core` alone | yes — **5.5 MB** | **no**, by default | `unable to determine transport target for "../../lib/logger/transformStream"` |
| `@salesforce/core` alone + `SF_DISABLE_LOG_FILE=true` | yes — 5.5 MB | **yes** | — |

### Why `@salesforce/packaging` cannot be bundled

`lib/utils/packageUtils.js` calls `Messages.importMessagesDirectory(__dirname)` **at module
scope**, so the failure happens on `require`, before any of our code runs. The loader
`readdirSync`s a `messages` directory resolved relative to the bundle's own location.

Copying `messages/*.md` next to the bundle clears the `ENOENT` and then fails differently:

```
_SfError [MissingBundleError]: Missing bundle @salesforce/packaging:pkg_utils for locale en_US.
```

The loader keys each bundle by the package name it finds by walking up to the nearest
`package.json`. Flattened, every message file registers under the *action's* package name, while
the library asks for `@salesforce/packaging:…` and core asks for `@salesforce/core:…`. **One
bundle cannot register under two package names**, so there is no co-location fix. This is
structural, not a configuration miss.

### Why `@salesforce/core` alone *is* viable

Its only bundling defect is the pino file-logger transport, which needs a real path on disk for
a worker thread. Setting `SF_DISABLE_LOG_FILE=true` (the supported env var —
`SFDX_DISABLE_LOG_FILE` still works but warns as deprecated) skips that transport entirely.
Verified working from a 5.5 MB single-file bundle against the live Dev Hub:

```
LOADED AuthInfo: function
CONNECTION OK: tooling query returned 0 records
LIMITS OK: Package2VersionCreates = {"Max":6,"Remaining":6}
PROJECT OK: force-app
```

`connection.tooling.query(...)`, `connection.request('<baseUrl>/limits')` and
`SfProject.resolve(...).getPackageDirectories()` all work bundled. That covers preflight,
polling, evidence collection and package-directory resolution — every Salesforce call Part 1
makes **except the create itself**.

For scale: existing committed bundles are 828 KB – 1.3 MB. A core-only action bundle is 5.5 MB.

---

## 7. Where this leaves the plan

| Plan statement | Reality |
|---|---|
| TS action uses `@salesforce/core` **+ `@salesforce/packaging`** | `@salesforce/packaging` is unbundlable. Core-only is the viable path. |
| `using: node20` | Both libraries declare `engines: node >=22`. |
| Preflight checks `Package2VersionCreates` | Must select the limit by `skip-validation`. |
| `installation-key-bypass` is the only key input | CLI requires one of key/bypass; an `installation-key` input is needed. |
| Poll on the library's in-progress status list | That list contains `InProgress`, absent from the live picklist. Poll on `Status ∉ {Success, Error}`. |
| `Package2VersionCreateRequest.Instance` (library type) | Not on the org. Do not select it. |

### Resolution — decided 2026-08-05

Part 1 asks for two **behaviourally identical** implementations so they can be benchmarked. The
TypeScript one cannot call `PackageVersion.create` from a committed bundle, and reimplementing
package-zip construction on raw `@salesforce/core` is a large, duplicative piece of work.

**Decision: the TypeScript action is `@salesforce/core`-only and shells out to `sf package
version create` for the create step alone.** `@salesforce/packaging` is not a dependency of this
repo.

| Step | Composite | TypeScript |
|---|---|---|
| Preflight limits | `sf org list limits --json` | `connection.request('<baseUrl>/limits')` |
| Workspace digest | Node script | `FileSystemService` + node crypto |
| **Create** | `sf package version create --json` | **same subprocess** |
| Poll | `sf package version create report --json` | `connection.tooling.query` |
| Evidence | `sf data query -t --json` ×N | `connection.tooling.query` ×N |
| Tag | `git` | `git` |

This preserves behavioural parity (identical inputs, outputs, artifacts, exit codes), keeps the
committed single-file bundle, and leaves benchmark scenarios (b), (c) and (d) — the ones design
§14 expects TypeScript to win — entirely on the library path. Scenario (a) becomes a like-for-like
comparison of the same subprocess, which is the honest answer to a question §14 already flags as
I/O-bound.

The TypeScript action must set `SF_DISABLE_LOG_FILE=true` before touching `@salesforce/core`.

### Environment gaps for the live gates

- `gabor_dev` has 2GP enabled but **contains no `Package2` records**. The repo owner is creating
  a real package; the live gates (Task 2) and the benchmark (Task 9) run against it once it
  exists.
- The other Dev Hub `gaborOrg` has an expired refresh token.
- `Package2VersionCreates` headroom is **6/day**. Task 2's gate (one success + one deliberate
  failure) times two implementations, plus Task 9's 10-run benchmark, exceeds that in a single
  day — the benchmark's create-path runs must be spread across days or use `--skip-validation`
  (which draws on the 500/day limit) with that stated in the results.

---

## Reproducing

```bash
sf --version
sf package version create --help
sf package version create report --help
sf org list limits --help
sf org list limits -o <devhub>
sf sobject describe -s Package2VersionCreateRequest      -t -o <devhub> --json
sf sobject describe -s Package2VersionCreateRequestError -t -o <devhub> --json
sf sobject describe -s Package2Version                   -t -o <devhub> --json
npm view @salesforce/packaging version
npm view @salesforce/core version
npx esbuild@0.23.1 entry.js --bundle --platform=node --target=node20 --outfile=dist/index.js
```
