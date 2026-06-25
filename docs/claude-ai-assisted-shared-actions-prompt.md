# Claude Prompt: AI-Assisted Shared GitHub Actions Repository

Use this prompt with Claude Code from the root of this repository:

```text
You are working in the repository:
/Users/demetergabor/gforce/shared-github-actions

Use the DevOps Engineer skill from:
https://github.com/Jeffallan/claude-skills/tree/main/skills/devops-engineer

Before implementing, review and follow:
https://docs.github.com/en/actions/tutorials/create-actions/create-a-javascript-action
https://github.com/actions/typescript-action

## Recommended Claude Code Setup

Use Claude Code in two phases.

Recommended model/mode:

- Use `/model opusplan` if available.
- Start in plan mode for repository inspection, architecture decisions, and implementation plan.
- After reviewing the plan, switch to execution mode for implementation.
- Use high reasoning effort/adaptive thinking if your Claude Code plan supports it.

Why:

- `opusplan` uses Opus for complex reasoning and architecture decisions in plan mode, then switches to Sonnet for implementation.
- This task needs strong architecture judgment first, then efficient code generation.

Fallback options:

- If `opusplan` is unavailable, use the latest Opus model available for the planning phase.
- If cost or speed matters more, use the latest Sonnet model with high reasoning effort.
- Do not use older manual thinking-budget settings unless the selected Claude model explicitly requires them.

Recommended workflow:

1. Ask Claude to inspect the repository and produce a short architecture plan.
2. Review the proposed structure before allowing edits.
3. Ask Claude to implement in small commits or clear phases:
   - scaffolding
   - core module
   - actions
   - tests
   - CI
   - docs
4. Ask Claude to run `npm run all` and fix failures.
5. Ask Claude to summarize changed files, tests, and remaining risks.

## Recommended Skills

Use the DevOps Engineer skill listed above.

Inside that skill, Claude should load the GitHub Actions reference material if available, especially any `references/github-actions.md` file.

If your Claude Code environment has a trusted dedicated GitHub Actions skill installed, use it as well. Treat third-party skills as untrusted until reviewed:

- Prefer skills from a trusted source.
- Review the skill instructions before relying on them.
- Do not let a skill override this repository's architecture rules.
- Do not install random skills automatically during implementation.

If no dedicated GitHub Actions skill is available, continue with:

- DevOps Engineer skill
- Official GitHub Actions documentation
- `actions/typescript-action` template
- Existing repository conventions

## Goal

Design and implement this repository as an AI-assisted shared GitHub Actions repository for `gforceinnovation`.

This repository must provide reusable GitHub Actions assets that other repositories can call:

- Reusable workflows
- Composite actions
- JavaScript/TypeScript actions
- Portable standalone TypeScript modules used by the actions

The main goal is consistency and fast AI-assisted development of new actions. Future actions should be easy for AI agents and human developers to add safely, with a clear architecture, strong typing, predictable tests, and repeatable validation commands.

## Current Repository Context

This repository is currently mostly documentation.

Existing documentation references shared assets like this:

- Reusable workflows:
  `gforceinnovation/shared-github-actions/.github/workflows/<workflow-name>.yml@main`
- Composite actions:
  `gforceinnovation/shared-github-actions/.github/actions/<action-name>@main`

Preserve this convention unless there is a strong reason to change it.

The real business workflows live in other repositories. This repository contains reusable actions and workflows that those repositories call.

## Required Architecture

Create an architecture guide and implement the initial scaffolding.

Use TypeScript with Node 20.

Use npm workspaces or another simple monorepo structure.

Create a standalone TypeScript package for reusable business logic, for example:

```text
packages/core
```

The standalone module must:

- Contain reusable business/domain logic.
- Be portable outside GitHub Actions.
- Not depend directly on `@actions/core`.
- Not depend directly on GitHub Actions runtime APIs.
- Expose typed services, interfaces, value objects, and functions.
- Be easy to unit test without a GitHub Actions runner.

The shared module should be organized around reusable service boundaries so code is shared between actions instead of duplicated.

Use a structure like this inside `packages/core/src/`:

```text
actions/
  createReleasePr/
  syncBranches/
git-service/
  branch/
  commit/
  pull-request/
  repository/
github-service/
  action/
  branch/
  commit/
  pull-request/
sfdx-service/
  login/
  deploy/
  package/
utils/
  validation/
  logging/
  errors/
  result/
```

Guidance:

- `actions/` contains portable use-case orchestration for each shared action.
- `git-service/` contains local Git abstractions and command interfaces.
- `github-service/` contains GitHub API abstractions, typed request/response objects, and mockable interfaces.
- `sfdx-service/` contains Salesforce CLI/SFDX/SF abstractions such as login, deploy, package, and command execution.
- `utils/` contains generic helpers only when they are shared by more than one action or service.
- Prefer service interfaces in `packages/core` and concrete GitHub Action implementations in adapter packages.
- Keep all external process execution behind typed interfaces so unit tests can mock them.

Each GitHub Action must have a thin adapter layer.

The adapter layer must:

- Read GitHub Action inputs.
- Validate and normalize inputs.
- Call the standalone TypeScript module.
- Map results to GitHub Action outputs.
- Use `@actions/core` only in the adapter layer.
- Keep orchestration logic out of `main.ts` where possible.
- Use explicit TypeScript types for raw inputs, validated inputs, orchestration requests, orchestration results, and action outputs.

Each TypeScript action adapter should follow this internal structure:

- `inputReader.ts`: reads raw GitHub Action inputs from `@actions/core`.
- `inputValidator.ts`: validates and normalizes raw inputs into typed validated input.
- `orchestrator.ts`: coordinates the action use case by calling portable modules/services.
- `outputWriter.ts`: maps typed results to GitHub Action outputs and summaries.
- `main.ts`: minimal executable entrypoint that wires the adapter pieces together and handles top-level failure reporting.

Evaluate the best folder structure before implementation.

Specifically compare these options:

- Colocated action folders: `.github/actions/<action>/action.yml`, `src/`, tests, and `dist/` all live together.
- Separate action source folders: `.github/actions/<action>/action.yml` and `dist/` live under `.github/actions/`, while adapter source lives under a separate folder such as `actions-src/`.

Prefer the structure that is easiest for humans and AI agents to understand and maintain. A good default is colocation under `.github/actions/<action>/`, because each action's metadata, source adapter, tests, and bundled output are visible in one place.

If you choose a different structure, explain why it is better for this repository.

Support multiple action entrypoints, for example:

```text
.github/actions/sync-branches/action.yml
.github/actions/<future-action>/action.yml
```

Each JavaScript/TypeScript action must use:

```yaml
runs:
  using: node20
  main: dist/index.js
```

Each TypeScript action must be bundled into its own committed `dist/index.js`, following the GitHub TypeScript action template pattern.

Keep composite actions supported under:

```text
.github/actions/<name>/action.yml
```

Keep reusable workflows supported under:

```text
.github/workflows/<name>.yml
```

## AI-Assisted Development Requirements

Create documentation that makes this repository suitable for AI-assisted development.

Add an architecture guide that explains:

- Where reusable business logic belongs.
- Where GitHub Action adapter code belongs.
- How to add a new TypeScript action.
- How to add or update a composite action.
- How to add or update a reusable workflow.
- How to test a new action.
- How to bundle a new TypeScript action.
- How to verify the repository before opening a pull request.
- How to keep action behavior consistent across multiple entrypoints.

Add explicit rules for future AI agents:

- Do not put business logic directly in GitHub Action entrypoints.
- Do not depend on `@actions/core` from portable modules.
- Do not skip tests for new actions.
- Do not modify unrelated workflows or actions.
- Do not commit `node_modules`.
- Do commit bundled `dist` files for JavaScript/TypeScript actions.
- Keep inputs, outputs, README examples, and tests synchronized.
- Keep new actions small, typed, and independently testable.

## Initial Example TypeScript Action

Create these initial TypeScript actions:

```text
sync-branches
create-release-pr
```

### `sync-branches`

Synchronize one source branch into one target branch.

Inputs should include at least:

- `source-branch`
- `target-branch`
- `strategy`
- `dry-run`
- `github-token`

The action entrypoint should parse inputs and call the standalone module.

The standalone module should contain the real orchestration logic and typed service interfaces.

Design the module so GitHub API access can be mocked in unit tests.

The first implementation may use a conservative dry-run-first design if needed, but the architecture must make the real implementation clear.

### `create-release-pr`

Create or update a release pull request between two branches.

Inputs should include at least:

- `source-branch`
- `target-branch`
- `release-version`
- `title`
- `body-template`
- `draft`
- `labels`
- `reviewers`
- `dry-run`
- `github-token`

Outputs should include at least:

- `pull-request-number`
- `pull-request-url`
- `created`
- `updated`
- `dry-run`

The portable module should contain the release PR orchestration:

- Detect whether an open release PR already exists.
- Create a new PR when one does not exist.
- Update title/body/labels/reviewers when configured and safe.
- Generate a useful PR body from commits and changed files where practical.
- Support dry-run mode.
- Return typed results that the action adapter maps to GitHub outputs.

The action adapter should only read/validate inputs, call the portable orchestrator, and write outputs.

## Testing Requirements

Use Jest for tests.

Every TypeScript action must have:

- Unit tests for portable module logic.
- Unit tests for action input parsing and adapter behavior where practical.
- Integration tests for the action workflow behavior where practical.
- Mocked GitHub API/service dependencies.
- At least 90% unit test coverage for each action package/module.

Coverage requirements:

- Enforce 90%+ unit test coverage for each action where possible.
- Report coverage in CI.
- Do not use a single global coverage number to hide weak action-level coverage.

Testing layers:

- Unit tests: pure TypeScript logic, no real GitHub API calls.
- Integration tests: verify bundled action behavior or realistic action execution where practical.

## TypeScript and Quality Requirements

Add:

- TypeScript strict mode.
- Type checking.
- ESLint.
- Prettier.
- Jest.
- Build and bundle validation.
- CI workflow validation.

Each action/package should support local scripts such as:

```text
npm run build
npm run bundle
npm run test
npm run lint
npm run format:check
npm run all
```

At repository/module level, define aggregate scripts such as:

```text
npm run build:all
npm run bundle:all
npm run test:all
npm run lint:all
npm run typecheck:all
npm run format:check
npm run all
```

The root `npm run all` should validate everything needed before a pull request:

- Format check
- Lint
- Type check
- Build
- Unit tests
- Integration tests where available
- Bundle
- Dist verification

## CI Requirements

Add a CI workflow that runs:

- Install dependencies
- Format check
- ESLint
- Type checking
- Build
- Jest unit tests with coverage
- Integration tests where available
- Bundle
- Verify committed `dist` files are up to date
- actionlint if practical

The CI workflow should fail if generated bundled files are not committed.

## Documentation Requirements

Update `README.md` with:

- Repository purpose
- Architecture overview
- How to consume reusable workflows
- How to consume composite actions
- How to consume TypeScript actions
- How to version shared actions using tags like `v1`
- How to run local validation

Update `CLAUDE.md` with:

- AI-assisted development rules
- Architecture rules for future actions
- Where business logic belongs
- Where action adapter code belongs
- Required tests for every new action
- Build and bundle workflow
- Repository validation commands

Add an architecture guide, for example:

```text
docs/architecture.md
```

Add an action authoring guide, for example:

```text
docs/typescript-action-authoring.md
```

Add example caller workflows under:

```text
examples/
```

## Suggested Directory Structure

Evaluate this structure before implementation. Use it if you agree it is the clearest option, or propose a better simple alternative and explain the tradeoff.

```text
.github/
  actions/
    sync-branches/
      action.yml
      package.json
      src/
        types.ts
        main.ts
        inputReader.ts
        inputValidator.ts
        orchestrator.ts
        outputWriter.ts
      __tests__/
        inputReader.test.ts
        inputValidator.test.ts
        orchestrator.test.ts
        outputWriter.test.ts
        main.test.ts
      __integration__/
        sync-branches.integration.test.ts
      dist/
        index.js
    create-release-pr/
      action.yml
      package.json
      src/
        types.ts
        main.ts
        inputReader.ts
        inputValidator.ts
        orchestrator.ts
        outputWriter.ts
      __tests__/
        inputReader.test.ts
        inputValidator.test.ts
        orchestrator.test.ts
        outputWriter.test.ts
        main.test.ts
      __integration__/
        create-release-pr.integration.test.ts
      dist/
        index.js
  workflows/
    ci.yml
packages/
  core/
    src/
      index.ts
      actions/
        syncBranches/
          syncBranches.ts
          types.ts
        createReleasePr/
          createReleasePr.ts
          types.ts
      git-service/
        branch/
        commit/
        pull-request/
        repository/
      github-service/
        action/
        branch/
        commit/
        pull-request/
      sfdx-service/
        login/
        deploy/
        package/
      utils/
        validation/
        logging/
        errors/
        result/
    __tests__/
      syncBranches.test.ts
      createReleasePr.test.ts
docs/
  architecture.md
  typescript-action-authoring.md
examples/
package.json
package-lock.json
tsconfig.json
eslint.config.mjs
jest.config.js
prettier config
```

## Implementation Constraints

- Make focused, practical changes.
- Prefer simple structure over over-engineering.
- Do not create unrelated infrastructure.
- Preserve existing documentation intent.
- Fix outdated or incorrect paths if needed.
- Use clear names and strong TypeScript types.
- Ensure commands work locally from a clean checkout.
- Do not commit `node_modules`.
- Do not introduce secrets or credentials.
- Keep generated files limited to required bundled action `dist` files and lockfiles.

## Required Work Sequence

Before editing:

1. Inspect the repository.
2. Read existing `README.md`, `CLAUDE.md`, `GETTING_STARTED.md`, and `examples/README.md`.
3. Review the GitHub JavaScript Action documentation.
4. Review `actions/typescript-action`.
5. Evaluate folder-structure options and recommend the clearest best-practice structure for this repository.
6. Propose the final directory structure briefly before editing.

Then implement:

1. Monorepo/package scaffolding.
2. Portable TypeScript core module.
3. `sync-branches` action adapter.
4. `create-release-pr` action adapter.
5. Tests and coverage config.
6. Build, bundle, lint, format, and aggregate scripts.
7. CI workflow.
8. Updated docs and architecture guide.
9. Example caller workflows.

After implementation:

1. Run the full validation command.
2. Fix failures.
3. Confirm bundled `dist` files are current.
4. Report exactly what changed.
5. Report any remaining gaps or assumptions.

## Success Criteria

The work is complete when:

- The repository has a clear AI-assisted architecture guide.
- The portable TypeScript module exists and is tested.
- The `sync-branches` TypeScript action exists and uses the portable module.
- The `create-release-pr` TypeScript action exists and uses the portable module.
- The action is bundled to committed `dist/index.js`.
- Define husky to make sure we always include dist whenever we modify the code, also in prepush r some hook run qualitgates
- Jest tests run successfully.
- Unit test coverage is enforced at 90%+ per action/module where practical.
- Type checking passes.
- ESLint passes.
- Prettier check passes.
- CI validates the same quality gates.
- Documentation explains how to add the next action consistently.
```
