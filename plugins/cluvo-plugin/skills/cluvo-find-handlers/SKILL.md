---
name: cluvo-find-handlers
description: |
  Analyze a project's codebase to find error handling locations (try/catch,
  process error handlers, throw/reject sites) and apply the appropriate
  Cluvo API level (manual reportError, installGlobalHandlers, or low-level
  pipeline) at each location.
  TRIGGER when: user asks to "find error handlers for cluvo", "cluvo 수동 연동",
  "apply reportError", "에러 핸들링 위치 찾아줘", "cluvo-find-handlers".
---

# Cluvo Find Handlers

Scan the project for error handling locations and wire up Cluvo at the right level.

## Prerequisites

Check that `@cluvo/sdk` is installed (look for it in `package.json` dependencies). If not installed, tell the user:

> `@cluvo/sdk` is not installed. Run `/cluvo-setup` first to install and set up basic integration.

Then stop.

## Steps

### 1. Locate existing Cluvo reporter instance

Search for `createReporter` in the codebase to find the existing reporter instance and its variable name (e.g., `cluvo`, `reporter`). If not found, tell the user to run `/cluvo-setup` first.

### 2. Scan for error handling locations

Search the project source files for these patterns:

**Category A — Existing try/catch blocks:**
- `try { ... } catch` blocks that handle errors but don't report them to Cluvo
- Especially in command handlers, API routes, or service entry points

**Category B — Process-level error handlers:**
- `process.on('uncaughtException', ...)`
- `process.on('unhandledRejection', ...)`
- Check if these exist. If not, note their absence.

**Category C — Throw/reject sites:**
- Functions that `throw` custom errors or call `Promise.reject`
- These indicate where errors originate (useful context, not direct integration points)

### 3. Recommend integration level for each location

Present findings to the user as a table:

| Location | Category | Recommendation |
|----------|----------|---------------|
| `src/commands/deploy.ts:45` | try/catch | `reportError` + `promptAndSubmit` |
| (global) | No global handler | `installGlobalHandlers()` |
| `src/api/client.ts:89` | try/catch (pipeline) | Low-level API |

**Decision rules:**
- **try/catch in command handlers or top-level operations** → Manual level (`reportError` + `promptAndSubmit`)
- **No global error handlers exist** → Recommend `installGlobalHandlers()` at app startup
- **try/catch where the caller needs fine-grained control** (e.g., retry logic, custom formatting, conditional reporting) → Low-level pipeline

### 4. Apply with user confirmation

For each recommended location, show the code change and ask the user to confirm before applying.

Read [references/error-handling-patterns.md](references/error-handling-patterns.md) for the three integration patterns: manual level (`reportError` + `promptAndSubmit`), global handlers (`installGlobalHandlers`), and low-level pipeline.

### 5. Completion message

> Error handler integration complete. Cluvo will now capture errors at the
> configured locations.
>
> **Next step:**
> - To customize sanitize rules, labels, or issue format → use `/cluvo-custom-config`

## API Reference

Read [references/sdk-api.md](references/sdk-api.md) for the full Reporter API including `reportError`, `promptAndSubmit`, `installGlobalHandlers`, and low-level methods.
