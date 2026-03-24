# Error Handling Integration Patterns

## Decision Rules

- **try/catch in command handlers or top-level operations** → Manual level
- **No global error handlers exist** → `installGlobalHandlers()` at app startup
- **try/catch where the caller needs fine-grained control** (retry logic, custom formatting, conditional reporting) → Low-level pipeline

## Manual Level Pattern

Use for try/catch blocks in command handlers or top-level operations.

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

## Global Handlers Pattern

Use when no process-level error handlers exist.

```typescript
// At app startup, after createReporter
const unsubscribe = cluvo.installGlobalHandlers()
```

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
