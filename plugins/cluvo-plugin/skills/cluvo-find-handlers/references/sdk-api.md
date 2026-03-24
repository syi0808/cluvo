# Cluvo SDK API Reference (Find Handlers)

## `createReporter(config): Reporter`

Creates a reporter instance.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo` | `string` | Yes | GitHub `owner/repo` |
| `app.name` | `string` | Yes | Application name |
| `app.version` | `string` | Yes | Application version |
| `app.gitSha` | `string` | No | Git commit SHA |

## High-Level Methods

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

### `reporter.wrapCommand(fn): Promise<void>`

Wraps an async function. On error: capture → sanitize → prompt user → submit to GitHub. Re-throws the original error after handling.

## Low-Level Methods

| Method | Description |
|--------|-------------|
| `buildReport(error, context?)` | Collect error + environment + command info |
| `sanitizeReport(report)` | Apply sanitize rules, returns new report |
| `findMatches(report)` | Search GitHub for duplicate issues |
| `buildDraft(report)` | Generate markdown title + body |
| `publish(draft)` | Submit via browser/gh/api/file |
