# Getting Started with Shared GitHub Actions

This guide will help you set up and use the shared GitHub Actions from this repository.

## Prerequisites

- A GitHub repository where you want to use these workflows
- Appropriate permissions to create workflows in your repository
- For Salesforce Code Analyzer: A Salesforce project with code to analyze

## Quick Start

### Step 1: Enable Actions in Your Repository

1. Go to your repository settings
2. Navigate to Actions → General
3. Ensure "Allow all actions and reusable workflows" is selected

### Step 2: Create a Workflow File

In your repository, create a new file at `.github/workflows/code-analysis.yml`

### Step 3: Reference the Reusable Workflow

Add the following content to your workflow file:

```yaml
name: Code Analysis
on:
  pull_request:

jobs:
  analyze:
    uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-sf-code-analyze.yml@v2
    permissions:
      pull-requests: write
      contents: read
      actions: read
```

**The tag and the path move together.** `reusable-sf-code-analyze.yml` is the `v2` name.
At `@v1` the same workflow is `salesforce-code-analyzer.yml` — so
`reusable-sf-code-analyze.yml@v1` does not resolve, and neither does
`salesforce-code-analyzer.yml@v2`. Pin `@v2` for new callers; the full rename mapping is
in [ADR 0002](docs/adr/0002-naming-and-repo-structure.md).

### Step 4: Commit and Push

Commit the workflow file and push it to your repository. The workflow will run automatically on the next pull request.

## Publishing Your Shared Actions Repository

### Option 1: Public Repository

If your repository is public, workflows can be used immediately by referencing them.

### Option 2: Internal Repository (GitHub Enterprise)

1. Go to repository Settings → Actions → General
2. Under "Access", select "Accessible from repositories in the organization"
3. Save changes

### Option 3: Private Repository

For private repositories:
1. The calling repository must be in the same organization
2. Set proper access permissions in repository settings

## Versioning Strategy

### Using the Major Tag (Recommended)

```yaml
uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-sf-code-analyze.yml@v2
```

**Pros:** Fixes and non-breaking features arrive automatically; breaking changes never do (they bump the major)
**Cons:** The tag moves — behavior can change between runs within the major

### Using Exact Release Tags

```yaml
uses: Gforce-Innovation-Kft/shared-github-actions/.github/workflows/reusable-sf-code-analyze.yml@v2.0.0
```

**Pros:** Immutable, fully predictable behavior
**Cons:** Need to manually update to get fixes and new features

### Using `@main`

Development and testing only — unreleased changes land here and may break at
any time. Never use `@main` in production callers.

## Creating a Release

Push a semver tag from `main`; the [release workflow](.github/workflows/release.yml)
creates the GitHub Release and force-moves the major tag (`v2`) automatically:

```bash
git checkout main && git pull
git tag v2.1.0
git push origin v2.1.0
```

A **major** bump has a manual step first — the reusable workflows' own self-references
must be re-pinned to the new tag before tagging. Full procedure:
[CONTRIBUTING.md](CONTRIBUTING.md#release-process).

## Testing Your Reusable Workflows

Before using a workflow in production:

1. Create a test repository
2. Add the workflow reference
3. Create a test pull request
4. Verify the workflow runs correctly
5. Check the generated artifacts and outputs

## Troubleshooting

### Workflow Not Found

- Verify the repository path is correct
- Check that the workflow file exists at the specified path
- Ensure the branch or tag exists

### Permission Denied

- Verify repository access settings
- Check that required permissions are granted in the calling workflow
- For organizations, verify the repository is allowed to use actions from other repos

### Workflow Fails to Start

- Check that all required inputs are provided
- Verify the workflow syntax is correct
- Review GitHub Actions logs for specific error messages

## Support

For issues or questions:
1. Check the [README.md](README.md) for usage examples
2. Review workflow logs for error details
3. Open an issue in this repository
