# Claude Prompt: Second-Pass Review and Improvement

Use this prompt with Claude Code from the root of this repository:

```text
Review the current implementation as a senior DevOps engineer and TypeScript architect.

Claude already created a good first implementation. Your job is not to restart or redesign everything. Your job is to review it critically, improve weak areas, and make the repository easier to maintain as an AI-assisted shared GitHub Actions platform.

## Main Goal

Improve the current implementation while preserving the architecture intent:

- `.github/actions/<action>/` contains thin GitHub Action adapters.
- Portable business logic lives in shared modules.
- Reusable Git/GitHub/SFDX services are shared instead of duplicated.
- Actions are strongly typed, tested, bundled, and easy for future AI agents to extend.

## Review Priorities

Review these areas first:

1. Architecture boundaries
   - Confirm action adapters are minimal.
   - Confirm portable logic is not mixed with `@actions/core`.
   - Confirm shared services are reusable across actions.
   - Confirm future actions can follow the same pattern without copying logic.

2. GitHub service instance pattern
   - Confirm there is a clear `getInstance` style method that returns the same cached service.
   - Confirm there is a clear `newInstance` method for a fresh service.
   - Confirm token mismatch behavior is explicit and tested.
   - Avoid ambiguous naming such as `factory` when the behavior is singleton/provider based.

3. Folder structure
   - Evaluate whether the current folder structure is easy to understand.
   - Prefer colocated action folders only if they remain thin.
   - Confirm shared module structure is logical:
     - actions/use cases
     - github-service
     - git-service
     - sfdx-service
     - utils
   - Suggest small improvements only where they reduce confusion.

4. TypeScript quality
   - Ensure strict typing is preserved.
   - Avoid `any`.
   - Avoid weak stringly typed internal contracts when a union/type/interface is better.
   - Check public exports from shared modules are intentional and clean.

5. Tests and coverage
   - Confirm every action has meaningful unit tests.
   - Confirm portable modules have unit tests.
   - Confirm integration tests are useful and not just coverage padding.
   - Keep 90%+ coverage.
   - Add tests for real edge cases, especially validation and error behavior.

6. GitHub Actions correctness
   - Review `action.yml` inputs/outputs.
   - Verify defaults are safe, especially `dry-run`.
   - Verify permissions required by each action are documented.
   - Verify bundled `dist/index.js` files are current.
   - Verify reusable workflows and CI are valid.
   - Run actionlint if available.

7. Security and operational safety
   - Do not log tokens or secrets.
   - Ensure dry-run mode does not mutate state.
   - Ensure branch/PR operations have clear failure behavior.
   - Make destructive behavior opt-in and documented.

8. Documentation
   - Update README, CLAUDE.md, and docs only where they are inaccurate or incomplete.
   - Document how to add the next action.
   - Document required commands before PR.
   - Keep docs practical, not verbose.

## Improvement Rules

- Do not rewrite working code just to change style.
- Do not introduce large abstractions unless they remove real duplication.
- Do not move code out of action adapters unless it improves portability or reuse.
- Keep changes focused and reviewable.
- Preserve existing tests unless they are wrong.
- Do not lower coverage thresholds.
- Do not remove bundled `dist` files.
- Do not commit `node_modules`.

## Expected Workflow

1. Inspect the repository.
2. Run the validation command:

```bash
npm run all
```

3. If validation fails, fix failures first.
4. Review architecture and list concrete findings.
5. Implement small, high-value improvements.
6. Update or add tests for changed behavior.
7. Rebuild bundles.
8. Run:

```bash
npm run all
```

9. Report:
   - what changed
   - why it changed
   - tests run
   - any remaining risks or future improvements

## Specific Things to Check

Check whether these are already handled. If not, fix them:

- GitHub service provider has clear singleton and fresh-instance APIs.
- Token mismatch behavior is explicit and tested.
- Repo parsing from `owner/repo` is pure and tested.
- `@actions/core` appears only in GitHub Action adapter/runtime code, not portable business logic.
- Action `main.ts` files are very small.
- Input validation is reusable where practical.
- Output mapping is explicit and tested.
- `@octokit/rest` is only a dependency where directly needed.
- CI fails on actionlint problems unless there is a documented reason.
- Formatting, linting, typecheck, tests, bundle, and dist verification pass.

## Success Criteria

The work is complete when:

- The existing implementation is improved without unnecessary redesign.
- `npm run all` passes.
- Tests still enforce 90%+ coverage.
- Action adapters remain thin.
- Shared modules are portable and reusable.
- Documentation matches the final architecture.
```
