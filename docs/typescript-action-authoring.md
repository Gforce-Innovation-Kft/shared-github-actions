# Authoring a TypeScript Action

Actions in this repo follow one template: **business logic and input/output
shaping go in `@gforce/core`; the GitHub Actions plumbing goes in
`@gforce/github-actions-runtime`; the action is a thin adapter** that names four
collaborators and hands them to `runGitHubAction`. See
[architecture.md](./architecture.md) for the why.

## Steps to add a new action

1. **Add the use case + action seam to core** (`packages/core/src/actions/<name>/`):
   - `types.ts` — request/result/deps **plus** `Raw*Inputs` / `Validated*Inputs`.
   - `<name>.ts` — the `orchestrate`-style use case returning `Result<T>`, **and**
     a `run<Name>Action(input, context)` seam that maps `Validated*Inputs` +
     `ActionContext` onto the use case.
   - `validate<Name>Inputs.ts` — `Raw*Inputs -> Validated*Inputs` (reuses the
     shared validation helpers).
   Reuse existing `GitHubService` (facade) methods; only add a new method to the
   relevant per-domain `<domain>Service.ts` (the port + its `Octokit*Service`
   live in that one file) and the facade if no wrapper exists yet — or a new
   `github-service/<domain>/<domain>Service.ts` if it's a new area (see
   "Extending a GitHub service domain" below). Export everything from
   `packages/core/src/index.ts`. Add core unit tests.

2. **Add the adapter to `packages/github-actions`**:
   - `src/<name>/` — three template files (`index`, `inputReader`, `outputWriter`).
     `index.ts` builds the `GitHubActionDefinition`, exposes `run(overrides?)`
     (which calls `runGitHubAction`), and self-invokes under a
     `require.main === module` guard so importing it in tests doesn't run it.
   - Add a `bundle:<name>` script to `packages/github-actions/package.json`
     (`ncc build src/<name>/index.ts -o ../../.github/actions/<name>/dist`) and
     chain it into the package's `bundle` script.
   - `.github/actions/<name>/action.yml` — `using: node20`, `main: dist/index.js`,
     kebab-case inputs/outputs. This is the ONLY hand-written file in the runner
     folder; everything else there is the committed ncc bundle.

3. **No workspace registration needed** — `packages/github-actions` is already
   a workspace; new actions are just folders inside it.

4. **Tests** (`packages/github-actions/__tests__/<name>/` +
   `packages/github-actions/__integration__/<name>.integration.test.ts`):
   `inputReader`, `outputWriter`, and a `main` test asserting the definition is
   wired from the shared pieces and that `run()` delegates to `runGitHubAction`.
   The integration test drives `run()` end-to-end with a fake service injected
   as a context override and asserts `dist/index.js` exists. (Validators, the
   run seam, the logger, repo parsing, and `runGitHubAction` are tested in
   core / the runtime package.)

5. **Bundle, then validate.** `npm run bundle -w @gforce/github-actions` then
   `npm run all`. Commit `dist/index.js` (the pre-commit hook keeps it in sync).

6. **Document.** Add an example caller to `examples/<name>.yml` and a row to the
   README / CLAUDE action tables. State the **least-privilege permissions** the
   action needs (e.g. `contents: read` vs `write`, `pull-requests: write`).

## Action skeleton (copy/paste)

The adapter is always these three files. Only the names and the four collaborators
change between actions.

```text
packages/github-actions/src/<name>/
  index.ts        # definition + run() + require.main guard (below)
  inputReader.ts  # core.getInput(...) -> Raw*Inputs  (type imported from @gforce/core)
  outputWriter.ts # result -> core.setOutput(...)     (kebab-case keys)
```

```ts
// src/index.ts — the entire adapter wiring
import {
  run<Name>Action,
  validate<Name>Inputs,
  type ActionContext,
  type Raw<Name>Inputs,
  type Validated<Name>Inputs,
  type <Name>Result,
} from '@gforce/core';
import { runGitHubAction, type GitHubActionDefinition } from '@gforce/github-actions-runtime';
import { readInputs } from './inputReader';
import { writeOutputs } from './outputWriter';

export const <name>Action: GitHubActionDefinition<
  Raw<Name>Inputs,
  Validated<Name>Inputs,
  <Name>Result
> = {
  readInputs,
  validateInputs: validate<Name>Inputs,
  execute: run<Name>Action,
  writeOutputs,
};

/** Action entrypoint. `overrides` is for tests; production passes nothing. */
export function run(overrides?: Partial<ActionContext>): Promise<void> {
  return runGitHubAction(<name>Action, overrides);
}

/* istanbul ignore next -- runner-only entry guard; tests import and call run() directly */
if (require.main === module) {
  void run();
}
```

## Extending a GitHub service domain

GitHub API wrappers live in `packages/core/src/github-service/<domain>/`, one file
per domain holding **both** the port and its single Octokit implementation:

```text
github-service/<domain>/
  <domain>Service.ts   # export interface <Domain>Service { ... }
                       # export class Octokit<Domain>Service implements <Domain>Service
                       #   - constructor(octokit) — injectable for fakes
                       #   - static getInstance/newInstance/resetInstance (wrap GitHubClient)
                       #   - one method per API call, via runOctokit(...)
  types.ts             # value objects for the domain
```

- Reuse `client/GitHubClient` (the only `new Octokit(...)`) and
  `client/octokitSupport` (`runOctokit`, `toGitHubApiError`) — don't re-roll error
  wrapping or client construction.
- Fold a new domain into the facade `github/gitHubService.ts` (`GitHubService
  extends ...`, plus delegating methods on `OctokitGitHubService`).
- Service interfaces stay covered (the impl is colocated); only a pure
  interface-only stub is excluded in `jest.config.js`.

## Rules (also for AI agents)

- **No business logic in the entrypoint.** `index.ts` only wires the
  `GitHubActionDefinition` and delegates the loop to `runGitHubAction`; the logic
  lives in core and the run loop in the runtime package.
- **Never import `@actions/core` (or any runner API) in `packages/core`.** Anything
  `@actions/*`-bound belongs in `@gforce/github-actions-runtime`. Pure helpers
  (e.g. `parseRepoRef`) stay in core; only the env read lives in the runtime.
- **One wrapper per GitHub API call**, on the relevant domain's `Octokit*Service`
  class in `<domain>Service.ts` (`@octokit/rest` is touched nowhere else). Reuse
  it; don't call Octokit from a use case or adapter.
- **Build the service via `OctokitGitHubService.getInstance(token)`** (the runtime
  does this for you) — don't `new Octokit()` in an adapter. Use
  `newInstance`/`resetInstance` only for test isolation.
- **Never skip tests or lower the 90% per-package threshold.** Bundle before
  testing so the integration bundle check passes.
- **Always commit `dist/`; never commit `node_modules/`.**
- **Don't modify unrelated actions** when adding a new one.

## Local commands

```bash
npm install                          # link workspaces + install husky
npm run all                          # format:check + lint + typecheck + bundle + test + dist:verify
npm run test -w @gforce/github-actions      # all adapters' tests + coverage
npm run bundle -w @gforce/github-actions    # rebuild every action's dist/index.js
```
