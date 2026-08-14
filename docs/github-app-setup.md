# Setting up the `gforce-ci-bot` GitHub App

The one-time org setup behind [`github-app-token`](../.github/actions/github-app-token/action.yml).
Everything here is manual because **there is no API to create a GitHub App** — the
manifest flow needs a browser redirect, so a human clicks it once and then never again.

## Why a second App

`Gforce-Innovation-Kft` already has an App: **Github Gforce App** (`2453054`), which
`sf-develop-demo` authenticates as from Apex (`GitHubAppAuthService`) to dispatch
workflows. It would work for CI too, and that is exactly the reason not to use it.

Its private key lives in Salesforce custom metadata
(`GitHub_App_Settings__mdt.Private_Key_Base64__c`). Reusing it for CI means the same key
also lives in GitHub org secrets: two systems, one credential, and a rotation that has to
land in both or silently break one. A CI-only App keeps the blast radius at CI.

## 1. Register the App

<https://github.com/organizations/Gforce-Innovation-Kft/settings/apps/new>

| Field                                       | Value                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| **GitHub App name**                         | `gforce-ci-bot`                                                             |
| **Homepage URL**                            | `https://github.com/Gforce-Innovation-Kft/shared-github-actions`            |
| **Webhook**                                 | **Uncheck "Active"** — nothing listens, and an inactive webhook cannot leak |
| **Where can this GitHub App be installed?** | Only on this account                                                        |

### Permissions

Two of these live under different headings in the UI, and the difference is the single
easiest thing to get wrong here.

**Repository permissions**

| Permission | Level              | Used by                                                                          |
| ---------- | ------------------ | -------------------------------------------------------------------------------- |
| Actions    | **Read and write** | dispatching `weather2gp-release.yml` into `sf-develop-demo` and watching the run |
| Contents   | **Read-only**      | `gh run watch` resolving the dispatched run                                      |
| Metadata   | Read-only          | mandatory, granted automatically                                                 |

**Organization permissions**

| Permission | Level              | Used by                                                                |
| ---------- | ------------------ | ---------------------------------------------------------------------- |
| Packages   | **Read and write** | making the throwaway GHCR candidate public, and deleting it afterwards |

> There is a **Packages** entry under _Repository_ permissions as well. That one is not
> enough. Pulling and pushing an image uses the repository permission; setting a
> package's visibility (`PATCH /orgs/{org}/packages/...`) and deleting a version are org
> endpoints and will 403 with only the repository one. Grant the **organization**
> Packages permission.

## 2. Generate a private key

On the App's page → **Private keys** → **Generate a private key**. A `.pem` downloads.
That file is the credential; GitHub keeps no copy you can retrieve later.

Note the **Client ID** (`Iv23li…`) from the same page — prefer it over the numeric App
ID, which `actions/create-github-app-token` deprecated in v3.

## 3. Install it on the repositories

App page → **Install App** → `Gforce-Innovation-Kft` → **Only select repositories**:

- `sf-docker-images`
- `sf-develop-demo`

Registering the App in the org is **not** the same as installing it. A missing
installation fails as a 404 on the installation lookup, which reads like a wrong App ID
and sends you back to check the wrong thing.

## 4. Store the credentials at org level

Org-level, so a new repo inherits them instead of copying the key around:

```bash
gh variable set GFORCE_CI_APP_ID \
  --org Gforce-Innovation-Kft --visibility all \
  --body 'Iv23liXXXXXXXXXXXX'

gh secret set GFORCE_CI_APP_PRIVATE_KEY \
  --org Gforce-Innovation-Kft --visibility all \
  < ~/Downloads/gforce-ci-bot.2026-08-14.private-key.pem
```

Then delete the local `.pem`. Generate a fresh one if you ever need it again — that is
cheaper than keeping a private key in `~/Downloads`.

`--visibility all` covers private repos too. Use `--visibility selected --repos a,b` if
you would rather name them, but then adding a repo means remembering this step.

## 5. Verify

The next `sf-ci` pull request exercises all three token mints. In the job log the action
prints its own scope:

```
✅ Minted an installation token
   App:          gforce-ci-bot (installation 12345678)
   Owner:        Gforce-Innovation-Kft
   Repositories: sf-develop-demo
   Permissions:
     actions        write
     contents       read
   Expires:      1 hour from now
```

Failure modes, in the order they actually happen:

| Symptom                                                   | Cause                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Pass client-id (preferred) or app-id. Both were empty`   | the org variable is not shared with the calling repo — an unshared org variable arrives as an empty string, not an error |
| `private-key does not look like a PEM`                    | the key was pasted without its `-----BEGIN-----`/`-----END-----` lines                                                   |
| 404 on the installation lookup                            | App registered but not installed on that repo                                                                            |
| 403 on `PATCH /orgs/.../packages/...`                     | the **organization** Packages permission is missing (the repository one was granted instead)                             |
| `repositories is empty` / `No permission-* input was set` | the caller did not scope the token; this is the action refusing to mint, not a misconfiguration                          |

## Rotating the key

Generate a new private key on the App page, run the `gh secret set` above again, then
delete the old key from the App. In that order — the reverse breaks every in-flight run.

Nothing else needs to change: no workflow holds the key, only the org secret does.

## Retiring the PATs

`gforce-ci-bot` replaces `E2E_DISPATCH_TOKEN` (removed from `sf-docker-images` in
`feat(ci)!: authenticate the E2E gate as a GitHub App`). The fleet's other PAT,
`CATALOG_SCAN_TOKEN` in this repo's `catalog-refresh.yml`, can move to the same App —
it needs org-wide `contents: read` plus `pull-requests: write`, so it wants
`allow-broad-scope: true` or an explicit repository list, and is worth doing as its own
change.
