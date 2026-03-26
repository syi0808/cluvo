# Cluvo SDK API Reference (Setup)

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

### Presets

| Preset | Interactive | Argv Collection | Sections | Presenter |
|--------|------------|-----------------|----------|-----------|
| `'cli'` | `'auto'` | Yes | Includes `command` | `TerminalPresenter` |
| `'sdk'` | `'never'` | No | Excludes `command` | `null` |

## Reporter Methods

### `reporter.wrapCommand(fn, opts?): Promise<void>`

Wraps an async function with CLI context. Captures `process.argv`, runs sanitize → prompt → submit pipeline on error. Re-throws by default.

- `opts.rethrow` — Re-throw after reporting (default: `true`)

### `reporter.wrap(fn, opts?): Promise<void>`

Like `wrapCommand` but without CLI-specific `process.argv` extraction. Ideal for SDK/library code.

- `opts.rethrow` — Re-throw after reporting (default: `true`)

### `reporter.reportAndPrompt(error, context?): Promise<void>`

Combines `reportError` + `promptAndSubmit` in one call. Convenient for catch blocks.

### `reporter.installGlobalHandlers(): () => void`

Registers `uncaughtException` and `unhandledRejection` listeners. Returns an unsubscribe function.

**Note:** Use this via `/cluvo-find-handlers` for global-level error coverage; `wrapCommand` is sufficient for basic setup.

### `reporter.installExitHandler(opts?): () => void`

Catches unreported errors at process exit via `beforeExit`. Returns a cleanup function.

- `opts.interceptProcessExit` — Also monkey-patch `process.exit` (opt-in, default: `false`)
- `opts.timeout` — Max time to wait for prompt at exit (default: `30000` ms)

### `reporter.reportError(error, context?): Promise<ErrorReport>`

Never throws. Returns a report even on internal failure. Deduplicates — same error object returns the cached report.

### `reporter.promptAndSubmit(report): Promise<void>`

Uses the presenter adapter (or non-interactive fallback) to show the prompt. Respects parent's `childPolicy` when in a nested reporter hierarchy.

### `reporter.receiveChildReport(report): Promise<void>`

Receives a forwarded report from a child reporter (used by the registry under `absorb` policy).
