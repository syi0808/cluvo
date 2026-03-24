# Cluvo SDK API Reference (Setup)

## `createReporter(config): Reporter`

Creates a reporter instance.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo` | `string` | Yes | GitHub `owner/repo` |
| `app.name` | `string` | Yes | Application name |
| `app.version` | `string` | Yes | Application version |
| `app.gitSha` | `string` | No | Git commit SHA |

## Reporter Methods

### `reporter.wrapCommand(fn): Promise<void>`

Wraps an async function. On error: capture → sanitize → prompt user → submit to GitHub. Re-throws the original error after handling.

### `reporter.installGlobalHandlers(): () => void`

Registers `uncaughtException` and `unhandledRejection` listeners. Returns an unsubscribe function.

**Note:** Use this via `/cluvo-find-handlers` for global-level error coverage; `wrapCommand` is sufficient for basic setup.

### `reporter.reportError(error, context?): Promise<ErrorReport>`

Never throws. Returns a report even on internal failure.

### `reporter.promptAndSubmit(report): Promise<void>`

In TTY: shows interactive prompt (view, react, open, gh, save, cancel).
In non-TTY: follows `nonInteractive` config setting (save/log/silent).
