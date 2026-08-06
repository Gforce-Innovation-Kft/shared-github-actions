# Consuming the Salesforce ops dispatch layer

The contract between Salesforce and `reusable-sf-ops-dispatch.yml` (L3). Everything here is
what the Apex/LWC side codes against; the reasoning behind it is in
[ADR 0001](adr/0001-salesforce-dispatch-layer.md).

One request → exactly one route → exactly one callback, all keyed by a
**correlation id the requester generates**.

```text
LWC  ──►  Apex  ──►  GitHub App JWT  ──►  dispatch API  ──►  L4 caller  ──►  L3 dispatch
 ▲                                                                              │
 └──────────────  Apex REST callback  ◄──── sf-ops-callback  ◄───────────────────┘
```

## 1. The correlation id

Every request carries one. It is the only thing that ties the LWC's record, the
GitHub run, and the callback together.

- Format: `^[A-Za-z0-9_-]{8,64}$`. A rejected id is the **one** failure the
  requester cannot be told about — there is no key to record the callback
  against — so validate it in Apex before dispatching.
- Generate it once per user action and reuse it on retry. It is the idempotency
  key: a duplicate delivery while the first run is in flight queues behind it
  (`concurrency`), and a retry after completion is detected per operation
  (`already-released`, `already-installed`).
- Salesforce's 18-character record id of the request record is a good source.

## 2. Request shape

### `repository_dispatch` (the normal path)

`POST /repos/Gforce-Innovation-Kft/<repo>/dispatches`

```json
{
  "event_type": "sf_ops_requested",
  "client_payload": {
    "correlationId": "a0B9J000000abcXUAQ",
    "operation": "promote",
    "package": "weather-app",
    "versionId": "04tgL000000M26PQAS",
    "targetOrgAlias": "uat",
    "environment": "sf-ops",
    "dryRun": false
  }
}
```

`GitHubDispatchService.dispatch()` already speaks this shape — a new
`GitHubDispatchEvent` subclass with `getEventType()` returning `sf_ops_requested`
is all that is needed.

Note `repository_dispatch` **only ever runs the default branch's** workflow file.

### `workflow_dispatch` (for humans and for testing a branch)

`POST /repos/<owner>/<repo>/actions/workflows/sf-ops.yml/dispatches` with
`{"ref": "<branch>", "inputs": { ... }}` — the same fields, flat, as strings.
`GitHubActionsService.triggerWorkflow()` already speaks this shape. Capped at 10
inputs by GitHub.

### Field reference

| Field (payload) | Field (inputs) | Required for | Accepted |
|---|---|---|---|
| `correlationId` | `correlation-id` | all | `^[A-Za-z0-9_-]{8,64}$` |
| `operation` | `operation` | all | `create-version`, `promote`, `install` |
| `package` | `package` | `create-version` | `^[A-Za-z0-9 ._-]{1,80}$` |
| `versionId` | `version-id` | `promote`, `install` | `^04t[A-Za-z0-9]{12,15}$` |
| `targetOrgAlias` | `target-org-alias` | `install` | `^[A-Za-z0-9._-]{1,80}$` |
| `environment` | `environment` | optional | `^[A-Za-z0-9._ -]{1,60}$`, default `sf-ops` |
| `dryRun` | `dry-run` | optional | boolean, default `false` |

Anything not on this list is ignored. Any listed value that fails its pattern
rejects the whole request with `INVALID_INPUT` — and still produces a callback.

## 3. Operation catalogue

| `operation` | Route | Does | Reports back |
|---|---|---|---|
| `create-version` | L2 `reusable-sf-package-release.yml` | Validates the source in a scratch org, builds a 2GP version, pushes the provenance tag, cuts a GitHub Release | `version-id`, `version-number`, `git-tag` |
| `promote` | L1 `sf-package-promote` | Promotes a `04t` to released. **Refuses** a version built with `--skip-validation` unless the caller opts in. Already-released is success. | `status` (`promoted` \| `already-released`), `version-number` |
| `install` | L1 `sf-package-install` | Installs one `04t` into the target org, polling to a terminal state. Already-installed is success. | `status` (`installed` \| `already-installed`), `install-request-id` |

`create-version` is the only operation that spends a **`Package2VersionCreates`**
slot — 6 per Dev Hub per day. Rate-limit it in Apex; the dispatcher will not.

**Installing a dependency chain is not automatic.** 2GP dependencies are not
transitive: Salesforce installs exactly the version you name. Until
`sf-package-resolve` lands, Apex must issue one `install` request per version, in
dependency order, and wait for each callback before sending the next.

## 4. The callback

The run POSTs its terminal status to an Apex REST endpoint. Default path:

```
/services/apexrest/gforce/ops-callback/v1
```

```json
{
  "schemaVersion": 1,
  "correlationId": "a0B9J000000abcXUAQ",
  "operation": "promote",
  "status": "succeeded",
  "errorCode": null,
  "errorMessage": null,
  "outputs": {
    "status": "already-released",
    "version-number": "0.1.0.1",
    "version-id": "04tgL000000M26PQAS"
  },
  "run": {
    "id": "1234567890",
    "attempt": "1",
    "number": "42",
    "url": "https://github.com/Gforce-Innovation-Kft/<repo>/actions/runs/1234567890",
    "repository": "Gforce-Innovation-Kft/<repo>",
    "workflow": "SF Ops"
  },
  "completedAt": "2026-08-06T10:14:03.221Z"
}
```

- `status` is one of `succeeded`, `failed`, `cancelled`, `no-route`. It is
  **always** sent — a failed operation still calls back. A request that goes
  silent is worse than one that fails.
- `outputs` is a flat object of whatever the route produced. Treat it as
  additive: new keys will appear, so read the ones you need rather than
  deserializing strictly.
- `errorCode` / `errorMessage` are null on success.
- The endpoint should be idempotent on `correlationId` — a re-run of the same
  request delivers a second callback.

Apex side, minimum viable:

```apex
@RestResource(urlMapping='/gforce/ops-callback/v1')
global with sharing class OpsCallbackResource {
  @HttpPost
  global static void receive() {
    // Upsert the request record on correlationId, set status/outputs,
    // publish a platform event so the LWC refreshes.
  }
}
```

## 5. Error taxonomy

| `errorCode` | Meaning | Retry? |
|---|---|---|
| `INVALID_INPUT` | A field was missing or failed its pattern | No — fix the request |
| `INVALID_OPERATION` | The operation matched no route | No |
| `NOT_VALIDATED` | Promote refused: the version was built with `--skip-validation` | No — rebuild validated, or re-request with `allow-unvalidated` |
| `INSTALL_FAILED` | Salesforce rejected the install; its own errors are in the run log and the evidence artifact | Sometimes |
| `ROUTE_FAILED` | The routed operation failed for another reason | Sometimes |
| `CANCELLED` | The run was cancelled before finishing | Yes |
| `INTERNAL` | The dispatcher itself could not process the request | Yes |

`QUOTA_EXHAUSTED` is surfaced today as a `ROUTE_FAILED` with the Dev Hub's own
message in the run log — `sf-package-create`'s preflight refuses to start without
headroom. Promoting it to its own code is a follow-up.

## 6. The L4 caller

Lives in the app repo. It forwards and does nothing else — the only place that
can set the run name, because a called workflow's `run-name:` is ignored.

```yaml
# .github/workflows/sf-ops.yml
name: SF Ops

run-name: >-
  sf-ops · ${{ github.event.client_payload.operation || inputs.operation }}
  · ${{ github.event.client_payload.correlationId || inputs.correlation-id }}

on:
  repository_dispatch:
    types: [sf_ops_requested]
  workflow_dispatch:
    inputs:
      operation:
        description: "create-version | promote | install"
        required: true
        type: string
      correlation-id:
        required: true
        type: string
      package:
        required: false
        type: string
      version-id:
        required: false
        type: string
      target-org-alias:
        required: false
        default: target
        type: string
      dry-run:
        required: false
        default: false
        type: boolean

permissions: {}

jobs:
  dispatch:
    permissions:
      contents: write
    uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-sf-ops-dispatch.yml@v2
    with:
      # client_payload wins on repository_dispatch; inputs are the fallback.
      # Both are re-validated by the dispatcher — this is forwarding, not trust.
      operation: ${{ github.event.client_payload.operation || inputs.operation }}
      correlation-id: ${{ github.event.client_payload.correlationId || inputs.correlation-id }}
      package: ${{ github.event.client_payload.package || inputs.package }}
      version-id: ${{ github.event.client_payload.versionId || inputs.version-id }}
      target-org-alias: ${{ github.event.client_payload.targetOrgAlias || inputs.target-org-alias }}
      dry-run: ${{ github.event.client_payload.dryRun || inputs.dry-run || false }}
      source-dirs: "weather-app fflib-apex-common/sfdx-source/apex-common fflib-apex-mocks/sfdx-source/apex-mocks"
    secrets:
      dev-hub-auth-url: ${{ secrets.DEVHUB_AUTH_URL }}
      target-org-auth-url: ${{ secrets.TARGET_ORG_AUTH_URL }}
      callback-auth-url: ${{ secrets.CALLBACK_AUTH_URL }}
```

### Secrets the caller must hold

| Secret | Needed for |
|---|---|
| `dev-hub-auth-url` | `create-version`, `promote` |
| `target-org-auth-url` | `install` |
| `callback-auth-url` | every operation — this is how the result gets home |
| `installation-key` | `install`, only when the version was built with one |

Produce an auth URL with
`sf org display --verbose --json --target-org <alias> | jq -r '.result.sfdxAuthUrl'`.

### GitHub App permissions

| Permission | Why |
|---|---|
| **Contents: Read & write** | `repository_dispatch` requires it |
| **Actions: Read & write** | `workflow_dispatch`, and reading run status |
| **Metadata: Read** | mandatory baseline |

### GitHub environments

`promote` and `install` run under the `environment:` named in the request
(default `sf-ops`). Add required reviewers there to gate irreversible or
production-facing operations — the run waits, and the callback arrives when it
resolves. The environment is also where a production install's
`target-org-auth-url` should live rather than at repo scope.

## 7. Verifying without spending anything

`dryRun: true` routes and reports without touching Salesforce: no scratch org, no
`Package2VersionCreates` slot, no secret used, and the callback prints its payload
instead of POSTing. `sf-ops-dispatch-smoke.yml` runs exactly that over all three
operations.

Order to verify for real, cheapest first:

1. `promote` an **already-released** version (e.g. `04tgL000000M26PQAS`). Expect
   `status: already-released` and a `succeeded` callback — proves the guard,
   idempotency and the round trip for zero cost.
2. `install` into a throwaway scratch org.
3. `create-version` last — the only one that spends a quota slot.

## 8. Not built yet

- **`sf-package-resolve`** — "latest released version of package X" plus a
  flattened, ordered dependency chain. Until then, `install` takes an explicit
  `04t` and Apex owns the ordering.
- **`create-version` idempotency.** A retried `create-version` with the same
  correlation id will build a second version. `sf package version create --tag`
  writes a queryable `Package2Version.Tag`, so the fix is a preflight SOQL in
  `sf-package-create`; see ADR 0001, decision 4.
