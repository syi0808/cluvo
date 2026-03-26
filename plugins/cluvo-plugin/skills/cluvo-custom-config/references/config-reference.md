# Cluvo Configuration Reference

## Full ReporterConfig Interface

```typescript
interface ReporterConfig {
  repo: string
  app: { name: string; version: string; gitSha?: string }
  preset?: 'cli' | 'sdk'                      // default: 'cli'
  presenter?: PresenterAdapter | null          // default: resolved from preset
  childPolicy?: 'absorb' | 'passthrough' | 'silent'  // default: 'passthrough'
  mode?: 'browser' | 'gh' | 'api' | 'file'
  interactive?: 'auto' | 'never'
  nonInteractive?: 'save' | 'silent' | 'log'
  collect?: {
    argv?: boolean              // default: true (cli), false (sdk)
    diagnosticReport?: boolean  // default: false
    configSummary?: boolean     // default: false
    envinfo?: boolean           // default: true
  }
  sanitize?: {
    enabled?: boolean           // default: true
    customRules?: SanitizeRule[]
  }
  dedupe?: {
    enabled?: boolean           // default: true
    searchDiscussions?: boolean // default: false
  }
  issue?: {
    labels?: string[]           // default: ['cluvo-report']
    title?: (ctx: { command?: string; error: ErrorPayload }) => string
    sections?: string[]         // default: from preset (cli includes 'command', sdk excludes it)
    template?: string
  }
  store?: {
    enabled?: boolean           // default: true
    maxReports?: number         // default: 100
  }
  prompt?: {
    message?: string
    detailMessage?: string
  }
  branding?: {
    showName?: boolean          // default: false
  }
}
```

## Presenter Adapter Interface

```typescript
interface PresenterAdapter {
  prompt(context: PromptContext): Promise<PresenterAction | null>
}

interface PromptContext {
  report: ErrorReport
  draft: DraftPayload
  authAvailable: boolean
  promptMessage?: string
  branding?: { showName?: boolean }
}

type PresenterAction =
  | { type: 'open' }
  | { type: 'gh' }
  | { type: 'view'; issue: ExistingIssue }
  | { type: 'react'; issue: ExistingIssue }
  | { type: 'save' }
  | { type: 'cancel' }
```

## WrapOptions Interface

```typescript
interface WrapOptions {
  rethrow?: boolean  // default: true
}
```

## ExitHandlerOptions Interface

```typescript
interface ExitHandlerOptions {
  interceptProcessExit?: boolean  // default: false
  timeout?: number                // default: 30000
}
```

## SanitizeRule Interface

```typescript
interface SanitizeRule {
  name: string
  pattern: RegExp
  replacement: string
}
```

## Built-in Sanitize Rules

These rules are always active when `sanitize.enabled: true`:

| Rule | Matches | Replacement |
|------|---------|-------------|
| `bearer-token` | `Bearer <token>` headers | `Bearer [REDACTED]` |
| `github-token` | `ghp_*`, `ghs_*` tokens | `[REDACTED]` |
| `generic-api-key` | Common API key patterns (`api_key=...`, `secret_key=...`) | `$1=[REDACTED]` |
| `password` | Password fields in key=value pairs | `$1=[REDACTED]` |
| `sk-token` | `sk-live-*`, `sk-test-*` tokens (OpenAI, Stripe, etc.) | `[REDACTED]` |
| `email` | Email addresses | `***@domain` |
| `private-key` | PEM private key blocks | `[REDACTED PRIVATE KEY]` |
| `home-path` | Home directory paths (e.g., `/Users/name/...`) | `~` |

## ARGV_SENSITIVE_FLAGS

Sensitive CLI arguments are sanitized by a separate mechanism, independent of the `SanitizeRule` pipeline. The following flags have their values redacted:

`--token`, `--api-key`, `--secret`, `--password`, `--auth`, `-t`, `--access-token`, `--api-token`

## Preset Defaults

| Setting | CLI Preset | SDK Preset |
|---------|-----------|-----------|
| `interactive` | `'auto'` | `'never'` |
| `collect.argv` | `true` | `false` |
| `issue.sections` | Includes `command` | Excludes `command` |
| Presenter | `TerminalPresenter` | `null` |

Preset values are defaults — any explicit config field overrides the preset.

## Supporting Types

```typescript
interface ErrorPayload {
  name: string
  message: string
  stack?: string
  causeChain?: string[]
}

type ReporterMode = 'browser' | 'gh' | 'api' | 'file'
type InteractiveMode = 'auto' | 'never'
type NonInteractiveMode = 'save' | 'silent' | 'log'
type Preset = 'cli' | 'sdk'
type ChildPolicy = 'absorb' | 'passthrough' | 'silent'
```
