# Contributing to Shared GitHub Actions

Thank you for your interest in contributing! This document provides guidelines for contributing to this repository.

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and beginners
- Focus on what is best for the community
- Show empathy towards other community members

## How to Contribute

### Reporting Issues

If you find a bug or have a suggestion:

1. Check if the issue already exists
2. Create a new issue with a clear title and description
3. Include relevant details:
   - What you expected to happen
   - What actually happened
   - Steps to reproduce
   - Your environment (OS, GitHub Enterprise version, etc.)

### Suggesting New Features

Feature suggestions are welcome! Please:

1. Check if the feature has already been suggested
2. Open an issue with the "enhancement" label
3. Describe the use case and benefits
4. Provide examples if possible

### Contributing Code

#### Workflow for Changes

1. **Fork the repository** (for external contributors)
2. **Create a feature branch off `main`** — `main` is the only long-lived branch; there
   is no `develop`
   ```bash
   git checkout main && git pull
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Test your changes** — `npm run all` must pass (see Testing Guidelines)
5. **Commit with clear messages**
   ```bash
   git commit -m "Add: Description of your changes"
   ```
6. **Push to your branch**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request against `main`**

#### Commit Message Guidelines

Use conventional commits format:

- `Add: ` - New features
- `Fix: ` - Bug fixes
- `Update: ` - Updates to existing features
- `Docs: ` - Documentation changes
- `Test: ` - Test additions or changes
- `Refactor: ` - Code refactoring

Examples:
- `Add: Support for custom output file names`
- `Fix: Incorrect violation count in quality gate`
- `Docs: Update usage examples for v2.0`

### Adding New Reusable Workflows

When adding a new reusable workflow:

1. **Create the workflow file** in `.github/workflows/`
   - Name it `reusable-<domain>-<name>.yml` — the `reusable-` prefix is what marks a
     `workflow_call` workflow as callable from other repositories. Unprefixed names are
     reserved for this repo's own CI. See
     [ADR 0002](docs/adr/0002-naming-and-repo-structure.md), decision 2.
   - Include the `workflow_call` trigger
   - Define typed inputs and outputs, and declare `secrets:` explicitly
   - Self-references to this repo's actions must be **absolute** and pinned to the
     current major tag — never `./`, never a branch

2. **Document the workflow**
   - Add it to `README.md` (the summary a consumer reads) **and** `CLAUDE.md` (the
     detailed input/output/permission contract). Both enumerate every workflow; a
     new one missing from either is a documentation bug.
   - Add a runnable caller to `examples/`, named after the workflow
   - Record the *why* in `docs/adr/` if the change involves a design trade-off

3. **Test the workflow**
   - Run `npm run all` locally and make sure it passes
   - Verify all scenarios work correctly, including failure paths
   - Test with different input combinations

4. **Check the consumer catalog**
   - `docs/usage-catalog.md` lists every known consumer. Read it before changing an
     existing input, output, filename, or default — see the top of `CLAUDE.md`.

### Code Style Guidelines

#### YAML Workflows

- Use 2 spaces for indentation
- Use meaningful job and step names
- Add comments for complex logic
- Group related inputs together
- Provide sensible defaults for optional inputs

Example:
```yaml
name: Descriptive Workflow Name

on:
  workflow_call:
    inputs:
      # Core configuration
      workspace:
        description: 'Workspace path to analyze'
        required: false
        default: '.'
        type: string
      
      # Quality gates
      fail-on-errors:
        description: 'Fail on errors'
        required: false
        default: true
        type: boolean
```

#### Documentation

- Use clear, concise language
- Include code examples
- Add table of contents for long documents
- Use proper Markdown formatting
- Include links to related resources

### Testing Guidelines

Before submitting a PR:

1. **Run `npm run all`** — format check, lint, typecheck, bundle, tests at the 95%
   coverage gate, and `dist:verify`. CI runs the same thing and fails on a stale
   committed `dist/`. This is not optional.
2. **Verify all input combinations** work as expected
3. **Check error handling** — test failure scenarios
4. **Validate outputs** are correctly exposed
5. **Test with different permissions** to ensure they're correctly documented

**What CI does and does not cover.** `ci.yml`'s `smoke` job drives the TypeScript
actions with `./` refs, so those are exercised at your PR head.
`ci-sf-ops-dispatch-smoke.yml` exercises the dispatcher at your PR head but resolves
the *actions* it calls from the released `@v2` tag. So a change to a composite
Salesforce action (`sf-org-login`, `sf-package-*`, `sf-org-scratch-create`,
`sf-ops-callback`) is **not** covered by CI. Verify one of those from a scratch caller
workflow with an explicit `@<your-branch>` ref before merging.

### Pull Request Process

1. **Update documentation** - Ensure README and other docs reflect your changes
2. **Ensure CI passes** - All automated checks must pass
3. **Request review** - Tag relevant maintainers
4. **Address feedback** - Respond to comments and update as needed
5. **Squash commits** - Maintain a clean history (if requested)

### Review Process

PRs will be reviewed for:

- **Functionality** - Does it work as intended?
- **Documentation** - Is it well documented?
- **Testing** - Has it been tested thoroughly?
- **Code quality** - Is it maintainable?
- **Breaking changes** - Are they necessary and documented?

## Development Setup

### Prerequisites

- Git
- **Node 20+** — this is an npm-workspaces monorepo; the TypeScript actions are built here
- `gh` and `jq` if you need to regenerate the consumer catalog
- Access to a test GitHub repository

### Local Development

1. Clone the repository and install workspaces:
   ```bash
   git clone https://github.com/Gforce-Innovation-Kft/shared-github-actions.git
   cd shared-github-actions
   npm ci
   ```

2. Branch off `main` — it is the only long-lived branch:
   ```bash
   git checkout -b test/my-changes
   ```

3. Make your changes, then:
   ```bash
   npm run all          # format:check + lint + typecheck + bundle + test + dist:verify
   ```
   A pre-commit hook rebuilds and re-stages the action bundles. Useful subsets:
   `npm run test:all`, `npm run bundle:all`, `npm run typecheck:all`.

4. Test in a separate repository by referencing your branch:
   ```yaml
   uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-sf-pr-validate.yml@test/my-changes
   ```
   A branch ref is the only way to exercise a changed **composite** action end to end —
   see the coverage note under Testing Guidelines.

## Release Process

Maintainers release by pushing a semver tag from `main`; automation does the rest.

### Patch or minor release

1. Make sure `main` is green and contains everything for the release
2. Tag and push:
   ```bash
   git checkout main && git pull
   git tag v2.1.0
   git push origin v2.1.0
   ```
3. `.github/workflows/release.yml` then:
   - creates the GitHub Release with generated notes
   - force-moves the floating major tag (`v2`) to the same commit

Because the self-references below are pinned to the floating `@v2`, a patch or minor
release needs no ref rewrite — moving `v2` moves them.

### Major release — the manual step you must not skip

The reusable workflows reference this repository's *own* actions with absolute refs
(a `./` ref inside a `workflow_call` workflow resolves against the **caller's**
checkout, so relative refs are impossible). Those refs name a tag, and on a major bump
they must be rewritten **before** the tag is pushed, or `@vN` ships workflows that
still call `@vN-1` actions. See
[ADR 0002](docs/adr/0002-naming-and-repo-structure.md), decision 6 and its amendment.

```bash
git checkout main && git pull
git checkout -b release/v3.0.0

# Rewrite every self-reference, workflows AND composite action manifests.
# sf-org-login/action.yml holds one too — do not grep only .github/workflows.
grep -rl 'shared-github-actions/\.github/' .github/workflows .github/actions \
  --include='*.yml' \
  | xargs sed -i '' -E \
      's|(Gforce-Innovation-Kft/shared-github-actions/\.github/(actions\|workflows)/[A-Za-z0-9._-]+)@v2|\1@v3|g'

# Verify: expect 20 hits, and zero on the old tag or any branch name.
grep -rc 'shared-github-actions/\.github/.*@v3' .github/workflows .github/actions
grep -rn 'shared-github-actions/\.github/.*@\(v2\|main\|develop\)' .github/ || echo clean
```

Then open the PR, merge it, and tag the merge commit:

```bash
git checkout main && git pull
git tag v3.0.0 && git push origin v3.0.0
```

The refs resolve as soon as `release.yml` force-moves `v3` — which it does in the same
run that creates the Release.

Also on a major bump:
- Update the migration note and pin examples in `README.md`, `GETTING_STARTED.md`,
  `examples/README.md` and `CLAUDE.md` — they name the current major explicitly.
- Regenerate the consumer catalog on `main`: `./.github/scripts/build-usage-catalog.sh`.
  A rename makes the committed catalog report the old names.
- Callers pinned to `@v2` keep working until they opt in to `@v3`.

## Questions?

If you have questions:

1. Check existing documentation
2. Search closed issues
3. Open a new issue with your question

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

---

Thank you for contributing! 🎉
