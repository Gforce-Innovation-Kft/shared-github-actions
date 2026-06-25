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
   relevant per-domain port + its `Octokit*Service` (and the facade) if no
   wrapper exists yet — or a new `*Service` domain module if it's a new area.
   Export everything from
   `packages/core/src/index.ts`. Add core unit tests.

2. **Scaffold the action** under `.github/actions/<name>/`:
   - `package.json` — name `@gforce/<name>`, deps `@actions/core`,
     `@gforce/core: "*"`, `@gforce/github-actions-runtime: "*"` (no direct
     `@octokit/rest`); scripts `typecheck` / `test` / `bundle` (copy an existing action).
   - `action.yml` — `using: node20`, `main: dist/index.js`, kebab-case inputs/outputs.
   - `tsconfig.json` — `extends ../../../tsconfig.base.json`, `noEmit`.
   - `jest.config.js` — copy an existing action (maps `@gforce/core` **and**
     `@gforce/github-actions-runtime` to source, per-package 90% threshold).
   - `src/` — three template files (`index`, `inputReader`, `outputWriter`).
     `index.ts` builds the `GitHubActionDefinition`, exposes `run(overrides?)`
     (which calls `runGitHubAction`), and self-invokes under a
     `require.main === module` guard so importing it in tests doesn't run it.

3. **Register the workspace.** Add `.github/actions/<name>` to the root
   `package.json` `workspaces` array (it is an explicit list — composite actions
   have no `package.json`, so we don't glob `.github/actions/*`). Run `npm install`.

4. **Tests** (`__tests__/` + `__integration__/`): `inputReader`, `outputWriter`,
   and a `main` test asserting the definition is wired from the shared pieces and
   that `run()` delegates to `runGitHubAction`. The integration test drives `run()`
   end-to-end with a fake service injected as a context override and asserts
   `dist/index.js` exists. (Validators, the run seam, the logger, repo parsing,
   and `runGitHubAction` are tested in core / the runtime package.)

5. **Bundle, then validate.** `npm run bundle -w @gforce/<name>` then
   `npm run all`. Commit `dist/index.js` (the pre-commit hook keeps it in sync).

6. **Document.** Add an example caller to `examples/<name>.yml` and a row to the
   README / CLAUDE action tables.

## Rules (also for AI agents)

- **No business logic in the entrypoint.** `index.ts` only wires the
  `GitHubActionDefinition` and delegates the loop to `runGitHubAction`; the logic
  lives in core and the run loop in the runtime package.
- **Never import `@actions/core` (or any runner API) in `packages/core`.** Anything
  `@actions/*`-bound belongs in `@gforce/github-actions-runtime`. Pure helpers
  (e.g. `parseRepoRef`) stay in core; only the env read lives in the runtime.
- **One wrapper per GitHub API call**, in the relevant `Octokit*Service` only
  (`@octokit/rest` is touched nowhere else). Reuse it; don't call Octokit from a
  use case or adapter.
- **Build the service via `OctokitGitHubService.getInstance(token)`** (the runtime
  does this for you) — don't `new Octokit()` in an adapter. Use
  `newInstance`/`resetInstance` only for test isolation.
- **Never skip tests or lower the 90% per-package threshold.** Bundle before
  testing so the integration bundle check passes.
- **Always commit `dist/`; never commit `node_modules/`.**
- **Don't modify unrelated actions** when adding a new one.

## Local commands

```bash
npm install              # link workspaces + install husky
npm run all              # format:check + lint + typecheck + bundle + test + dist:verify
npm run test -w @gforce/<name>      # one package's tests + coverage
npm run bundle -w @gforce/<name>    # rebuild one action's dist/index.js
```
