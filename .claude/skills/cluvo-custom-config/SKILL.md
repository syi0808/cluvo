---
name: cluvo-custom-config
description: |
  Customize Cluvo reporter configuration: sanitize rules, issue labels/format,
  dedupe, store, collect options, publish mode, and non-interactive behavior.
  Finds the existing createReporter call and modifies its config.
  TRIGGER when: user asks to "customize cluvo", "cluvo 설정", "add sanitize rule",
  "sanitize 규칙 추가", "issue 라벨 설정", "cluvo config", "cluvo-custom-config".
---

# Cluvo Custom Config

Tune `createReporter` configuration to match your project's needs.

## Prerequisites

Search for `createReporter` in the codebase. If not found:

> Cluvo is not set up yet. Run `/cluvo-setup` first.

Then stop.

## Steps

### 1. Read current config

Find the `createReporter(...)` call and display the current configuration to the user.

### 2. Ask what to customize

Present the available config areas:

| Area | What it controls |
|------|-----------------|
| **Sanitize** | Custom regex rules to mask project-specific secrets |
| **Issue** | Labels, title format, markdown sections, issue template |
| **Dedupe** | Duplicate issue search on/off, include GitHub Discussions |
| **Store** | Local report persistence on/off, max report count |
| **Collect** | What data to collect: argv, diagnostic report, envinfo |
| **Mode** | How to publish: browser, gh CLI, GitHub API, or file |
| **Non-interactive** | Behavior in non-TTY: save, log, or silent |
| **Prompt** | Custom prompt messages |
| **Branding** | Show/hide Cluvo name in output |

Ask the user which area(s) they want to configure.

### 3. Apply configuration

Modify the `createReporter` config object based on user choices. Below are patterns for each area.

#### Sanitize — Custom Rules

Add custom `SanitizeRule` entries to catch project-specific secrets:

```typescript
const cluvo = createReporter({
  repo: 'owner/repo',
  app: { name: 'my-cli', version: '1.0.0' },
  sanitize: {
    enabled: true,
    customRules: [
      {
        name: 'internal-api-url',
        pattern: /https:\/\/internal\.company\.com\/[^\s]*/g,
        replacement: '[INTERNAL_URL]',
      },
      {
        name: 'custom-token',
        pattern: /myapp_[A-Za-z0-9]{32}/g,
        replacement: '[MYAPP_TOKEN]',
      },
    ],
  },
})
```

**Built-in rules** (always active when `sanitize.enabled: true`):

| Rule | Matches |
|------|---------|
| bearer-token | `Bearer <token>` headers |
| github-token | `ghp_*`, `ghs_*` tokens |
| generic-api-key | Common API key patterns |
| password | Password fields in key=value pairs |
| email | Email addresses |
| home-path | Home directory paths (e.g., `/Users/name/...`) |
| private-key | PEM private key blocks |
| sk-token | `sk-*` tokens (OpenAI, Stripe, etc.) |

**Note:** Sensitive CLI argv (e.g., `--token`, `--password`) are sanitized by a separate mechanism (`ARGV_SENSITIVE_FLAGS`) independent of `SanitizeRule` pipeline.

#### Issue — Labels, Title, Sections

```typescript
const cluvo = createReporter({
  // ...
  issue: {
    labels: ['bug', 'cluvo-report', 'needs-triage'],
    title: (ctx) => `[${ctx.command ?? 'unknown'}] ${ctx.error.name}: ${ctx.error.message}`,
    sections: ['summary', 'environment', 'stackTrace', 'sanitizedNotice'],
    // template: 'bug_report'  // GitHub issue template name
  },
})
```

**Available sections:** `summary`, `environment`, `command`, `stackTrace`, `causeChain`, `sanitizedNotice`

**Title callback** receives `{ command?: string, error: ErrorPayload }` where `ErrorPayload` has `name`, `message`, `stack`, `cause?`.

#### Dedupe

```typescript
dedupe: {
  enabled: true,           // Search GitHub for similar issues before submitting
  searchDiscussions: false, // Also search GitHub Discussions
}
```

#### Store

```typescript
store: {
  enabled: true,    // Persist reports to ~/.cluvo/reports/<app>/
  maxReports: 50,   // Auto-evict oldest when exceeded (default: 100)
}
```

#### Collect

```typescript
collect: {
  argv: true,              // Capture CLI arguments (sanitized)
  diagnosticReport: false, // Capture heap memory stats
  envinfo: true,           // Capture OS, arch, Node version, etc.
}
```

#### Mode

```typescript
mode: 'browser'  // 'browser' | 'gh' | 'api' | 'file'
```

| Mode | Behavior |
|------|----------|
| `browser` | Open GitHub new issue form in browser (default) |
| `gh` | Use `gh issue create` CLI command |
| `api` | Direct GitHub REST API (requires token) |
| `file` | Export to markdown file |

#### Non-interactive

```typescript
interactive: 'auto',       // 'auto' (detect TTY) or 'never'
nonInteractive: 'save',    // 'save' | 'log' | 'silent'
```

#### Prompt

```typescript
prompt: {
  message: 'An error occurred. Would you like to report it?',
  detailMessage: 'Press v to view the full report.',
}
```

#### Branding

```typescript
branding: {
  showName: false,  // Show/hide "Cluvo" name in output (default: false)
}
```

### 4. Completion message

> Configuration updated. Your Cluvo reporter is now customized for this project.

## Full ReporterConfig Reference

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

interface SanitizeRule {
  name: string
  pattern: RegExp
  replacement: string
}
```
