# Error Handling Integration Patterns

## Decision Rules

- **try/catch in command handlers or top-level operations** → `reportAndPrompt` (simplest)
- **Wrapping an entire async function** → `wrap(fn)` or `wrap(fn, { rethrow: false })`
- **Need separate report + prompt control** → Manual level (`reportError` + `promptAndSubmit`)
- **No global error handlers exist** → `installGlobalHandlers()` at app startup
- **Using `reportError` without `promptAndSubmit`** → Add `installExitHandler()` to catch pending reports
- **try/catch with fine-grained control** (retry logic, custom formatting, conditional reporting) → Low-level pipeline
- **SDK/library consumed by a CLI app** → Nested reporter pattern with `childPolicy`

## reportAndPrompt Pattern (Recommended)

The simplest way to report and prompt in one call. Use for most try/catch blocks.

```typescript
try {
  await riskyOperation()
} catch (error) {
  await cluvo.reportAndPrompt(error, {
    command: '<command-name>',
    argv: process.argv.slice(2),
  })
}
```

## wrap Pattern

Use when you want to wrap an entire async function without manual try/catch.

```typescript
// Re-throws by default (CLI commands)
await cluvo.wrap(async () => {
  await riskyOperation()
})

// Swallow error (SDK/library code)
await cluvo.wrap(async () => {
  await riskyOperation()
}, { rethrow: false })
```

`wrapCommand` is the CLI variant — automatically captures `process.argv` as context:

```typescript
await cluvo.wrapCommand(async () => {
  await runCliCommand()
})
```

## Manual Level Pattern

Use when you need separate control over reporting and prompting.

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
- Deduplicates automatically — same error object returns the cached report
- Populate `command` and `subcommand` from context if available
- Add relevant `metadata` if the catch block has useful context

## Global Handlers Pattern

Use when no process-level error handlers exist.

```typescript
// At app startup, after new Reporter()
const unsubscribe = cluvo.installGlobalHandlers()
```

## Exit Handler Pattern

Use when `reportError` is called without `promptAndSubmit` (e.g., in library code). The exit handler catches pending reports before the process exits.

```typescript
const cleanup = cluvo.installExitHandler()

// Optional: also intercept process.exit calls
const cleanup = cluvo.installExitHandler({ interceptProcessExit: true })
```

## Nested Reporter Pattern

Use when a CLI app consumes SDK libraries that both use Cluvo.

```typescript
// In CLI app (parent):
const cliReporter = new Reporter({
  repo: 'myorg/cli-tool',
  app: { name: 'my-cli', version: '1.0.0' },
  childPolicy: 'absorb', // forward child errors to this reporter's presenter
})

// In SDK library (child, auto-detected via registry):
const libReporter = new Reporter({
  repo: 'myorg/my-lib',
  app: { name: 'my-lib', version: '2.0.0' },
  preset: 'sdk',
})
```

**childPolicy options:**

| Policy | Behavior |
|--------|----------|
| `absorb` | Child forwards report to parent's presenter. Child still stores locally. |
| `passthrough` | Child handles its own prompt normally. |
| `silent` | Child stores only, no prompt. |

## Low-Level Pipeline Pattern

Use when the caller needs fine-grained control over the reporting pipeline.

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
