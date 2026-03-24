# Cluvo Configuration Reference

## Full ReporterConfig Interface

```typescript
interface ReporterConfig {
  repo: string
  app: { name: string; version: string; gitSha?: string }
  mode?: 'browser' | 'gh' | 'api' | 'file'
  interactive?: 'auto' | 'never'
  nonInteractive?: 'save' | 'silent' | 'log'
  collect?: {
    argv?: boolean              // default: true
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
    sections?: string[]         // default: all 6 sections
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
```
