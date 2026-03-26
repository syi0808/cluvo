# Cluvo SDK API Reference (Find Handlers)

## `new Reporter(config)`

Creates a reporter instance. Uses `new` to prevent Bun's tail-call optimization from dropping caller stack frames, enabling reliable top-level enforcement.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo` | `string` | Yes | GitHub `owner/repo` |
| `app.name` | `string` | Yes | Application name |
| `app.version` | `string` | Yes | Application version |
| `app.gitSha` | `string` | No | Git commit SHA |
| `preset` | `'cli' \| 'sdk'` | No | Environment preset (default: `'cli'`) |
| `presenter` | `PresenterAdapter \| null` | No | Custom presenter adapter |
| `childPolicy` | `'absorb' \| 'passthrough' \| 'silent'` | No | Policy for child reporters (default: `'passthrough'`) |

## High-Level Methods

### `reporter.reportAndPrompt(error, context?): Promise<void>`

Combines `reportError` + `promptAndSubmit` in one call. The simplest way to report an error.

### `reporter.wrap(fn, opts?): Promise<void>`

Wraps an async function. On error: capture → sanitize → prompt → submit. Re-throws by default.

- `opts.rethrow` — Re-throw after reporting (default: `true`)

### `reporter.wrapCommand(fn, opts?): Promise<void>`

Like `wrap` but captures `process.argv` as CLI context. Re-throws by default.

- `opts.rethrow` — Re-throw after reporting (default: `true`)

### `reporter.reportError(error, context?): Promise<ErrorReport>`

Never throws. Returns a report even on internal failure. Deduplicates — same error object returns the cached report.

**ErrorContext:**

| Field | Type | Description |
|-------|------|-------------|
| `command` | `string?` | Command name (e.g., `'deploy'`) |
| `subcommand` | `string?` | Subcommand name (e.g., `'production'`) |
| `argv` | `string[]?` | CLI arguments |
| `metadata` | `Record<string, unknown>?` | Arbitrary context data |

### `reporter.promptAndSubmit(report): Promise<void>`

Uses the presenter adapter to show the prompt. Falls back to non-interactive behavior when no presenter is available. Respects parent's `childPolicy` in nested hierarchies.

### `reporter.installGlobalHandlers(): () => void`

Catches `uncaughtException` and `unhandledRejection`. Returns unsubscribe function.

### `reporter.installExitHandler(opts?): () => void`

Catches unreported (pending) errors at process exit via `beforeExit`. Returns cleanup function.

- `opts.interceptProcessExit` — Also monkey-patch `process.exit` (opt-in, default: `false`)
- `opts.timeout` — Max wait time at exit (default: `30000` ms)

### `reporter.receiveChildReport(report): Promise<void>`

Receives a forwarded report from a child reporter (used by the registry under `absorb` policy).

## Low-Level Methods

| Method | Description |
|--------|-------------|
| `buildReport(error, context?)` | Collect error + environment + command info |
| `sanitizeReport(report)` | Apply sanitize rules, returns new report |
| `findMatches(report)` | Search GitHub for duplicate issues |
| `buildDraft(report)` | Generate markdown title + body |
| `publish(draft)` | Submit via browser/gh/api/file |
