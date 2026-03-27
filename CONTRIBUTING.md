# Contributing to Cluvo

Thank you for your interest in contributing to Cluvo. This guide explains how to report issues, suggest improvements, and submit code changes.

## Code of Conduct

Please be respectful and constructive in all interactions. We want this to be a welcoming and inclusive space for everyone.

## How to Contribute

### Reporting Bugs

1. Search [existing issues](../../issues) to check if the bug has already been reported
2. If not, open a new issue with:
   - Steps to reproduce the bug
   - Expected behavior vs. actual behavior
   - Your environment (OS, Node.js/Bun version, package version)
   - Error output or stack trace if applicable

### Suggesting Improvements

1. Search [existing issues](../../issues) for similar suggestions
2. Open a new issue describing:
   - The problem or use case
   - Your proposed solution
   - Alternatives you considered

### Pull Requests

1. Fork the repository
2. Create a feature branch from `main` (`git checkout -b feature/your-feature`)
3. Make your changes
4. Add a changeset (`pubm changesets add`). Every PR with runtime changes must include one
5. Ensure all checks pass (lint, typecheck, tests)
6. Push to your fork and open a pull request
7. Fill in the PR description explaining what changed and why

## Development Setup

### Requirements

- [Bun](https://bun.sh) 1.3 or later

### Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/cluvo.git
cd cluvo
bun install
```

### Build

```bash
bun run build
```

### Run Tests

```bash
bun test --recursive
```

### Typecheck

```bash
bun run typecheck
```

## Project Structure

This is a Bun workspaces monorepo with three packages:

```
packages/
├── core/   @cluvo/core: zero-dependency pipeline modules
├── sdk/    @cluvo/sdk:  high-level Reporter class API
└── cli/    @cluvo/cli:  CLI for managing stored reports
```

Dependencies flow linearly: **core → sdk → cli**.

## Style Guide

### Code Style

This project uses [Biome](https://biomejs.dev/) for linting and formatting. Run the checker before submitting:

```bash
bun run check       # Lint and check formatting
bun run format      # Auto-fix formatting issues
```

Configuration is defined in `biome.json`:
- Tab indentation, 100-character line width
- Single quotes, semicolons as needed
- Auto-organized imports

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) style:

```
<type>: <description>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`

Examples:
- `feat: add custom sanitization rules`
- `fix: handle missing stack trace in collector`
- `docs: update configuration examples`

### Changesets

Every PR that changes runtime code must include a changeset:

```bash
pubm changesets add
```

Select the affected packages, bump type, and write a user-facing summary.

- **patch**: Bug fixes, internal refactors with no API changes
- **minor**: New features, backward-compatible additions
- **major**: Breaking changes, removed or renamed public APIs

PRs with the `no-changeset` label skip the changeset check (use for docs, CI config, etc.).

## Testing

Run the full test suite before submitting a pull request:

```bash
bun test --recursive
```

Run a specific test file:

```bash
bun test packages/core/test/collector.test.ts
```

Filter tests by name:

```bash
bun test --test-name-pattern="sanitize"
```

Run with coverage:

```bash
bun test --recursive --coverage
```

Tests are located in `packages/*/test/` directories and use the Bun built-in test runner.
