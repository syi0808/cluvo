# Cluvo

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![CI](https://github.com/user/cluvo/actions/workflows/ci.yml/badge.svg)](https://github.com/user/cluvo/actions/workflows/ci.yml)

> Bug reports should be as easy to file as they are to ignore.

Cluvo is a local-first bug reporting SDK for open-source CLIs and SDKs. It captures errors, sanitizes sensitive data on-device, lets users review everything before it goes anywhere, and publishes debug-ready GitHub issues.

No server, no dashboard, no telemetry. All processing happens on the user's machine until they explicitly choose to submit.

## Features

- **Automatic Error Capture**: Collects error, stack trace, OS, runtime, architecture, command args, and git SHA
- **On-Device Sanitization**: Strips tokens, passwords, API keys, emails, and home paths before the user ever sees a report
- **Duplicate Detection**: Searches existing GitHub issues and discussions before creating new ones
- **User Consent First**: Interactive TTY prompts let users review and decide what happens with their data
- **Zero-Server Architecture**: No backend, no sign-up, no API keys required to get started
- **Fallback Publishing**: Browser → `gh` CLI → GitHub API → local file export, always succeeds
- **Local Report Storage**: Stores reports at `~/.cluvo/reports/` for later review, submission, or cleanup

## Getting Started

### Requirements

- Node.js 18 or later (or [Bun](https://bun.sh) 1.3+)

### Install

```bash
npm install @cluvo/sdk
# or
bun add @cluvo/sdk
```

For the CLI management tool:

```bash
npm install -g @cluvo/cli
# or
bun add -g @cluvo/cli
```

### CLI app

Use the `cli` preset (default) when integrating into an interactive command-line tool. It auto-creates a `TerminalPresenter`, collects `process.argv`, and prompts the user on error.

```ts
import { Reporter } from '@cluvo/sdk'

const reporter = new Reporter({
  repo: 'myorg/cli-tool',
  app: { name: 'my-cli', version: '1.0.0' },
  // preset: 'cli' is the default
})

// Option A: Wrap entire command (recommended)
await reporter.wrapCommand(async () => {
  await runCLI()
})

// Option B: Report and prompt at a specific catch site
try {
  await runCommand()
} catch (error) {
  await reporter.reportAndPrompt(error)
}
```

### SDK / library

Use the `sdk` preset when integrating into a library. It disables the presenter and sets `interactive: 'never'`, so errors are stored locally and the parent CLI (if any) handles prompting.

```ts
import { Reporter } from '@cluvo/sdk'

const reporter = new Reporter({
  repo: 'myorg/my-lib',
  app: { name: 'my-lib', version: '2.0.0' },
  preset: 'sdk',
})

// Errors are stored; rethrow is optional
await reporter.wrap(async () => {
  await riskyOperation()
}, { rethrow: false })
```

### TUI app

Pass a custom presenter to integrate with your TUI framework:

```ts
import { Reporter } from '@cluvo/sdk'
import type { PresenterAdapter, PromptContext, PresenterAction } from '@cluvo/core'

class MyTuiPresenter implements PresenterAdapter {
  async prompt(context: PromptContext): Promise<PresenterAction | null> {
    // Pause TUI rendering, show error prompt, resume
    return { type: 'cancel' }
  }
}

const reporter = new Reporter({
  repo: 'myorg/cli-tool',
  app: { name: 'my-cli', version: '1.0.0' },
  presenter: new MyTuiPresenter(),
})
```

## Usage

### New API

#### `reportAndPrompt(error, context?)`

Combines `reportError` and `promptAndSubmit` into a single call. The most common pattern for catch blocks:

```ts
try {
  await deploy()
} catch (error) {
  await reporter.reportAndPrompt(error)
}
```

#### `wrap(fn, opts?)`

Wraps an async function with try/catch. Reports errors automatically.

```ts
await reporter.wrap(async () => {
  await riskyOperation()
}, { rethrow: false }) // rethrow: true by default
```

#### `wrapCommand(fn)`

Like `wrap`, but also captures `process.argv` as command context:

```ts
await reporter.wrapCommand(async () => {
  await runCLI()
})
```

#### `installExitHandler(opts?)`

Catches unreported errors at process exit via `process.on('beforeExit')`. Optionally intercepts `process.exit()` calls.

```ts
reporter.installExitHandler({ interceptProcessExit: true, timeout: 5000 })
```

#### `receiveChildReport(report)`

Receives an error report forwarded from a child SDK library (used automatically by the registry):

```ts
reporter.receiveChildReport(report)
```

### Wrap a command (recommended)

```ts
import { Reporter } from '@cluvo/sdk'

const cluvo = new Reporter({
  repo: 'acme/my-tool',
  app: { name: 'my-tool', version: '2.0.0' },
})

await cluvo.wrapCommand(async () => {
  await deploy(options)
})
// If deploy() throws, cluvo catches it, builds a report,
// and prompts the user to submit a GitHub issue
```

### Report errors manually

```ts
try {
  await riskyOperation()
} catch (error) {
  const report = await cluvo.reportError(error, {
    command: 'deploy',
    argv: process.argv.slice(2),
  })

  await cluvo.promptAndSubmit(report)
}
```

### Use the low-level API

```ts
const report = cluvo.buildReport(error)
const sanitized = cluvo.sanitizeReport(report)
const matches = await cluvo.findMatches(sanitized)
const draft = cluvo.buildDraft(sanitized)
const result = await cluvo.publish(draft)
```

### What the user sees

When an error occurs in interactive mode, the user sees a compact summary:

```
Prepare a sanitized bug report? (Y/n) Y

── Bug Report ────────────────────────────────
[deploy] TypeError: Cannot read property of undefined
darwin 23.1.0 · node v20.11.0 · arm64
Command: deploy prod --force
2 field(s) sanitized
──────────────────────────────────────────────────

Similar issues found:
  #142 [open]  TypeError in deploy command

[v] View similar issue  [o] Open in browser  [g] Create via gh  [s] Save  [c] Cancel
```

Sensitive data is redacted before the user ever sees it. They choose what happens next.

## Presets

Presets apply environment-specific defaults so you don't have to configure everything manually.

| Field | `cli` (default) | `sdk` |
|-------|-----------------|-------|
| `interactive` | `'auto'` (TTY detection) | `'never'` |
| `collect.argv` | `true` | `false` |
| `presenter` | `TerminalPresenter` | `null` |
| `nonInteractive` | `'save'` | `'save'` |

Override any preset default by specifying the field explicitly:

```ts
const reporter = new Reporter({
  repo: 'myorg/cli-tool',
  app: { name: 'my-cli', version: '1.0.0' },
  preset: 'cli',         // or 'sdk'
  interactive: 'never',  // overrides preset default
})
```

## Presenter Adapter

The presenter is responsible for prompting the user after an error is collected. Cluvo ships with a built-in `TerminalPresenter` (used by the `cli` preset), but you can replace it with any object that implements `PresenterAdapter`:

```ts
interface PresenterAdapter {
  prompt(context: PromptContext): Promise<PresenterAction | null>
}
```

`PromptContext` provides everything needed to render a prompt:

```ts
interface PromptContext {
  report: ErrorReport
  draft: DraftPayload
  authAvailable: boolean
  promptMessage?: string
  branding?: BrandingConfig
}
```

`PresenterAction` is a discriminated union of what the user chose:

```ts
type PresenterAction =
  | { type: 'open' }
  | { type: 'gh' }
  | { type: 'view' }
  | { type: 'react' }
  | { type: 'save' }
  | { type: 'cancel' }
```

To disable prompting entirely (e.g., in CI-only libraries), pass `presenter: null`:

```ts
new Reporter({ ..., presenter: null })
```

## Nested Usage

When a CLI app depends on an SDK library that also uses Cluvo, the global reporter registry automatically connects them. The library's reporter forwards errors to the CLI's presenter, no manual wiring needed.

**CLI app:**
```ts
const cliReporter = new Reporter({
  repo: 'myorg/cli-tool',
  app: { name: 'my-cli', version: '1.0.0' },
  childPolicy: 'absorb', // absorb child errors and prompt via CLI's presenter
})
```

**SDK library (installed as a dependency of the CLI):**
```ts
const libReporter = new Reporter({
  repo: 'myorg/my-lib',
  app: { name: 'my-lib', version: '2.0.0' },
  preset: 'sdk', // no presenter; forwards errors to parent if available
})
```

`childPolicy` controls how the parent handles errors forwarded from child reporters:

| Value | Behavior |
|-------|----------|
| `'absorb'` | Parent handles the error with its own presenter |
| `'passthrough'` | Parent re-reports and re-prompts normally |
| `'silent'` | Parent silently stores child errors |

## Configuration

```ts
const cluvo = new Reporter({
  // Required
  repo: 'owner/repo',
  app: { name: 'my-cli', version: '1.0.0' },

  // Preset — applies environment-specific defaults
  preset: 'cli',             // 'cli' (default) | 'sdk'

  // Publishing mode (fallback chain: browser → gh → API → file)
  mode: 'browser',           // 'browser' | 'gh' | 'api' | 'file'

  // Interactive behavior
  interactive: 'auto',       // 'auto' (TTY detection) | 'never'
  nonInteractive: 'save',    // 'save' | 'log' | 'silent'

  // Custom presenter (overrides preset default)
  presenter: new MyTuiPresenter(), // PresenterAdapter | null

  // Child reporter behavior (when other Cluvo reporters forward errors here)
  childPolicy: 'absorb',     // 'absorb' | 'passthrough' | 'silent'

  // Data collection
  collect: {
    argv: true,
    diagnosticReport: false,
  },

  // Sanitization
  sanitize: {
    enabled: true,
    customRules: [
      { name: 'internal-url', pattern: /internal\.corp\.com/g, replacement: '<INTERNAL>' },
    ],
  },

  // Duplicate detection
  dedupe: {
    enabled: true,
    searchDiscussions: false,
  },

  // Issue formatting
  issue: {
    labels: ['bug', 'cluvo-report'],
    title: (ctx) => `[${ctx.command}] ${ctx.error.name}: ${ctx.error.message}`,
    sections: ['summary', 'environment', 'command', 'stackTrace', 'sanitizedNotice'],
  },

  // Local storage
  store: {
    enabled: true,
    maxReports: 100,
  },
})
```

## Built-in Sanitization

Cluvo strips sensitive data by default before the user ever sees a report:

| Pattern | Example | Replaced With |
|---------|---------|---------------|
| Bearer tokens | `Bearer ghp_abc123...` | `Bearer [REDACTED]` |
| GitHub tokens | `ghp_abc123...` | `[REDACTED]` |
| API keys | `api_key=sk_live_...` | `api_key=[REDACTED]` |
| Passwords | `password=secret` | `password=[REDACTED]` |
| Emails | `john@example.com` | `***@example.com` |
| Home paths | `/Users/john/project` | `~/project` |
| Private keys | `-----BEGIN PRIVATE KEY-----` | `[REDACTED PRIVATE KEY]` |
| Sensitive argv | `--token ghp_secret` | `--token [REDACTED]` |

Add your own rules with `sanitize.customRules`.

## CLI

Manage locally stored error reports:

```bash
cluvo list                          # Show pending reports
cluvo list --all                    # Show all reports
cluvo list --app my-cli             # Filter by app
cluvo show <id>                     # View report details
cluvo submit <id> --repo owner/repo # Submit as GitHub issue
cluvo submit --all --repo owner/repo # Submit all pending (with confirmation)
cluvo dismiss <id>                  # Mark as dismissed
cluvo clean                         # Remove submitted/dismissed reports
cluvo clean --older-than 30d        # Remove old completed reports
```

Reports are stored at `~/.cluvo/reports/` as JSON files, organized by app name.

## Packages

| Package | Description |
|---------|-------------|
| [`@cluvo/core`](packages/core) | Collector, sanitizer, formatter, matcher, publisher, presenter, store |
| [`@cluvo/sdk`](packages/sdk) | `new Reporter()` — the main integration API |
| [`@cluvo/cli`](packages/cli) | CLI for managing stored reports |

## How It Works

```
Error occurs
    ↓
Collector  →  Captures error, stack trace, environment, command
    ↓
Sanitizer  →  Strips tokens, passwords, emails, paths
    ↓
Store      →  Saves report locally (~/.cluvo/reports/)
    ↓
Matcher    →  Searches GitHub for duplicate issues
    ↓
Formatter  →  Builds markdown title + body
    ↓
Presenter  →  Shows summary, prompts user for action
    ↓
Publisher  →  Opens browser / runs gh / calls API / saves file
```

## Contributing

Contributions are welcome. Please read the [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

## Author

**Yein Sung**, [GitHub](https://github.com/yeinsung)
