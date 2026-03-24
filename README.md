# Cluvo

**Local-first bug reporting for open-source CLIs and SDKs.**

Cluvo turns crashes into debug-ready GitHub issues — no server, no dashboard, no telemetry. Errors are collected, sanitized, and formatted on the user's machine. They review everything before it goes anywhere.

```ts
import { createReporter } from '@cluvo/sdk'

const cluvo = createReporter({
  repo: 'your-org/your-cli',
  app: { name: 'your-cli', version: '1.2.0' },
})

// Wrap your CLI entry point
await cluvo.wrapCommand(async () => {
  await runCli()
})
// Errors are caught, sanitized, and the user is prompted to submit
```

## Why Cluvo

Open-source maintainers waste hours asking for environment details, stack traces, and reproduction steps. Users file issues that say "it doesn't work." Both sides lose.

Cluvo fixes this at the source:

- **Collects what matters** — error, stack trace, OS, runtime, command, and argv
- **Strips what shouldn't leave** — tokens, passwords, API keys, emails, home paths
- **Detects duplicates** — searches existing GitHub issues before creating new ones
- **Lets users decide** — nothing is sent without explicit review and consent
- **Works without a server** — no backend, no sign-up, no API keys required

## Install

```bash
bun add @cluvo/sdk
# or
npm install @cluvo/sdk
```

For the CLI management tool:

```bash
bun add -g @cluvo/cli
```

## Quick Start

### Wrap a command (recommended)

```ts
import { createReporter } from '@cluvo/sdk'

const cluvo = createReporter({
  repo: 'acme/my-tool',
  app: { name: 'my-tool', version: '2.0.0' },
})

await cluvo.wrapCommand(async () => {
  // Your CLI logic here
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

  // Later, prompt the user to submit
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

## What the User Sees

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

## Configuration

```ts
const cluvo = createReporter({
  // Required
  repo: 'owner/repo',
  app: { name: 'my-cli', version: '1.0.0' },

  // Publishing mode — where to send issues
  // Fallback chain: browser → gh CLI → GitHub API → file export
  mode: 'browser',           // 'browser' | 'gh' | 'api' | 'file'

  // Interactive behavior
  interactive: 'auto',       // 'auto' (TTY detection) | 'never'
  nonInteractive: 'save',    // 'save' | 'log' | 'silent'

  // Data collection
  collect: {
    argv: true,               // Capture command arguments
    diagnosticReport: false,   // Include heap/memory diagnostics
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
| `@cluvo/core` | Collector, sanitizer, formatter, matcher, publisher, presenter, store |
| `@cluvo/sdk` | `createReporter()` — the main integration API |
| `@cluvo/cli` | CLI for managing stored reports |

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

## Development

```bash
git clone https://github.com/your-org/cluvo.git
cd cluvo
bun install
bun test
```

## License

MIT
