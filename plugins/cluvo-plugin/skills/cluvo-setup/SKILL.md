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

### 5. Determine project type and choose pattern

| Project Type | Preset | Integration Pattern |
|-------------|--------|-------------------|
| CLI tool (has `bin` field) | `'cli'` (default) | `wrapCommand` or `wrap` |
| SDK/library | `'sdk'` | `wrap` with `rethrow: false` |

### 6. Insert integration code

**For CLI tools** (default — `preset: 'cli'`):

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

**For SDK/library projects** (`preset: 'sdk'`):

```typescript
import { createReporter } from '@cluvo/sdk'

const cluvo = createReporter({
  repo: '<owner>/<repo>',
  app: { name: '<name>', version: '<version>' },
  preset: 'sdk',
})

export async function riskyOperation() {
  await cluvo.wrap(async () => {
    // ... operation logic ...
  }, { rethrow: false })
}
```

**Important notes:**
- `wrapCommand` catches errors, extracts `process.argv` context, runs the sanitize → prompt → submit pipeline, then **re-throws** the original error (unless `{ rethrow: false }` is passed).
- `wrap` is like `wrapCommand` but without CLI-specific `process.argv` context extraction.
- The `'sdk'` preset disables interactive prompting and argv collection — errors are stored locally and can be forwarded to a parent CLI reporter via the registry.
- Preserve existing imports and module structure. Only wrap the main execution logic.
- If the entry point uses CommonJS (`require`), use `require('@cluvo/sdk')` instead.

### 7. Completion message

After successful integration, inform the user:

> Cluvo basic setup complete. Errors thrown inside `wrapCommand` will now be
> captured, sanitized, and presented to users as GitHub issue drafts.
>
> **Next steps:**
> - To add error reporting at specific try/catch locations → use `/cluvo-find-handlers`
> - To customize sanitize rules, labels, or issue format → use `/cluvo-custom-config`

## API Reference

Read [references/sdk-api.md](references/sdk-api.md) for the full `createReporter` and `Reporter` API.
