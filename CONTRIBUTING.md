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
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Test your changes** thoroughly
5. **Commit with clear messages**
   ```bash
   git commit -m "Add: Description of your changes"
   ```
6. **Push to your branch**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Create a Pull Request**

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
   - Use descriptive naming: `feature-name.yml`
   - Include `workflow_call` trigger
   - Define clear inputs and outputs

2. **Document the workflow**
   - Add comprehensive documentation to README.md
   - Include usage examples
   - Document all inputs and outputs
   - Add examples to the `examples/` directory

3. **Test the workflow**
   - Create a test repository
   - Add the workflow to the test repo
   - Verify all scenarios work correctly
   - Test with different input combinations

4. **Update changelog**
   - Add entry to CHANGELOG.md under [Unreleased]

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

1. **Test the workflow** in a separate repository
2. **Verify all input combinations** work as expected
3. **Check error handling** - test failure scenarios
4. **Validate outputs** are correctly exposed
5. **Test with different permissions** to ensure they're correctly documented

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
- GitHub account
- Text editor or IDE
- Access to a test GitHub repository

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/<your-org>/shared-github-action.git
   cd shared-github-action
   ```

2. Create a test branch:
   ```bash
   git checkout -b test/my-changes
   ```

3. Make your changes

4. Test in a separate repository by referencing your branch:
   ```yaml
   uses: <your-username>/shared-github-action/.github/workflows/workflow-name.yml@test/my-changes
   ```

## Release Process

Maintainers release by pushing a semver tag from `main`; automation does the rest:

1. Make sure `main` is green and contains everything for the release
2. Tag and push:
   ```bash
   git checkout main && git pull
   git tag v1.2.0
   git push origin v1.2.0
   ```
3. `.github/workflows/release.yml` then:
   - creates the GitHub Release with generated notes
   - force-moves the floating major tag (`v1`) to the same commit
4. Breaking change? Bump the major (`v2.0.0`) — callers pinned to `@v1` keep
   working until they opt in to `@v2`

## Questions?

If you have questions:

1. Check existing documentation
2. Search closed issues
3. Open a new issue with your question

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

---

Thank you for contributing! 🎉
