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

#### Manual Level Pattern

```typescript
try {
  await riskyOperation()
} catch (error) {
  const report = await cluvo.reportError(error, {
    command: '<command-name>',
    argv: process.argv.slice(2),
  })
  await cluvo.promptAndSubmit(report)
}
```

- `reportError` never throws — it always returns a report (even on internal failure)
- Populate `command` and `subcommand` from context if available
- Add relevant `metadata` if the catch block has useful context

#### Global Handlers Pattern

```typescript
// At app startup, after createReporter
const unsubscribe = cluvo.installGlobalHandlers()
```

#### Low-Level Pipeline Pattern

```typescript
const report = cluvo.buildReport(error, context)
const sanitized = cluvo.sanitizeReport(report)
const matchResult = await cluvo.findMatches(sanitized)
const enriched = matchResult.found
  ? { ...sanitized, matches: matchResult.matches }
  : sanitized
const draft = cluvo.buildDraft(enriched)
const result = await cluvo.publish(draft)
```

Use this when the caller needs to:
- Inspect or modify the report between steps
- Conditionally skip submission
- Use custom publish logic

### 5. Completion message

> Error handler integration complete. Cluvo will now capture errors at the
> configured locations.
>
> **Next step:**
> - To customize sanitize rules, labels, or issue format → use `/cluvo-custom-config`

## API Reference

### `reporter.reportError(error, context?): Promise<ErrorReport>`

Never throws. Returns a report even on internal failure.

**ErrorContext:**

| Field | Type | Description |
|-------|------|-------------|
| `command` | `string?` | Command name (e.g., `'deploy'`) |
| `subcommand` | `string?` | Subcommand name (e.g., `'production'`) |
| `argv` | `string[]?` | CLI arguments |
| `metadata` | `Record<string, unknown>?` | Arbitrary context data |

### `reporter.promptAndSubmit(report): Promise<void>`

In TTY: shows interactive prompt (view, react, open, gh, save, cancel).
In non-TTY: follows `nonInteractive` config setting (save/log/silent).

### `reporter.installGlobalHandlers(): () => void`

Catches `uncaughtException` and `unhandledRejection`. Returns unsubscribe function.

### Low-Level Methods

| Method | Description |
|--------|-------------|
| `buildReport(error, context?)` | Collect error + environment + command info |
| `sanitizeReport(report)` | Apply sanitize rules, returns new report |
| `findMatches(report)` | Search GitHub for duplicate issues |
| `buildDraft(report)` | Generate markdown title + body |
| `publish(draft)` | Submit via browser/gh/api/file |
