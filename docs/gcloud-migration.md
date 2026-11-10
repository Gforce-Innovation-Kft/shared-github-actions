# Google Cloud migration

On 2026-11-10 GForce Google Cloud moved into a Terraform-managed landing zone
(`gforce-google-cloud`). The old projects `claude-integration-501116`, `gforce-salesforce-cicd`,
`gforce-sf-platform` and `gen-lang-client-0257489838` are shutting down, and `gforce-google-infra`
is being deleted. The shutdown leaves a 30-day undelete window. This repo has no Google Cloud
config of its own; its actions take the provider, project and secret as inputs.

## What this repo touches

| Item                                     | File in this repo                                                                                               | Old location                                     | New target                                                           | Breaks at shutdown                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------- |
| Workload Identity provider (input)       | `.github/actions/sf-org-login/action.yml`, `.github/actions/gcp-secret-get/action.yml`                          | pool `github-pool`, provider `github-provider`   | pool `github` in `gforce-shared-platform`, provider `github-actions` | Not here. Each caller's repo variable breaks. |
| Secret project (input)                   | the same two actions                                                                                            | `gforce-salesforce-cicd`                         | `gforce-shared-credentials`                                          | Not here. Each caller's input breaks.         |
| Secret `salesforce-devhub` (doc example) | the same two actions (input descriptions), `.github/workflows/smoke-sf-org-login.yml` (credential-free fixture) | `gforce-salesforce-cicd` `salesforce-devhub`     | `gforce-shared-credentials` `salesforce-devhub-jwt`                  | No. The smoke test never calls Google Cloud.  |
| Source of the `github-env` secrets       | `CLAUDE.md`, `docs/claude-actions-reference.md`                                                                 | `gforce-google-infra` `gh-secret-sync` (retired) | none; see below                                                      | Documentation only.                           |

The actions themselves need no code change. They hold no project, pool or secret names.

## Secret names

| Old (`gforce-salesforce-cicd`) | New (`gforce-shared-credentials`) |
| ------------------------------ | --------------------------------- |
| `salesforce-devhub`            | `salesforce-devhub-jwt`           |
| `salesforce-integration`       | `salesforce-integration-jwt`      |
| `salesforce-demo-prod`         | `salesforce-demo-production-jwt`  |
| `salesforce-github-app`        | `github-app-salesforce-key`       |

The JSON bundle shape that `gcp-secret-get` and `sf-org-login` expect is unchanged. Secret
values are copied into the new containers before any caller switches.

## Checklist

- [ ] Callers set the repository variable `GCP_WORKLOAD_IDENTITY_PROVIDER` to the `shared` output
      `workload_identity_provider` of `gforce-google-cloud`. Never hardcode it in a caller or here.
- [ ] Callers pass `gcp-project-id: gforce-shared-credentials` and the new `gcp-secret-name`.
- [ ] Each calling repository has its `principalSet` grant in the `shared` root of
      `gforce-google-cloud`.
- [ ] Check whether the new provider still requires a job `environment:`. The comment in
      `gcp-secret-get/action.yml` describes the old provider's `attribute_condition`.
- [ ] After the callers switch, change the example secret names in the two action descriptions
      to the `*-jwt` names, and re-run `smoke-sf-org-login.yml`.
- [ ] Regenerate `docs/usage-catalog.md` once callers are on the new inputs.

## GitHub Environment secrets

`credential-source: github-env` reads Environment secrets that `gh-secret-sync` in
`gforce-google-infra` used to fill. Existing values stay in place, but nothing syncs or rotates
them any more. Prefer `credential-source: gcp` where a repo can use it.

Inventory: [plan-2-inventory PR](https://github.com/Gforce-Innovation-Kft/gforce-google-cloud/pull/7).
