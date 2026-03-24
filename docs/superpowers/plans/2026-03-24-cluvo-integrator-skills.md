# Cluvo Integrator Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create 3 Claude Code skills that guide external developers through integrating `@cluvo/sdk` into their CLI/SDK projects.

**Architecture:** Each skill is a standalone markdown file (`SKILL.md`) in `.claude/skills/<skill-name>/`. Skills contain YAML frontmatter (name, description) and procedural instructions with embedded Cluvo API reference. No shared files between skills — each is self-contained.

**Tech Stack:** Claude Code skills (markdown), YAML frontmatter

**Spec:** `docs/superpowers/specs/2026-03-24-cluvo-integrator-skills-design.md`

---

### Task 1: Create `cluvo-setup` skill

**Files:**
- Create: `.claude/skills/cluvo-setup/SKILL.md`

- [ ] **Step 1: Create skills directory**

```bash
mkdir -p .claude/skills/cluvo-setup
```

- [ ] **Step 2: Write the `cluvo-setup` skill**

Create `.claude/skills/cluvo-setup/SKILL.md` with the following content:

```markdown
---
name: cluvo-setup
description: |
  Install @cluvo/sdk and add basic bug reporting to a CLI/SDK project.
  Detects runtime (Node.js/Bun), package manager (npm/yarn/pnpm/bun),
  finds the entry point, and inserts createReporter + wrapCommand boilerplate.
  TRIGGER when: user asks to "add cluvo", "install cluvo", "cluvo 설치",
  "cluvo 연동", "add bug reporting", "버그 리포팅 추가".
---

# Cluvo Setup

Install `@cluvo/sdk` and wire up basic bug reporting in one pass.

## Steps

### 1. Detect runtime and package manager

Check which runtime and package manager the project uses:

| Signal | Runtime | Package Manager |
|--------|---------|-----------------|
| `bun.lockb` exists | Bun | bun |
| `pnpm-lock.yaml` exists | Node.js | pnpm |
| `yarn.lock` exists | Node.js | yarn |
| `package-lock.json` exists | Node.js | npm |
| None of the above | Node.js | npm (default) |

### 2. Install `@cluvo/sdk`

Run the install command for the detected package manager:

- npm: `npm install @cluvo/sdk`
- yarn: `yarn add @cluvo/sdk`
- pnpm: `pnpm add @cluvo/sdk`
- bun: `bun add @cluvo/sdk`

### 3. Find the entry point

Look for the CLI/app entry point in this order:

1. `package.json` → `bin` field (if CLI tool)
2. `package.json` → `main` or `module` field
3. Common patterns: `src/index.ts`, `src/cli.ts`, `src/main.ts`, `src/index.js`, `src/cli.js`

If multiple candidates exist, ask the user which one to use.

### 4. Extract project info from `package.json`

Read `package.json` to get:
- `name` → `app.name`
- `version` → `app.version`
- `repository.url` or `repository` → `repo` (extract `owner/repo` format)

If `repository` is not set, ask the user for the GitHub `owner/repo`.

### 5. Insert integration code

Add the following to the entry point, wrapping the existing main logic:

```typescript
import { createReporter } from '@cluvo/sdk'

const cluvo = createReporter({
  repo: '<owner>/<repo>',
  app: { name: '<name>', version: '<version>' },
})

await cluvo.wrapCommand(async () => {
  // ... existing entry point code ...
})
```

**Important notes:**
- `wrapCommand` catches errors, runs the sanitize → prompt → submit pipeline, then **re-throws** the original error so the process exits normally with an error code.
- Preserve existing imports and module structure. Only wrap the main execution logic.
- If the entry point uses CommonJS (`require`), use `require('@cluvo/sdk')` instead.

### 6. Completion message

After successful integration, inform the user:

> Cluvo basic setup complete. Errors thrown inside `wrapCommand` will now be
> captured, sanitized, and presented to users as GitHub issue drafts.
>
> **Next steps:**
> - To add error reporting at specific try/catch locations → use `/cluvo-find-handlers`
> - To customize sanitize rules, labels, or issue format → use `/cluvo-custom-config`

## API Reference

### `createReporter(config): Reporter`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo` | `string` | Yes | GitHub `owner/repo` |
| `app.name` | `string` | Yes | Application name |
| `app.version` | `string` | Yes | Application version |
| `app.gitSha` | `string` | No | Git commit SHA |

### `reporter.wrapCommand(fn): Promise<void>`

Wraps an async function. On error: capture → sanitize → prompt user → submit to GitHub. Re-throws the original error after handling.

### `reporter.installGlobalHandlers(): () => void`

Registers `uncaughtException` and `unhandledRejection` listeners. Returns an unsubscribe function.
```

- [ ] **Step 3: Verify the skill file is valid**

```bash
# Check frontmatter is valid YAML
head -10 .claude/skills/cluvo-setup/SKILL.md
# Verify file exists and has content
wc -l .claude/skills/cluvo-setup/SKILL.md
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/cluvo-setup/SKILL.md
git commit -m "feat: add cluvo-setup skill for basic SDK integration"
```

---

### Task 2: Create `cluvo-find-handlers` skill

**Files:**
- Create: `.claude/skills/cluvo-find-handlers/SKILL.md`

- [ ] **Step 1: Create skill directory**

```bash
mkdir -p .claude/skills/cluvo-find-handlers
```

- [ ] **Step 2: Write the `cluvo-find-handlers` skill**

Create `.claude/skills/cluvo-find-handlers/SKILL.md` with the following content:

```markdown
---
name: cluvo-find-handlers
description: |
  Analyze a project's codebase to find error handling locations (try/catch,
  process error handlers, throw/reject sites) and apply the appropriate
  Cluvo API level (manual reportError, installGlobalHandlers, or low-level
  pipeline) at each location.
  TRIGGER when: user asks to "find error handlers for cluvo", "cluvo 수동 연동",
  "apply reportError", "에러 핸들링 위치 찾아줘", "cluvo-find-handlers".
---

# Cluvo Find Handlers

Scan the project for error handling locations and wire up Cluvo at the right level.

## Prerequisites

Check that `@cluvo/sdk` is installed (look for it in `package.json` dependencies). If not installed, tell the user:

> `@cluvo/sdk` is not installed. Run `/cluvo-setup` first to install and set up basic integration.

Then stop.

## Steps

### 1. Locate existing Cluvo reporter instance

Search for `createReporter` in the codebase to find the existing reporter instance and its variable name (e.g., `cluvo`, `reporter`). If not found, tell the user to run `/cluvo-setup` first.

### 2. Scan for error handling locations

Search the project source files for these patterns:

**Category A — Existing try/catch blocks:**
- `try { ... } catch` blocks that handle errors but don't report them to Cluvo
- Especially in command handlers, API routes, or service entry points

**Category B — Process-level error handlers:**
- `process.on('uncaughtException', ...)`
- `process.on('unhandledRejection', ...)`
- Check if these exist. If not, note their absence.

**Category C — Throw/reject sites:**
- Functions that `throw` custom errors or call `Promise.reject`
- These indicate where errors originate (useful context, not direct integration points)

### 3. Recommend integration level for each location

Present findings to the user as a table:

| Location | Category | Recommendation |
|----------|----------|---------------|
| `src/commands/deploy.ts:45` | try/catch | `reportError` + `promptAndSubmit` |
| (global) | No global handler | `installGlobalHandlers()` |
| `src/api/client.ts:89` | try/catch (pipeline) | Low-level API |

**Decision rules:**
- **try/catch in command handlers or top-level operations** → Manual level (`reportError` + `promptAndSubmit`)
- **No global error handlers exist** → Recommend `installGlobalHandlers()` at app startup
- **try/catch where the caller needs fine-grained control** (e.g., retry logic, custom formatting, conditional reporting) → Low-level pipeline

### 4. Apply with user confirmation

For each recommended location, show the code change and ask the user to confirm before applying.

#### Manual Level Pattern

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

#### Global Handlers Pattern

```typescript
// At app startup, after createReporter
const unsubscribe = cluvo.installGlobalHandlers()
```

#### Low-Level Pipeline Pattern

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

### 5. Completion message

> Error handler integration complete. Cluvo will now capture errors at the
> configured locations.
>
> **Next step:**
> - To customize sanitize rules, labels, or issue format → use `/cluvo-custom-config`

## API Reference

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

### Low-Level Methods

| Method | Description |
|--------|-------------|
| `buildReport(error, context?)` | Collect error + environment + command info |
| `sanitizeReport(report)` | Apply sanitize rules, returns new report |
| `findMatches(report)` | Search GitHub for duplicate issues |
| `buildDraft(report)` | Generate markdown title + body |
| `publish(draft)` | Submit via browser/gh/api/file |
```

- [ ] **Step 3: Verify the skill file**

```bash
head -10 .claude/skills/cluvo-find-handlers/SKILL.md
wc -l .claude/skills/cluvo-find-handlers/SKILL.md
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/cluvo-find-handlers/SKILL.md
git commit -m "feat: add cluvo-find-handlers skill for error handler discovery"
```

---

### Task 3: Create `cluvo-custom-config` skill

**Files:**
- Create: `.claude/skills/cluvo-custom-config/SKILL.md`

- [ ] **Step 1: Create skill directory**

```bash
mkdir -p .claude/skills/cluvo-custom-config
```

- [ ] **Step 2: Write the `cluvo-custom-config` skill**

Create `.claude/skills/cluvo-custom-config/SKILL.md` with the following content:

```markdown
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
```

- [ ] **Step 3: Verify the skill file**

```bash
head -10 .claude/skills/cluvo-custom-config/SKILL.md
wc -l .claude/skills/cluvo-custom-config/SKILL.md
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/cluvo-custom-config/SKILL.md
git commit -m "feat: add cluvo-custom-config skill for config customization"
```

---

### Task 4: Final verification and commit

**Files:**
- Verify: `.claude/skills/cluvo-setup/SKILL.md`
- Verify: `.claude/skills/cluvo-find-handlers/SKILL.md`
- Verify: `.claude/skills/cluvo-custom-config/SKILL.md`

- [ ] **Step 1: Verify all 3 skill files exist**

```bash
ls -la .claude/skills/*/SKILL.md
```

Expected: 3 files listed.

- [ ] **Step 2: Verify frontmatter is parseable**

```bash
# Check each file starts with --- and has name/description fields
for f in .claude/skills/*/SKILL.md; do
  echo "=== $f ==="
  head -8 "$f"
  echo
done
```

- [ ] **Step 3: Verify cross-references**

Check that:
- `cluvo-setup` mentions `/cluvo-find-handlers` in its completion message
- `cluvo-find-handlers` mentions `/cluvo-custom-config` in its completion message
- `cluvo-find-handlers` mentions `/cluvo-setup` in its prerequisite check

```bash
grep -n "cluvo-find-handlers" .claude/skills/cluvo-setup/SKILL.md
grep -n "cluvo-custom-config" .claude/skills/cluvo-find-handlers/SKILL.md
grep -n "cluvo-setup" .claude/skills/cluvo-find-handlers/SKILL.md
```
