# Authoring a TypeScript Action

Actions follow one template: **all implementation lives in `gforce-gha-src/`**
(Validator + Orchestrator per action, business logic in services, API wrappers
in clients); the runner folder holds only a plain-function entry point, the
manifest, and the committed bundle. See [architecture.md](./architecture.md)
for the layer rules and the why.

Before writing code, map every piece of work to a layer:

| Logic type | Where it lives |
| --- | --- |
| Read inputs, set outputs | `.github/actions/<name>/index.ts` (plain function only) |
| Coordinate steps end-to-end | `gforce-gha-src/actions/<name>/orchestrator.ts` |
| Validate and sanitize inputs | `gforce-gha-src/actions/<name>/validator.ts` |
| Business workflow | `gforce-gha-src/services/<name>-service.ts` (or `libraries/<ctx>/services/`) |
| GitHub REST wrappers | `gforce-gha-src/clients/github/<domain>/` — one method per endpoint |
| File I/O | `FileSystemService` |
| Logging | `LoggerService` |
| Runner env (repo slug) | `GithubContextService` |
| Pure filter/transform over data | `selectors/` (or `libraries/<ctx>/selectors/`) |
| Shared DTOs | `gforce-gha-src/types/index.ts` |
| External-system logic (Salesforce, …) | `gforce-gha-src/libraries/<context>/` |

**Before implementing anything, ask: does this already exist in
`gforce-gha-src`?** If two actions need the same logic, extract a shared
service.

## Steps to add a new action

1. **Types** — add `Validated<Name>Inputs` (+ request/result DTOs) to
   `gforce-gha-src/types/index.ts` (external-system shapes go in
   `libraries/<ctx>/models/types.ts`).

2. **Validator** — `gforce-gha-src/actions/<name>/validator.ts`: a `Validator`
   singleton whose `inputValidation(rawInputs: unknown)` reads the kebab-case
   keys with `readStringInput` and normalizes with the shared helpers
   (`requireNonEmpty`, `parseBoolean`, `parseEnum`, `parseList`). All input
   validation lives here — never in the entry or the Orchestrator.

3. **Service** — the business workflow as a singleton service. GitHub calls go
   through `GitHubClient.getInstance(token)` (the facade); add missing
   endpoints to the matching sub-client first (one thin wrapper per endpoint,
   error mapping only) and expose them via the facade. Log through
   `LoggerService`; touch files through `FileSystemService`.

4. **Orchestrator** — `gforce-gha-src/actions/<name>/orchestrator.ts`: an
   `Orchestrator` singleton whose `execute(rawInputs: unknown)` reads as a
   numbered list of delegated steps (validate → resolve context → service
   call). No loops, no regex, no transformations, no API/file calls here.

5. **Entry + manifest** — `.github/actions/<name>/`:
   - `index.ts` — the spec template: `core.getInput` per input, one
     `Orchestrator.getInstance().execute({...})` call, `core.setOutput` per
     output, `catch` → `core.setFailed`. Zero logic.
   - `package.json` — copy an existing action's: `@gforce/<name>`, esbuild
     `build` (+ `bundle` alias), `--passWithNoTests` test, `typecheck -p
     ../tsconfig.json`, `"gforce-gha-src": "file:../../../gforce-gha-src"`.
   - `action.yml` — `using: node20`, `main: dist/index.js`, kebab-case
     inputs/outputs, least-privilege permissions documented in a comment.
   - Register the folder in the root `package.json` `workspaces` and append a
     `--prefix` step to `build:all` in `.github/actions/package.json`.

6. **Tests** — under `gforce-gha-src/__tests__/`, mirroring the source paths:
   - `method_scenario_expectedResult` names; `// Given` / `// When` (exactly
     one call) / `// Then` sections.
   - Mock at the singleton boundary
     (`jest.spyOn(Service.getInstance(), 'method')`); `resetInstance()` for
     every touched singleton in `afterEach`; assert spies with
     `toHaveBeenCalledWith`; typed errors via `toBeInstanceOf` +
     `toThrow('<message>')`.
   - Add `__tests__/integration/<name>.integration.test.ts` driving
     `Orchestrator.execute()` end-to-end and asserting `dist/index.js` exists.
   - Coverage gate is 95% on every metric; keep it at 100%.

7. **Bundle, then validate** — `npm run bundle:all`, then **`npm run all`**.
   Commit `dist/index.js` (the pre-commit hook keeps it in sync; CI
   `dist:verify` fails stale bundles).

8. **Document** — example caller in `examples/<name>.yml`, rows in the README
   and CLAUDE.md action tables, least-privilege permissions stated. Consider a
   CI smoke step in `ci.yml` executing the committed bundle.

## Entry skeleton (copy/paste)

```ts
// .github/actions/<name>/index.ts — the ONLY .ts file outside gforce-gha-src
import * as core from '@actions/core';

import { Orchestrator } from '../../../gforce-gha-src/actions/<name>/orchestrator';

async function run(): Promise<void> {
  try {
    const result = await Orchestrator.getInstance().execute({
      'some-input': core.getInput('some-input', { required: true }),
      'other-input': core.getInput('other-input'),
    });
    core.setOutput('some-output', result.someOutput);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

void run();
```

## Singleton skeleton

```ts
export class MyService {
  private static instance: MyService;

  private constructor() {}

  public static getInstance(): MyService {
    if (!MyService.instance) {
      MyService.instance = new MyService();
    }
    return MyService.instance;
  }

  // public methods here

  public static resetInstance(): void {
    MyService.instance = undefined as unknown as MyService;
  }
}
```

Token-holding clients use `getInstance(token)` with a token-mismatch guard plus
`newInstance(token)` for isolated instances — copy `GitHubBranchesClient`.

## Rules (also for AI agents)

- **No business logic in the entry point** — `index.ts` is getInput →
  `Orchestrator.execute` → setOutput/setFailed, nothing else.
- **Never `any`**, no non-null assertions, no type assertions (the singleton
  reset and test-only Octokit fakes are the exceptions). Explicit return types
  on all exported/public functions. `readonly` by default; `undefined` over
  `null`; string-literal unions over `enum`.
- **One wrapper per GitHub endpoint** on the matching sub-client;
  `@octokit/rest` is touched nowhere else. Services use the `GitHubClient`
  facade — never a raw Octokit.
- **Clients never log; services never call `core.getInput`/`setOutput`.**
- Validate everything in `Validator.inputValidation()`; mask secrets with
  `LoggerService.setSecret`; least-privilege `action.yml` permissions.
- **Never skip tests or lower the 95% gate.** Bundle before testing so the
  integration bundle check passes.
- **Always commit `dist/`; never commit `node_modules/`.**
- **Don't modify unrelated actions** when adding a new one.

## Local commands

```bash
npm ci                            # link workspaces + install husky
npm run all                       # format:check + lint + typecheck + bundle + test + dist:verify
npm run test -w gforce-gha-src    # unit (coverage) + integration suites
npm run bundle:all                # rebuild every action's dist/index.js
```
