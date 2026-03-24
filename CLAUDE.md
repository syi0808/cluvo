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

Cluvo is a **local-first bug reporting SDK** for open-source CLIs/SDKs. It captures errors, sanitizes sensitive data, lets users review before submitting, and publishes GitHub issues.

### Monorepo (Bun workspaces)

Three packages with a linear dependency chain: **core → sdk → cli**

- **`@cluvo/core`** — Zero-dependency modules implementing each pipeline stage
- **`@cluvo/sdk`** — High-level `createReporter()` API that orchestrates core modules; resolves config with defaults via `resolveConfig()`
- **`@cluvo/cli`** — `cluvo` command for managing stored reports (list, show, submit, dismiss, clean)

### Core Pipeline

```
Error → Collector → Sanitizer → Store → Matcher → Formatter → Presenter → Publisher
```

Each stage is a separate directory under `packages/core/src/` and independently testable:

| Stage | Purpose |
|-------|---------|
| `collector/` | Captures error payload, environment (OS/arch/runtime/CI), app info (version/git SHA), command args |
| `sanitizer/` | Redacts sensitive data (tokens, keys, emails, paths) using regex rules before user sees anything |
| `matcher/` | Deduplicates by searching GitHub issues/discussions via API |
| `formatter/` | Builds GitHub issue markdown (title + body with sections) |
| `presenter/` | Interactive TTY prompts (raw mode, single-key) with non-TTY fallback |
| `publisher/` | Fallback chain: browser → gh CLI → GitHub API → file export |
| `store/` | Local filesystem persistence at `~/.cluvo/reports/<app>/<id>.json` |
| `diagnostic/` | Optional heap/memory/handle diagnostics |

### Key Patterns

- **Fallback chain** in publisher — always succeeds by falling back to file export
- **Config injection** — `ReporterConfig` (user-facing) vs `InternalConfig` (test-time DI)
- **Interactive mode auto-detection** — `process.stdout.isTTY` with explicit override

### Plugin System

`plugins/cluvo-plugin/` contains a Claude AI plugin with three skills (setup → find-handlers → custom-config) for guided onboarding.

## TypeScript

- Target: ES2022, Module: ESNext, `verbatimModuleSyntax: true`
- Strict mode enabled
- Each package has its own `tsconfig.json` extending root; `tsc --build` for incremental compilation
