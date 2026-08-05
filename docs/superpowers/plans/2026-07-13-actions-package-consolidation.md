# Actions Package Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all three TypeScript action adapters (code + tests) into one new workspace `packages/github-actions`, shrink `.github/actions/<name>` to `action.yml` + committed `dist/`, and make CI verify every bundle plus smoke-run each action from its committed dist.

**Architecture:** The existing three layers stay: `packages/core` (portable logic, no `@actions/*`) → `packages/github-actions-runtime` (`@actions/core` adapter + `runGitHubAction`) → thin adapters. Only the adapters' *location* changes: from three per-action workspaces under `.github/actions/*` into one package `@gforce/github-actions` with `src/<action-name>/` folders. ncc bundles from the package into the committed `.github/actions/<name>/dist/index.js` that `action.yml` points at.

**Tech Stack:** TypeScript 5 (strict, via `tsconfig.base.json`), npm workspaces, Jest + ts-jest, `@vercel/ncc`, husky + lint-staged, actionlint, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-13-actions-package-consolidation-design.md`

## Global Constraints

- Node `>=20`; all workflow steps in composite actions keep `shell: bash`.
- `packages/core` never imports `@actions/core` or any runner API.
- Per-package Jest coverage threshold: 90% branches/functions/lines/statements. Never lower it.
- Action outputs stay kebab-case; `action.yml` files are NOT modified (inputs/outputs/`runs.main: dist/index.js` unchanged).
- Commit message prefixes: `Add:` / `Fix:` / `Update:` / `Docs:` / `Test:` / `Refactor:`.
- Third-party actions in workflows stay SHA-pinned.
- `dist/index.js` for every TS action is committed and must be current (`dist:verify`).
- No behavior change for consumers: same `uses:` refs, same inputs/outputs.
- Pre-commit (lint-staged) rebuilds bundles and re-stages dist; pre-push runs `npm run all`. Don't bypass hooks (`--no-verify` forbidden).
- Work happens on the existing branch `refactor/actions-package-consolidation`.

---

### Task 1: Scaffold `packages/github-actions` and migrate sync-branches

**Files:**
- Create: `packages/github-actions/package.json`
- Create: `packages/github-actions/tsconfig.json`
- Create: `packages/github-actions/jest.config.js`
- Move: `.github/actions/sync-branches/src/` → `packages/github-actions/src/sync-branches/`
- Move: `.github/actions/sync-branches/__tests__/` → `packages/github-actions/__tests__/sync-branches/`
- Move: `.github/actions/sync-branches/__integration__/sync-branches.integration.test.ts` → `packages/github-actions/__integration__/sync-branches.integration.test.ts`
- Delete: `.github/actions/sync-branches/package.json`, `.github/actions/sync-branches/tsconfig.json`, `.github/actions/sync-branches/jest.config.js`
- Modify: `package.json` (root — workspaces)
- Keep untouched: `.github/actions/sync-branches/action.yml`, `.github/actions/sync-branches/dist/` (dist is rebuilt, not hand-edited)

**Interfaces:**
- Consumes: `@gforce/core` exports (`runSyncBranchesAction`, `validateSyncBranchesInputs`, `RawSyncInputs`, `ValidatedSyncInputs`, `SyncBranchesResult`, `ActionContext`, `GitHubService`) and `@gforce/github-actions-runtime` (`runGitHubAction`, `GitHubActionDefinition`) — all unchanged.
- Produces: workspace `@gforce/github-actions` with scripts `typecheck`, `test`, `bundle`, `bundle:sync-branches`. Tasks 2–3 add `bundle:create-release-pr` / `bundle:sf-find-tests` to it; Tasks 4–5 rely on the package being the only test/bundle owner for adapters.

- [ ] **Step 1: Create the package manifest**

`packages/github-actions/package.json`:

```json
{
  "name": "@gforce/github-actions",
  "version": "0.1.0",
  "private": true,
  "description": "Thin GitHub Action adapters (input reading, wiring, output writing) for all bundled TypeScript actions.",
  "license": "MIT",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "jest --coverage --config jest.config.js",
    "bundle": "npm run bundle:sync-branches",
    "bundle:sync-branches": "ncc build src/sync-branches/index.ts -o ../../.github/actions/sync-branches/dist"
  },
  "dependencies": {
    "@actions/core": "^1.10.1",
    "@gforce/core": "*",
    "@gforce/github-actions-runtime": "*"
  }
}
```

(`bundle` is extended to chain the other two actions in Tasks 2 and 3.)

- [ ] **Step 2: Create tsconfig and jest config**

`packages/github-actions/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src", "__tests__", "__integration__"]
}
```

`packages/github-actions/jest.config.js` (same shape as the per-action configs, with sibling-package moduleNameMapper):

```js
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__', '<rootDir>/__integration__'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__integration__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@gforce/core$': '<rootDir>/../core/src/index.ts',
    '^@gforce/github-actions-runtime$': '<rootDir>/../github-actions-runtime/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
```

- [ ] **Step 3: Register the new workspace, drop the old one**

In root `package.json`, replace the `workspaces` array:

```json
"workspaces": [
  "packages/core",
  "packages/github-actions-runtime",
  "packages/github-actions",
  ".github/actions/create-release-pr",
  ".github/actions/sf-find-tests"
],
```

(The remaining two `.github/actions/*` entries are removed in Tasks 2 and 3.)

- [ ] **Step 4: Move the source and tests with git mv**

```bash
mkdir -p packages/github-actions/__tests__ packages/github-actions/__integration__
git mv .github/actions/sync-branches/src packages/github-actions/src/sync-branches
git mv .github/actions/sync-branches/__tests__ packages/github-actions/__tests__/sync-branches
git mv .github/actions/sync-branches/__integration__/sync-branches.integration.test.ts packages/github-actions/__integration__/sync-branches.integration.test.ts
git rm .github/actions/sync-branches/package.json .github/actions/sync-branches/tsconfig.json .github/actions/sync-branches/jest.config.js
```

Note: the first `git mv` creates `packages/github-actions/src/` implicitly. If the now-empty `.github/actions/sync-branches/__integration__/` directory lingers, remove it (`rmdir`).

- [ ] **Step 5: Fix test imports for the new depth**

Find every relative import that pointed at the old `src/`:

```bash
grep -rn "\.\./src" packages/github-actions/__tests__/sync-branches packages/github-actions/__integration__/sync-branches.integration.test.ts
```

Apply exactly these rewrites:

- In `packages/github-actions/__tests__/sync-branches/*.test.ts` (one level deeper than before):
  - `from '../src/inputReader'` → `from '../../src/sync-branches/inputReader'`
  - `from '../src/outputWriter'` → `from '../../src/sync-branches/outputWriter'`
  - `from '../src/index'` → `from '../../src/sync-branches/index'`
- In `packages/github-actions/__integration__/sync-branches.integration.test.ts` (same depth as before, but src is namespaced):
  - `from '../src/index'` → `from '../src/sync-branches/index'`
  - The committed-bundle assertion (currently `join(__dirname, '..', 'dist', 'index.js')`) becomes:

```ts
expect(
  existsSync(
    join(__dirname, '..', '..', '..', '.github', 'actions', 'sync-branches', 'dist', 'index.js'),
  ),
).toBe(true);
```

The action's own `src/sync-branches/*.ts` files import only from `@gforce/core`, `@gforce/github-actions-runtime`, and `./inputReader` / `./outputWriter` — no changes needed there.

- [ ] **Step 6: Install, typecheck, test**

```bash
npm install
npm run typecheck -w @gforce/github-actions
npm run test -w @gforce/github-actions
```

Expected: `npm install` updates `package-lock.json` (workspace `@gforce/sync-branches` disappears, `@gforce/github-actions` appears). Typecheck clean. Jest: all sync-branches unit + integration tests PASS, coverage 100% on `src/sync-branches` (≥90% gate).

- [ ] **Step 7: Rebundle and verify the whole repo**

```bash
npm run bundle -w @gforce/github-actions
npm run format
git add -A
npm run all
```

Expected: `dist/index.js` under `.github/actions/sync-branches/` changes (ncc inlines from the new path — intended). `npm run all` passes end-to-end: format:check, lint, typecheck (root tsconfig still globs `.github/actions/*/src`, which now matches only the two unmigrated actions — fine), bundle:all, test:all, dist:verify (clean because dist changes are staged... `git diff` compares worktree to index, so staged = clean).

- [ ] **Step 8: Commit**

```bash
git commit -m "Refactor: move sync-branches adapter and tests into packages/github-actions"
```

(lint-staged will rebuild bundles and re-stage dist; pre-commit must pass.)

---

### Task 2: Migrate create-release-pr

**Files:**
- Move: `.github/actions/create-release-pr/src/` → `packages/github-actions/src/create-release-pr/`
- Move: `.github/actions/create-release-pr/__tests__/` → `packages/github-actions/__tests__/create-release-pr/`
- Move: `.github/actions/create-release-pr/__integration__/create-release-pr.integration.test.ts` → `packages/github-actions/__integration__/create-release-pr.integration.test.ts`
- Delete: `.github/actions/create-release-pr/package.json`, `tsconfig.json`, `jest.config.js`
- Modify: `packages/github-actions/package.json` (bundle scripts), root `package.json` (workspaces)
- Keep untouched: `.github/actions/create-release-pr/action.yml`

**Interfaces:**
- Consumes: the `@gforce/github-actions` package from Task 1 (its jest/tsconfig cover the new folders automatically via the `src`/`__tests__`/`__integration__` roots).
- Produces: `bundle:create-release-pr` script; `packages/github-actions/src/create-release-pr/{index,inputReader,outputWriter}.ts` unchanged in content.

- [ ] **Step 1: Move files**

```bash
git mv .github/actions/create-release-pr/src packages/github-actions/src/create-release-pr
git mv .github/actions/create-release-pr/__tests__ packages/github-actions/__tests__/create-release-pr
git mv .github/actions/create-release-pr/__integration__/create-release-pr.integration.test.ts packages/github-actions/__integration__/create-release-pr.integration.test.ts
git rm .github/actions/create-release-pr/package.json .github/actions/create-release-pr/tsconfig.json .github/actions/create-release-pr/jest.config.js
```

(Remove the now-empty `__integration__/` dir after the move if it lingers.)

- [ ] **Step 2: Fix imports**

Same rewrites as Task 1 Step 5, with `create-release-pr` in place of `sync-branches`:

- `__tests__/create-release-pr/*.test.ts`: `'../src/X'` → `'../../src/create-release-pr/X'`
- `__integration__/create-release-pr.integration.test.ts`: `'../src/index'` → `'../src/create-release-pr/index'`; bundle assertion path → `join(__dirname, '..', '..', '..', '.github', 'actions', 'create-release-pr', 'dist', 'index.js')`

Verify nothing is left: `grep -rn "'\.\./src/" packages/github-actions/__tests__/create-release-pr packages/github-actions/__integration__/create-release-pr.integration.test.ts` must show only `../../src/create-release-pr/` (tests) / `../src/create-release-pr/` (integration) forms.

- [ ] **Step 3: Extend bundle scripts + drop the old workspace**

`packages/github-actions/package.json` scripts become:

```json
"bundle": "npm run bundle:sync-branches && npm run bundle:create-release-pr",
"bundle:sync-branches": "ncc build src/sync-branches/index.ts -o ../../.github/actions/sync-branches/dist",
"bundle:create-release-pr": "ncc build src/create-release-pr/index.ts -o ../../.github/actions/create-release-pr/dist"
```

Root `package.json` workspaces:

```json
"workspaces": [
  "packages/core",
  "packages/github-actions-runtime",
  "packages/github-actions",
  ".github/actions/sf-find-tests"
],
```

- [ ] **Step 4: Install, test, rebundle, verify, commit**

```bash
npm install
npm run test -w @gforce/github-actions
npm run bundle -w @gforce/github-actions
npm run format
git add -A
npm run all
git commit -m "Refactor: move create-release-pr adapter and tests into packages/github-actions"
```

Expected: both actions' tests pass in the one package; coverage ≥90%; `npm run all` green.

---

### Task 3: Migrate sf-find-tests (including fixtures)

**Files:**
- Move: `.github/actions/sf-find-tests/src/` → `packages/github-actions/src/sf-find-tests/`
- Move: `.github/actions/sf-find-tests/__tests__/` → `packages/github-actions/__tests__/sf-find-tests/`
- Move: `.github/actions/sf-find-tests/__integration__/sf-find-tests.integration.test.ts` → `packages/github-actions/__integration__/sf-find-tests.integration.test.ts`
- Move: `.github/actions/sf-find-tests/__integration__/fixtures/` → `packages/github-actions/__integration__/fixtures/`
- Delete: `.github/actions/sf-find-tests/package.json`, `tsconfig.json`, `jest.config.js`
- Modify: `packages/github-actions/package.json` (bundle scripts), root `package.json` (workspaces)
- Keep untouched: `.github/actions/sf-find-tests/action.yml`

**Interfaces:**
- Consumes: package from Tasks 1–2.
- Produces: `bundle:sf-find-tests` script; fixtures at `packages/github-actions/__integration__/fixtures/` — **Task 5's CI smoke job references this exact path** (`fixtures/package.xml`, `fixtures/force-app`).

- [ ] **Step 1: Move files**

```bash
git mv .github/actions/sf-find-tests/src packages/github-actions/src/sf-find-tests
git mv .github/actions/sf-find-tests/__tests__ packages/github-actions/__tests__/sf-find-tests
git mv .github/actions/sf-find-tests/__integration__/sf-find-tests.integration.test.ts packages/github-actions/__integration__/sf-find-tests.integration.test.ts
git mv .github/actions/sf-find-tests/__integration__/fixtures packages/github-actions/__integration__/fixtures
git rm .github/actions/sf-find-tests/package.json .github/actions/sf-find-tests/tsconfig.json .github/actions/sf-find-tests/jest.config.js
```

- [ ] **Step 2: Fix imports**

- `__tests__/sf-find-tests/*.test.ts`: `'../src/X'` → `'../../src/sf-find-tests/X'`
- `__integration__/sf-find-tests.integration.test.ts`:
  - `from '../src/index'` → `from '../src/sf-find-tests/index'`
  - `const fixtures = join(__dirname, 'fixtures');` — **unchanged** (fixtures moved with the test, same relative position).
  - Bundle assertion → `join(__dirname, '..', '..', '..', '.github', 'actions', 'sf-find-tests', 'dist', 'index.js')`

- [ ] **Step 3: Final bundle chain + workspaces**

`packages/github-actions/package.json`:

```json
"bundle": "npm run bundle:sync-branches && npm run bundle:create-release-pr && npm run bundle:sf-find-tests",
"bundle:sync-branches": "ncc build src/sync-branches/index.ts -o ../../.github/actions/sync-branches/dist",
"bundle:create-release-pr": "ncc build src/create-release-pr/index.ts -o ../../.github/actions/create-release-pr/dist",
"bundle:sf-find-tests": "ncc build src/sf-find-tests/index.ts -o ../../.github/actions/sf-find-tests/dist"
```

Root workspaces (final form):

```json
"workspaces": [
  "packages/core",
  "packages/github-actions-runtime",
  "packages/github-actions"
],
```

- [ ] **Step 4: Install, test, rebundle, verify, commit**

```bash
npm install
npm run test -w @gforce/github-actions
npm run bundle -w @gforce/github-actions
npm run format
git add -A
npm run all
git commit -m "Refactor: move sf-find-tests adapter, tests, and fixtures into packages/github-actions"
```

Expected: all three actions' tests pass under one package; `.github/actions/sync-branches|create-release-pr|sf-find-tests/` each contain exactly `action.yml` + `dist/`.

---

### Task 4: Rewire root scripts, tsconfig, and lint-staged

**Files:**
- Modify: `package.json` (root — `dist:verify`)
- Modify: `tsconfig.json` (root — `include`)
- Modify: `lint-staged.config.mjs`

**Interfaces:**
- Consumes: final layout from Tasks 1–3 (no adapter source under `.github/actions/`).
- Produces: `dist:verify` that covers every bundled action (Task 5's CI relies on it); a lint-staged trigger that re-bundles when *any* package source changes.

- [ ] **Step 1: Glob dist:verify**

Root `package.json`:

```json
"dist:verify": "git diff --exit-code -- '.github/actions/*/dist'",
```

(Quoted git pathspec — matches every action that has a committed dist, today and in the future; composites without dist are simply not matched. This closes the gap where sf-find-tests' bundle was never verified.)

- [ ] **Step 2: Root tsconfig include**

`tsconfig.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["packages/*/src"]
}
```

- [ ] **Step 3: lint-staged trigger**

`lint-staged.config.mjs`:

```js
/**
 * lint-staged configuration.
 *
 * - Format and lint staged code.
 * - When any package source changes (core, runtime, or an action adapter),
 *   rebuild every action bundle and re-stage the `dist` output so the committed
 *   bundle is always in sync with the source.
 */
export default {
  '*.{ts,mjs,cjs,js}': ['prettier --write'],
  '*.ts': ['eslint --fix'],
  'packages/*/src/**/*.ts': () => [
    'npm run bundle:all',
    // `:(glob)` magic pathspec so `*` matches the action dir (a plain pathspec
    // with `*` does not match across `/` in git add).
    'git add :(glob).github/actions/*/dist/**',
  ],
};
```

Note: this also fixes a latent gap — previously a `packages/core` change did **not** trigger a re-bundle at commit time.

- [ ] **Step 4: Verify a stale bundle is actually caught**

```bash
echo '// stale' >> .github/actions/sf-find-tests/dist/index.js
npm run dist:verify; echo "exit=$?"
git checkout -- .github/actions/sf-find-tests/dist/index.js
npm run dist:verify; echo "exit=$?"
```

Expected: first run exit=1 (sf-find-tests dist now guarded — this is the bug being fixed), second run exit=0.

- [ ] **Step 5: Full verify + commit**

```bash
npm run all
git add -A
git commit -m "Update: glob dist:verify over all bundled actions; re-bundle on any package change"
```

---

### Task 5: CI — coverage paths + smoke job

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: fixtures at `packages/github-actions/__integration__/fixtures/` (Task 3); committed dists (Tasks 1–3); the actions' declared inputs/outputs (`action.yml` — unchanged).
- Produces: a `smoke` job future workflow edits must keep passing.

- [ ] **Step 1: Update the coverage artifact path in the quality job**

In the `Upload coverage` step, the `path` becomes just:

```yaml
          path: packages/*/coverage
```

(`.github/actions/*/coverage` no longer exists.)

- [ ] **Step 2: Add the smoke job**

Append to `jobs:` in `.github/workflows/ci.yml`. Design notes baked in:
- `sf-find-tests` is filesystem-only → smokes on every event.
- `sync-branches` / `create-release-pr` validate `source != target`, so main→main is rejected by design; they smoke **only on `pull_request`**, dry-run, against the PR's own head/base refs — read-only GitHub API calls with the default token.
- Output assertions go through `env:` (never interpolate `${{ }}` directly into `run:` bodies — script-injection hardening, same as the rest of this repo).

```yaml
  # Execute every TypeScript action from its committed dist on a real runner:
  # proves action.yml wiring, bundle integrity, and output names — the things
  # unit tests can't see.
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0

      - name: Smoke sf-find-tests (offline, committed fixtures)
        id: find-tests
        uses: ./.github/actions/sf-find-tests
        with:
          package-xml: packages/github-actions/__integration__/fixtures/package.xml
          source-dir: packages/github-actions/__integration__/fixtures/force-app

      - name: Assert sf-find-tests outputs
        env:
          HAS_APEX: ${{ steps.find-tests.outputs.has-apex }}
          TEST_COUNT: ${{ steps.find-tests.outputs.test-count }}
          TESTS: ${{ steps.find-tests.outputs.tests }}
        run: |
          test "$HAS_APEX" = "true"
          test "$TEST_COUNT" = "2"
          test "$TESTS" = "InvoiceServiceTest InvoicesSelectorTest"

      # source==target is rejected by input validation, so these two smoke over
      # the PR's own refs and therefore only run on pull_request events.
      - name: Smoke sync-branches (dry-run over the PR refs)
        if: github.event_name == 'pull_request'
        id: sync
        uses: ./.github/actions/sync-branches
        with:
          source-branch: ${{ github.head_ref }}
          target-branch: ${{ github.base_ref }}
          dry-run: true
          github-token: ${{ github.token }}

      - name: Assert sync-branches outputs
        if: github.event_name == 'pull_request'
        env:
          SYNC_DRY_RUN: ${{ steps.sync.outputs.dry-run }}
          SYNC_ACTION: ${{ steps.sync.outputs.action }}
          SYNC_SYNCED: ${{ steps.sync.outputs.synced }}
        run: |
          test "$SYNC_DRY_RUN" = "true"
          test -n "$SYNC_ACTION"
          test "$SYNC_SYNCED" = "false"

      - name: Smoke create-release-pr (dry-run over the PR refs)
        if: github.event_name == 'pull_request'
        id: release-pr
        uses: ./.github/actions/create-release-pr
        with:
          source-branch: ${{ github.head_ref }}
          target-branch: ${{ github.base_ref }}
          release-version: v0.0.0-smoke
          dry-run: true
          github-token: ${{ github.token }}

      - name: Assert create-release-pr outputs
        if: github.event_name == 'pull_request'
        env:
          PR_DRY_RUN: ${{ steps.release-pr.outputs.dry-run }}
          PR_CREATED: ${{ steps.release-pr.outputs.created }}
          PR_UPDATED: ${{ steps.release-pr.outputs.updated }}
        run: |
          test "$PR_DRY_RUN" = "true"
          test "$PR_CREATED" = "false"
          test "$PR_UPDATED" = "false"
```

- [ ] **Step 3: Lint the workflow locally (best effort) and commit**

If Docker is available: `docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.12 -color`. Otherwise rely on CI's actionlint step — it runs on the PR.

```bash
npm run format:check
git add .github/workflows/ci.yml
git commit -m "Update: CI verifies all committed bundles and smoke-runs each TS action"
```

Note: the smoke `sync-branches` dry-run compares the PR branch against main via the GitHub API. With `dry-run: true` neither action mutates anything (`synced=false`, `created=false`, `updated=false` are the asserted proofs).

---

### Task 6: Update documentation

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/typescript-action-authoring.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Check (modify only if stale refs found): `CONTRIBUTING.md`, `GETTING_STARTED.md`, `examples/README.md`

**Interfaces:**
- Consumes: the final layout (Tasks 1–5).
- Produces: docs a newcomer (or AI agent) can follow to add action #4 without touching `.github/actions/<name>` beyond `action.yml`.

- [ ] **Step 1: architecture.md — layout diagram and adapter/bundle sections**

Replace the layout block near the top with:

```
packages/core                      # portable business logic + GitHub service (no @actions/*)
packages/github-actions-runtime    # @actions/core adapter: logger, repo-from-env, runGitHubAction
packages/github-actions            # ALL thin action adapters + their tests (one folder per action)
.github/actions/<name>             # action.yml + committed dist/index.js ONLY (built from packages/)
```

In "The adapter template" section, change the file-tree paths from `src/…` (inside the action folder) to `packages/github-actions/src/<name>/…`, and state explicitly: *the runner folder `.github/actions/<name>` contains only `action.yml` and the committed `dist/index.js`; ncc bundles out of `packages/github-actions`*. In "Build, bundle, and the committed dist", update the bundle-script location (`@gforce/github-actions` owns `bundle:<name>` scripts targeting `../../.github/actions/<name>/dist`) and note `dist:verify` is now a glob over `.github/actions/*/dist`.

- [ ] **Step 2: typescript-action-authoring.md — steps 2–5 and the skeleton**

Rewrite step 2 as (replacing the per-action scaffold):

```markdown
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
```

Rewrite step 3 (workspace registration) to: *No workspace registration needed — `packages/github-actions` is already a workspace; new actions are folders inside it.* Rewrite step 4's paths to `packages/github-actions/__tests__/<name>/` and `packages/github-actions/__integration__/<name>.integration.test.ts`. In step 5 and "Local commands", replace `-w @gforce/<name>` with `-w @gforce/github-actions` (e.g. `npm run bundle -w @gforce/github-actions`). Update the "Action skeleton" tree path from `.github/actions/<name>/src/` to `packages/github-actions/src/<name>/`.

- [ ] **Step 3: README.md and CLAUDE.md**

README repo-layout block (~lines 126–131): change the per-action line to the same four-line layout as architecture.md above. CLAUDE.md "TypeScript Actions" table: update the `.github/actions/<name>` row to "thin manifest: `action.yml` + committed `dist/index.js`" and add a `packages/github-actions` row: "All action adapters (`src/<name>/index.ts`, `inputReader.ts`, `outputWriter.ts`) + their unit/integration tests."

- [ ] **Step 4: Sweep for stale references**

```bash
grep -rn "\.github/actions/[a-z-]*/src\|@gforce/sync-branches\|@gforce/create-release-pr\|@gforce/sf-find-tests" \
  README.md CLAUDE.md CONTRIBUTING.md GETTING_STARTED.md docs examples --include='*.md'
```

Fix every hit (excluding the spec/plan documents under `docs/superpowers/`, which describe the migration itself).

- [ ] **Step 5: Verify + commit**

```bash
npm run format:check
git add -A
git commit -m "Docs: describe the packages/github-actions adapter layout"
```

---

### Task 7: Final verification and PR

**Files:** none (verification + git only)

**Interfaces:**
- Consumes: everything above.
- Produces: an open PR from `refactor/actions-package-consolidation` into `main` for the user's review.

- [ ] **Step 1: Full local gate**

```bash
npm run all
ls .github/actions/sync-branches .github/actions/create-release-pr .github/actions/sf-find-tests
```

Expected: `npm run all` fully green; each `ls` shows exactly `action.yml` and `dist`.

- [ ] **Step 2: Push (pre-push hook runs `npm run all` again)**

```bash
git push -u origin refactor/actions-package-consolidation
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create \
  --base main \
  --title "Refactor: consolidate TS action adapters into packages/github-actions + CI smoke job" \
  --body "$(cat <<'EOF'
## Summary
- All three TypeScript action adapters (src + tests) now live in one workspace `packages/github-actions`; `.github/actions/<name>` holds only `action.yml` + the committed `dist/` bundle
- `dist:verify` is a glob over `.github/actions/*/dist` — closes the gap where sf-find-tests' bundle was never verified
- lint-staged re-bundles on ANY package source change (previously a core change didn't trigger a re-bundle)
- New CI `smoke` job executes each action from its committed dist: sf-find-tests offline on fixtures; sync-branches + create-release-pr dry-run over the PR's own refs (read-only)
- Docs updated (architecture, authoring guide, README, CLAUDE.md)

No behavior change for consumers: `uses:` refs, inputs, and outputs are untouched.

Design spec: docs/superpowers/specs/2026-07-13-actions-package-consolidation-design.md

## Test plan
- [ ] CI quality job green (format, lint, typecheck, bundle, tests ≥90% coverage, dist:verify, actionlint)
- [ ] CI smoke job green — all three actions execute from committed dist and outputs assert
- [ ] Verify `.github/actions/<ts-action>/` trees contain only action.yml + dist/

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Watch CI on the PR**

```bash
gh pr checks --watch
```

Expected: `quality` and `smoke` both pass. If smoke fails, read the job log (`gh run view --log-failed`), fix, push again — do not merge; the PR is for the user's review.
