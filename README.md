# Shared GitHub Actions

This repository contains reusable GitHub Actions workflows and composite actions that can be used across multiple repositories.

## Available Workflows


## Repository Setup

1. Clone this repository
2. Make your changes
3. Push to the main branch or create a release tag for versioning

## Best Practices

- Use release tags or specific branches (e.g., `@v1` or `@main`) when referencing workflows
- Test workflows thoroughly before using them in production
- Keep workflows up to date with the latest action versions
- Document any changes in the workflow files

## Contributing

When adding new reusable workflows:

1. Create the workflow in `.github/workflows/`
2. Ensure the workflow uses `workflow_call` trigger
3. Document all inputs and outputs
4. Add usage examples to this README
5. Test the workflow in a separate repository before merging

## License

[Add your license information here]
