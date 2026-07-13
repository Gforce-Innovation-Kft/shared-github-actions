  # Design: Consolidate TypeScript action adapters into `packages/github-actions`

**Date:** 2026-07-13
**Status:** Approved

## Problem

The three TypeScript actions (`sync-branches`, `create-release-pr`, `sf-find-tests`)
each carry their own workspace under `.github/actions/<name>`: `package.json`,
`tsconfig.json`, `jest.config.js`, `src/`, `__tests__/`, `__integration__/`. The
goal has always been "portable, testable shared module; minimum in the action
folder" — but today the adapter code and all its tests live in the runner folders,
and every new action duplicates the workspace boilerplate. CI also has gaps:
`dist:verify` hardcodes two of the three actions (sf-find-tests' committed bundle
is never verified), and nothing executes the actions on a real runner.

## Decisions (made during brainstorming)

1. **Structure:** one new workspace package `packages/github-actions` holds all
   per-action adapter code and tests. `.github/actions/<name>` keeps only
   `action.yml` + committed `dist/index.js`.
2. **Distribution:** packages stay private in-repo npm workspaces (no publishing,
   no separate repo). Consumers keep using
   `Gforce-Innovation-Kft/shared-github-actions/...@v1` — nothing changes for them.
3. **Bash composites** (`sf-jwt-login`, `sf-org-login`, `sf-delta-package`,
   `get-aws-secret`): stay bash — they compose other marketplace actions, which
   TypeScript actions cannot. actionlint keeps covering their manifests; deeper
   composite testing is a follow-up, not part of this project.
4. **CI depth:** static verification + smoke runs (execute each TS action from its
   committed dist on a real runner).

## Target structure

```
packages/
  core/                     # unchanged — logic, validation, services (no @actions/*)
  github-actions-runtime/   # unchanged — ActionsLogger, runGitHubAction
  github-actions/           # NEW: @gforce/github-actions
    src/
      sync-branches/        # index.ts, inputReader.ts, outputWriter.ts
      create-release-pr/
      sf-find-tests/
    __tests__/              # per-action unit tests (inputReader/main/outputWriter)
    __integration__/        # end-to-end run() tests + fixtures + dist-exists asserts
    jest.config.js
    package.json
    tsconfig.json

.github/actions/
  sync-branches/            # action.yml + dist/index.js ONLY
  create-release-pr/        # action.yml + dist/index.js ONLY
  sf-find-tests/            # action.yml + dist/index.js ONLY
  get-aws-secret/           # bash composite — unchanged
  sf-jwt-login/             # bash composite — unchanged
  sf-org-login/             # bash composite — unchanged
  sf-delta-package/         # bash composite — unchanged
```

- The dependency rule is unchanged: `packages/core` never imports `@actions/*`.
  `@gforce/github-actions` depends on `@gforce/core` +
  `@gforce/github-actions-runtime` (it owns the `@actions/core` `getInput`/
  `setOutput` calls in inputReader/outputWriter).
- Each action's `index.ts` keeps the existing shape: a declarative
  `GitHubActionDefinition` (readInputs / validateInputs / execute / writeOutputs),
  a `run(overrides?)` delegating to `runGitHubAction`, and the
  `require.main === module` guard.
- Root `package.json` `workspaces`: remove the three `.github/actions/*` entries,
  add `packages/github-actions`.
- Service singletons (`getInstance` / `newInstance` / `resetInstance`), the
  `Result<T, AppError>` boundary, and validation in core are all unchanged.

## Bundling & git hooks

- `@gforce/github-actions` owns per-action bundle scripts:

  ```json
  "bundle": "npm run bundle:sync-branches && npm run bundle:create-release-pr && npm run bundle:sf-find-tests",
  "bundle:sync-branches": "ncc build src/sync-branches/index.ts -o ../../.github/actions/sync-branches/dist"
  ```

  (same pattern for the other two). Root `bundle:all` continues to work via
  `npm run bundle --workspaces --if-present`.
- `dist:verify` becomes a glob over every bundled action —
  `git diff --exit-code -- .github/actions/*/dist` — closing the sf-find-tests gap
  and automatically covering future actions.
- lint-staged: the rebuild trigger changes from `.github/actions/*/src/**/*.ts`
  to `packages/**/src/**/*.ts` (a core or runtime change must re-bundle too);
  the re-stage globs stay `:(glob).github/actions/*/dist/**`.

## CI verification

`ci.yml` keeps the existing `quality` job (format check, lint, typecheck,
bundle, test with per-package coverage, `dist:verify`, pinned actionlint,
coverage artifact upload) and adds a **smoke job** that executes each TS action
from its committed `dist/` via `uses: ./.github/actions/<name>`:

| Action | Smoke inputs | Network |
|--------|--------------|---------|
| `sf-find-tests` | committed fixtures (`package-xml`, `source-dir`) | none |
| `sync-branches` | `dry-run: true`, `source-branch: main`, `target-branch: main`, `github.token` | read-only API ("already in sync" path) |
| `create-release-pr` | `dry-run: true`, `github.token` | read-only API (dry-run skips creation) |

Each smoke step asserts the action's declared outputs are set. This verifies what
unit tests cannot: `action.yml` input wiring, the committed bundle actually
executing on a runner, and output names. Coverage upload path updates to
`packages/*/coverage` only.

## Testing

- All Jest config/tests consolidate into `packages/github-actions`:
  - Unit tests per action: `__tests__/<action>/inputReader.test.ts`,
    `main.test.ts`, `outputWriter.test.ts` (mock `@actions/core`).
  - Integration tests: drive `run()` through the real `runGitHubAction` with an
    in-memory fake `GitHubService` injected via context overrides; assert the
    committed bundle exists; sf-find-tests keeps its fixture force-app tree.
- One 90% coverage gate for the package (branches/functions/lines/statements) —
  the same per-package threshold policy as today. Existing adapters report 100%,
  so consolidation must not reduce that.
- `packages/core` and `packages/github-actions-runtime` tests are untouched.
- Jest `moduleNameMapper` for `@gforce/core` / `@gforce/github-actions-runtime`
  mirrors the existing action configs (consume TypeScript source directly).

## Docs & conventions

Update to describe the new layout:

- `docs/architecture.md` — layer diagram, adapter template location, bundle flow.
- `docs/typescript-action-authoring.md` — "adding an action = one folder in
  `packages/github-actions/src/<name>` + `.github/actions/<name>/action.yml` +
  one bundle script entry."
- `CLAUDE.md`, `CONTRIBUTING.md`, `README.md` where they reference the old layout.

## Migration approach

Pure move + rewire, no logic changes:

1. Create `packages/github-actions` (package.json, tsconfig, jest config).
2. `git mv` each action's `src/`, `__tests__/`, `__integration__/` into it;
   adjust relative imports and jest paths.
3. Delete per-action `package.json` / `tsconfig.json` / `jest.config.js`;
   update root workspaces.
4. Rewire bundle scripts, `dist:verify`, lint-staged, ci.yml (quality job paths
   + new smoke job).
5. Rebuild bundles; verify `dist/index.js` output is functionally identical.
6. Update docs.

## Success criteria

- `.github/actions/<ts-action>/` contains exactly `action.yml` + `dist/`.
- `npm run all` passes: format, lint, typecheck, bundle, tests (90%+ per
  package), `dist:verify` covering all three bundles.
- CI smoke job runs all three actions from committed dist and asserts outputs.
- actionlint passes on all workflow changes.
- No behavior change for action consumers (same `uses:` refs, same
  inputs/outputs).

## Out of scope

- Migrating bash composites to TypeScript (possible follow-up).
- Publishing packages to npm/GitHub Packages.
- zizmor / security scanning of workflows (possible follow-up).
- New actions or behavior changes to existing actions.
