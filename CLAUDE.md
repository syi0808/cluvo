# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build all packages
bun run build

# Typecheck (monorepo-aware, uses project references)
bun run typecheck

# Run all tests
bun test --recursive

# Run a single test file
bun test packages/core/test/collector.test.ts

# Filter tests by name
bun test --test-name-pattern="sanitize"

# Test with coverage
bun test --recursive --coverage
```

## Architecture

> See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation including diagrams, design patterns, data flows, integration patterns, and end-user experience.
>
> ARCHITECTURE.md is large. Do NOT read the entire file. Instead, use a **subagent(haiku)** to read and summarize only the relevant section. Example:
> ```
> Agent(model: "haiku", prompt: "Read ARCHITECTURE.md and summarize the Publisher System section. Focus on ...")
> ```

Cluvo is a **local-first bug reporting SDK** for open-source CLIs/SDKs. It captures errors, sanitizes sensitive data, lets users review before submitting, and publishes GitHub issues.

### Monorepo (Bun workspaces)

Three packages with a linear dependency chain: **core → sdk → cli**

- **`@cluvo/core`** — Zero-dependency pipeline stages (collector, sanitizer, store, matcher, formatter, presenter, publisher, diagnostic)
- **`@cluvo/sdk`** — High-level `createReporter()` API; resolves config with defaults via `resolveConfig()`
- **`@cluvo/cli`** — `cluvo` command for managing stored reports (list, show, submit, dismiss, clean)

### Core Pipeline

```
Error → Collector → Sanitizer → Store → Matcher → Formatter → Presenter → Publisher
```

Each stage is a separate directory under `packages/core/src/` and independently testable.
The presenter uses an Adapter pattern (`PresenterAdapter`) allowing custom UI implementations.

## TypeScript

- Target: ES2022, Module: ESNext, `verbatimModuleSyntax: true`
- Strict mode enabled
- Each package has its own `tsconfig.json` extending root; `tsc --build` for incremental compilation

## Changesets Workflow

This project uses pubm changesets to track changes and automate versioning.

### Rules
- Every PR that changes runtime code must include a changeset file
- Add a changeset: `bun run changesets:add`
- Changeset identifiers use package path (e.g., `packages/core`), not registry name. Package names are also accepted and auto-resolved to paths.
- Changeset summaries should be written from the user's perspective
- PRs with `no-changeset` label skip the changeset check (use for docs, CI config, etc.)

### Workflow
1. Make changes on a feature branch
2. Run `pubm changesets add` — select packages, bump type, and summary
3. Commit the generated `.pubm/changesets/<id>.md` file with your PR
4. On merge, changesets accumulate on main
5. When releasing, `pubm` consumes pending changesets to determine versions and generate CHANGELOG

### Bump Type Guide
- **patch**: Bug fixes, internal refactors with no API changes
- **minor**: New features, backward-compatible additions
- **major**: Breaking changes, removed/renamed public APIs

### Review Checklist
- [ ] Changeset file included (or `no-changeset` label applied)
- [ ] Bump type matches the scope of changes
- [ ] Summary is clear and user-facing
