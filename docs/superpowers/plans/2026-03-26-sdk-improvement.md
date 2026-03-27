# SDK Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Cluvo from a CLI-only SDK to support CLI, SDK/library, and TUI environments by adding presenter adapters, presets, a global reporter registry, and new convenience APIs.

**Architecture:** Layered approach: core stays environment-agnostic with new types, SDK layer gets presets, presenter adapter, global registry, and new API methods. Built-in terminal presenter moves from core to SDK with TUI fallback.

**Tech Stack:** TypeScript (ES2022), Bun test runner, Bun workspaces monorepo

**Spec:** `docs/superpowers/specs/2026-03-26-sdk-improvement-design.md`

---

## File Map

### Core Package (`packages/core`)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types.ts` | Modify | Add `PresenterAdapter`, `PromptContext`, `PresenterAction` (discriminated union), `'prompted'` status, `WrapOptions`, `ExitHandlerOptions`, preset type |
| `src/collector/collect-environment.ts` | Modify | Fix Bun runtime version detection |
| `src/presenter/interactive.ts` | Modify | Remove old `PresenterAction` interface (moved to types.ts), update `promptUser` to use new types. No TerminalPresenter class here (that lives in SDK). |
| `src/index.ts` | Modify | Export new types |
| `test/collector.test.ts` | Modify | Add Bun version detection tests |
| `test/sections.test.ts` | Modify | Add Bun runtime format test |

### SDK Package (`packages/sdk`)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/config.ts` | Modify | Add preset resolution logic, `presenter` field, `childPolicy` field |
| `src/reporter.ts` | Modify | Add `reportAndPrompt`, `wrap`, `installExitHandler`, `receiveChildReport`, integrate presenter adapter, error dedup via WeakSet, prompt queue |
| `src/registry.ts` | Create | Global reporter registry with `Symbol.for`, register/unregister/getParent |
| `src/terminal-presenter.ts` | Create | Built-in TerminalPresenter with original stdout/stdin capture and TUI fallback |
| `src/exit-handler.ts` | Create | `beforeExit` handler + optional `process.exit` monkey-patch |
| `src/presets.ts` | Create | CLI and SDK preset definitions |
| `src/index.ts` | Modify | Export new types and functions |
| `test/reporter.test.ts` | Modify | Tests for new API methods, presenter adapter integration, error dedup |
| `test/registry.test.ts` | Create | Registry tests: register, unregister, parent lookup, childPolicy, Symbol.for |
| `test/terminal-presenter.test.ts` | Create | Terminal presenter tests: normal mode, TUI fallback, non-TTY |
| `test/exit-handler.test.ts` | Create | Exit handler tests: beforeExit, process.exit patch, timeout, cleanup |
| `test/presets.test.ts` | Create | Preset resolution tests: CLI defaults, SDK defaults, overrides |
| `test/integration.test.ts` | Modify | E2E tests for nested reporters, pubm pattern, dedup |

### Documentation

| File | Action | Responsibility |
|------|--------|----------------|
| `README.md` | Modify | Add SDK/TUI guides, new API docs, preset docs, nested usage |
| `ARCHITECTURE.md` | Modify | Update presenter system, SDK architecture, integration patterns |
| `CLAUDE.md` | Modify | Add presenter adapter mention to pipeline description |

---

## Task 1: Fix Runtime Version Detection (Core)

**Files:**
- Modify: `packages/core/src/collector/collect-environment.ts:8`
- Test: `packages/core/test/collector.test.ts`
- Test: `packages/core/test/sections.test.ts`

- [ ] **Step 1: Write failing test for Bun version detection**

In `packages/core/test/collector.test.ts`, add inside the existing `describe('collectEnvironment')`:

```ts
test('uses Bun.version when running under Bun', () => {
	// In Bun environment, Bun global exists and Bun.version returns the actual Bun version
	// Since we ARE running under Bun, collectEnvironment should return Bun.version
	const env = collectEnvironment()
	if (typeof globalThis.Bun !== 'undefined') {
		expect(env.runtimeVersion).toBe(Bun.version)
		expect(env.runtimeVersion).not.toMatch(/^v/) // Bun.version has no 'v' prefix
	} else {
		expect(env.runtimeVersion).toBe(process.version)
		expect(env.runtimeVersion).toMatch(/^v/) // Node process.version has 'v' prefix
	}
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/test/collector.test.ts --test-name-pattern="Bun.version"`
Expected: FAIL — current code always returns `process.version` which is `v24.x.x` even in Bun

- [ ] **Step 3: Fix collect-environment.ts**

In `packages/core/src/collector/collect-environment.ts`, change line 8:

```ts
// Before:
runtimeVersion: process.version,

// After:
runtimeVersion: typeof Bun !== 'undefined' ? Bun.version : process.version,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/core/test/collector.test.ts --test-name-pattern="Bun.version"`
Expected: PASS

- [ ] **Step 5: Add format output test for Bun runtime**

In `packages/core/test/sections.test.ts`, add inside `describe('environment')`:

```ts
test('formats Bun runtime without v prefix', () => {
	const report = makeReport({
		app: { name: 'test', version: '1.0.0', runtime: 'bun' },
		environment: { os: 'darwin', arch: 'arm64', runtimeVersion: '1.1.0' },
	})
	const result = SECTION_RENDERERS.environment(report)
	expect(result).toContain('| Runtime | bun 1.1.0 |')
})

test('formats Node runtime with v prefix', () => {
	const report = makeReport({
		app: { name: 'test', version: '1.0.0', runtime: 'node' },
		environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v22.0.0' },
	})
	const result = SECTION_RENDERERS.environment(report)
	expect(result).toContain('| Runtime | node v22.0.0 |')
})
```

- [ ] **Step 6: Run all format tests**

Run: `bun test packages/core/test/sections.test.ts`
Expected: PASS (these test the display format which doesn't need code changes — it already renders `${runtime} ${runtimeVersion}`)

- [ ] **Step 7: Run full core test suite to check no regressions**

Run: `bun test packages/core/`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/collector/collect-environment.ts packages/core/test/collector.test.ts packages/core/test/sections.test.ts
git commit -m "fix: use Bun.version instead of process.version in Bun runtime"
```

---

## Task 2: Add New Types to Core + Refactor Presenter (Types Foundation)

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/presenter/interactive.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/interactive.test.ts`

**IMPORTANT:** This task adds new types to `types.ts` AND removes the old `PresenterAction` interface from `interactive.ts` in the same commit to avoid duplicate export conflicts.

- [ ] **Step 1: Add PresenterAdapter and related types to types.ts**

In `packages/core/src/types.ts`, add before the `export function generateReportId()`:

```ts
// === Presenter Adapter ===

export interface PresenterAdapter {
	prompt(context: PromptContext): Promise<PresenterAction | null>
}

export interface PromptContext {
	report: ErrorReport
	draft: DraftPayload
	authAvailable: boolean
	promptMessage?: string
	branding?: { showName?: boolean }
}

export type PresenterAction =
	| { type: 'open' }
	| { type: 'gh' }
	| { type: 'view'; issue: ExistingIssue }
	| { type: 'react'; issue: ExistingIssue }
	| { type: 'save' }
	| { type: 'cancel' }

// === Options ===

export interface WrapOptions {
	rethrow?: boolean
}

export interface ExitHandlerOptions {
	interceptProcessExit?: boolean
	timeout?: number
}

export type Preset = 'cli' | 'sdk'

export type ChildPolicy = 'absorb' | 'passthrough' | 'silent'
```

- [ ] **Step 2: Add 'prompted' to ErrorReport status**

In `packages/core/src/types.ts`, change line 18:

```ts
// Before:
status: 'pending' | 'submitted' | 'dismissed'

// After:
status: 'pending' | 'prompted' | 'submitted' | 'dismissed'
```

- [ ] **Step 3: Add preset, presenter, childPolicy to ReporterConfig**

In `packages/core/src/types.ts`, add fields to `ReporterConfig`:

```ts
export interface ReporterConfig {
	repo: string
	app: { name: string; version: string; gitSha?: string }
	preset?: Preset
	presenter?: PresenterAdapter | null
	childPolicy?: ChildPolicy
	mode?: ReporterMode
	// ... (rest remains unchanged)
}
```

- [ ] **Step 4: Remove old PresenterAction from interactive.ts**

In `packages/core/src/presenter/interactive.ts`, remove the old `PresenterAction` interface (lines 4-7):

```ts
// REMOVE this:
export interface PresenterAction {
	type: 'view' | 'react' | 'open' | 'gh' | 'save' | 'cancel'
	issue?: ExistingIssue
}
```

Import it from types.ts instead:

```ts
import type { DraftPayload, ErrorReport, ExistingIssue, PresenterAction, ReporterConfig } from '../types.js'
```

The `promptUser` function signature and body remain unchanged. It still uses `process.stdout`/`process.stdin` directly. **No TerminalPresenter class in core** (that class lives in the SDK, Task 7).

Update `view` and `react` return values to include guard checks:

```ts
case 'v': {
	const issue = report.matches?.[0]
	return issue ? { type: 'view', issue } : await promptAction(report, draft, authAvailable)
}
case 'r': {
	const issue = report.matches?.[0]
	return issue ? { type: 'react', issue } : await promptAction(report, draft, authAvailable)
}
```

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS — no duplicate exports, new types are additive

- [ ] **Step 6: Run all core and SDK tests**

Run: `bun test packages/core/ && bun test packages/sdk/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/presenter/interactive.ts
git commit -m "feat(core): add PresenterAdapter types, move PresenterAction to discriminated union in types.ts"
```

---

## Task 3: Preset System (SDK)

**Files:**
- Create: `packages/sdk/src/presets.ts`
- Modify: `packages/sdk/src/config.ts`
- Create: `packages/sdk/test/presets.test.ts`

- [ ] **Step 1: Write failing preset tests**

Create `packages/sdk/test/presets.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { resolveConfig } from '../src/config.js'
import type { InternalConfig } from '../src/config.js'

describe('presets', () => {
	const base: InternalConfig = {
		repo: 'owner/repo',
		app: { name: 'test', version: '1.0.0' },
	}

	test('cli preset sets argv collection, auto interactive', () => {
		const config = resolveConfig({ ...base, preset: 'cli' })
		expect(config.collect?.argv).toBe(true)
		expect(config.interactive).toBe('auto')
	})

	test('sdk preset disables argv, sets interactive to never', () => {
		const config = resolveConfig({ ...base, preset: 'sdk' })
		expect(config.collect?.argv).toBe(false)
		expect(config.interactive).toBe('never')
	})

	test('no preset defaults to cli behavior', () => {
		const config = resolveConfig(base)
		expect(config.collect?.argv).toBe(true)
		expect(config.interactive).toBe('auto')
	})

	test('preset values can be overridden', () => {
		const config = resolveConfig({ ...base, preset: 'sdk', interactive: 'auto' })
		expect(config.interactive).toBe('auto')
		expect(config.collect?.argv).toBe(false) // rest of sdk preset intact
	})

	test('sdk preset excludes command from default sections', () => {
		const config = resolveConfig({ ...base, preset: 'sdk' })
		expect(config.issue?.sections).not.toContain('command')
	})

	test('cli preset includes command in default sections', () => {
		const config = resolveConfig({ ...base, preset: 'cli' })
		const sections = config.issue?.sections
		expect(sections).toContain('command')
	})

	test('formatTitle omits command prefix when no command context (SDK preset)', () => {
		// SDK preset disables argv collection, so no command context exists.
		// The existing formatTitle in core already conditionally adds [command] prefix
		// only when report.command?.command is present. This test verifies the implicit behavior.
		const { formatTitle } = require('@cluvo/core')
		const report = {
			error: { name: 'Error', message: 'test' },
			command: undefined, // no command context in SDK preset
		}
		const title = formatTitle(report)
		expect(title).toBe('Error: test')
		expect(title).not.toMatch(/^\[/)
	})

	test('formatTitle includes command prefix when command context exists (CLI preset)', () => {
		const { formatTitle } = require('@cluvo/core')
		const report = {
			error: { name: 'Error', message: 'test' },
			command: { command: 'deploy' },
		}
		const title = formatTitle(report)
		expect(title).toBe('[deploy] Error: test')
	})
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/sdk/test/presets.test.ts`
Expected: FAIL — preset field not recognized yet

- [ ] **Step 3: Create presets.ts**

Create `packages/sdk/src/presets.ts`:

```ts
import type { ReporterConfig } from '@cluvo/core'

type PresetDefaults = Partial<
	Pick<ReporterConfig, 'interactive' | 'collect' | 'issue'>
> & { presenter: 'terminal' | null }

const CLI_SECTIONS = ['summary', 'environment', 'command', 'stackTrace', 'causeChain', 'sanitizedNotice']
const SDK_SECTIONS = ['summary', 'environment', 'stackTrace', 'causeChain', 'sanitizedNotice']

export const PRESETS: Record<string, PresetDefaults> = {
	cli: {
		interactive: 'auto',
		collect: { argv: true },
		issue: { sections: CLI_SECTIONS },
		presenter: 'terminal',
	},
	sdk: {
		interactive: 'never',
		collect: { argv: false },
		issue: { sections: SDK_SECTIONS },
		presenter: null,
	},
}
```

- [ ] **Step 4: Update config.ts to apply presets**

In `packages/sdk/src/config.ts`, integrate preset resolution:

```ts
import { join } from 'node:path'
import type { ReporterConfig } from '@cluvo/core'
import { PRESETS } from './presets.js'

export interface InternalConfig extends ReporterConfig {
	_storeDir?: string
}

export function resolveConfig(
	config: InternalConfig,
): Required<Pick<ReporterConfig, 'mode' | 'interactive' | 'nonInteractive'>> &
	InternalConfig & { storeDir: string } {
	const presetName = config.preset ?? 'cli'
	const preset = PRESETS[presetName]

	return {
		...config,
		mode: config.mode ?? 'browser',
		interactive: config.interactive ?? preset?.interactive ?? 'auto',
		nonInteractive: config.nonInteractive ?? 'save',
		storeDir: config._storeDir ?? join(process.env.HOME || '.', '.cluvo'),
		collect: {
			argv: preset?.collect?.argv ?? true,
			diagnosticReport: false,
			configSummary: false,
			envinfo: true,
			...config.collect,
		},
		store: { enabled: true, maxReports: 100, ...config.store },
		sanitize: { enabled: true, ...config.sanitize },
		dedupe: { enabled: true, searchDiscussions: false, ...config.dedupe },
		branding: { showName: false, ...config.branding },
		issue: {
			...config.issue,
			sections: config.issue?.sections ?? preset?.issue?.sections,
		},
	}
}
```

- [ ] **Step 5: Run preset tests**

Run: `bun test packages/sdk/test/presets.test.ts`
Expected: PASS

- [ ] **Step 6: Run full SDK test suite**

Run: `bun test packages/sdk/`
Expected: PASS — existing tests should still work since default is 'cli' preset

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/presets.ts packages/sdk/src/config.ts packages/sdk/test/presets.test.ts
git commit -m "feat(sdk): add cli/sdk preset system for environment-specific defaults"
```

---

## Task 4: Global Reporter Registry (SDK)

**Files:**
- Create: `packages/sdk/src/registry.ts`
- Create: `packages/sdk/test/registry.test.ts`

- [ ] **Step 1: Write failing registry tests**

Create `packages/sdk/test/registry.test.ts`:

```ts
import { afterEach, describe, expect, test } from 'bun:test'
import { getRegistry, resetRegistry } from '../src/registry.js'
import type { Reporter } from '../src/reporter.js'

function fakeReporter(): Reporter {
	return {
		reportError: async () => ({} as any),
		reportAndPrompt: async () => {},
		promptAndSubmit: async () => {},
		wrap: async () => {},
		wrapCommand: async () => {},
		installGlobalHandlers: () => () => {},
		installExitHandler: () => () => {},
		buildReport: () => ({} as any),
		sanitizeReport: (r: any) => r,
		findMatches: async () => ({ found: false, matches: [] }),
		buildDraft: () => ({ title: '', body: '' }),
		publish: async () => ({ method: 'file' as const }),
		receiveChildReport: async () => {},
	}
}

describe('ReporterRegistry', () => {
	afterEach(() => resetRegistry())

	test('registers a reporter and retrieves it', () => {
		const registry = getRegistry()
		const reporter = fakeReporter()
		registry.register({ id: 'a', reporter, childPolicy: 'absorb' })
		expect(registry.stack).toHaveLength(1)
	})

	test('getParent returns null for first registered reporter', () => {
		const registry = getRegistry()
		const entry = { id: 'a', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(entry)
		expect(registry.getParent(entry)).toBeNull()
	})

	test('getParent returns parent when child registers after parent (implicit)', () => {
		const registry = getRegistry()
		const parent = { id: 'a', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const child = { id: 'b', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(parent)
		registry.register(child)
		expect(registry.getParent(child)?.id).toBe('a')
	})

	test('getParent uses explicit parentId', () => {
		const registry = getRegistry()
		const a = { id: 'a', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const b = { id: 'b', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const c = { id: 'c', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(a)
		registry.register(b)
		registry.register(c, 'a') // c's parent is a, not b
		expect(registry.getParent(c)?.id).toBe('a')
	})

	test('unregister removes reporter from stack', () => {
		const registry = getRegistry()
		registry.register({ id: 'a', reporter: fakeReporter(), childPolicy: 'absorb' })
		registry.register({ id: 'b', reporter: fakeReporter(), childPolicy: 'absorb' })
		registry.unregister('a')
		expect(registry.stack).toHaveLength(1)
		expect(registry.stack[0].id).toBe('b')
	})

	test('getParent returns null after parent is unregistered', () => {
		const registry = getRegistry()
		const parent = { id: 'a', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const child = { id: 'b', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(parent)
		registry.register(child)
		registry.unregister('a')
		expect(registry.getParent(child)).toBeNull()
	})

	test('Symbol.for ensures same registry across calls', () => {
		const r1 = getRegistry()
		const r2 = getRegistry()
		expect(r1).toBe(r2)
	})
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/sdk/test/registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement registry.ts**

Create `packages/sdk/src/registry.ts`:

```ts
// NOTE: Do NOT import Reporter from ./reporter.js to avoid circular dependency.
// Use a minimal interface instead.

export interface RegisteredReporter {
	id: string
	reporter: { receiveChildReport(report: import('@cluvo/core').ErrorReport): Promise<void> }
	childPolicy: 'absorb' | 'passthrough' | 'silent'
}

interface ReporterRegistry {
	stack: RegisteredReporter[]
	parentMap: Map<string, string> // childId -> parentId
	register(entry: RegisteredReporter, parentId?: string): void
	unregister(id: string): void
	getParent(entry: RegisteredReporter): RegisteredReporter | null
}

const REGISTRY_KEY = Symbol.for('cluvo.registry')

function createRegistry(): ReporterRegistry {
	const stack: RegisteredReporter[] = []
	const parentMap = new Map<string, string>()

	return {
		stack,
		parentMap,

		register(entry: RegisteredReporter, parentId?: string) {
			stack.push(entry)
			if (parentId) {
				parentMap.set(entry.id, parentId)
			} else if (stack.length > 1) {
				// Implicit: parent is the previously registered reporter
				parentMap.set(entry.id, stack[stack.length - 2].id)
			}
		},

		unregister(id: string) {
			const idx = stack.findIndex((e) => e.id === id)
			if (idx !== -1) stack.splice(idx, 1)
			parentMap.delete(id)
			// Clean up children that pointed to this parent
			for (const [childId, pid] of parentMap) {
				if (pid === id) parentMap.delete(childId)
			}
		},

		getParent(entry: RegisteredReporter): RegisteredReporter | null {
			const parentId = parentMap.get(entry.id)
			if (!parentId) return null
			return stack.find((e) => e.id === parentId) ?? null
		},
	}
}

export function getRegistry(): ReporterRegistry {
	const g = globalThis as Record<symbol, ReporterRegistry>
	if (!g[REGISTRY_KEY]) {
		g[REGISTRY_KEY] = createRegistry()
	}
	return g[REGISTRY_KEY]
}

// For testing only
export function resetRegistry(): void {
	const g = globalThis as Record<symbol, ReporterRegistry>
	delete g[REGISTRY_KEY]
}
```

- [ ] **Step 4: Run registry tests**

Run: `bun test packages/sdk/test/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/registry.ts packages/sdk/test/registry.test.ts
git commit -m "feat(sdk): add global reporter registry with Symbol.for cross-package sharing"
```

---

## Task 5: Exit Handler (SDK)

**Files:**
- Create: `packages/sdk/src/exit-handler.ts`
- Create: `packages/sdk/test/exit-handler.test.ts`

- [ ] **Step 1: Write failing exit handler tests**

Create `packages/sdk/test/exit-handler.test.ts`:

```ts
import { afterEach, describe, expect, mock, test } from 'bun:test'
import { createExitHandler } from '../src/exit-handler.js'

describe('createExitHandler', () => {
	let listeners: Map<string, Function[]>
	let originalExit: typeof process.exit

	afterEach(() => {
		// Restore any patched process.exit
		if (originalExit) process.exit = originalExit
		// Remove any listeners we added
		process.removeAllListeners('beforeExit')
	})

	test('registers beforeExit listener', () => {
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({ getPendingReports: async () => [], onPending })
		expect(typeof cleanup).toBe('function')
		cleanup()
	})

	test('calls onPending when pending reports exist at beforeExit', async () => {
		const pendingReport = { id: 'test-1', status: 'pending' as const }
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({
			getPendingReports: async () => [pendingReport as any],
			onPending,
		})

		// Simulate beforeExit
		process.emit('beforeExit', 0)
		// Give async handler time to run
		await new Promise((r) => setTimeout(r, 50))

		expect(onPending).toHaveBeenCalledWith([pendingReport])
		cleanup()
	})

	test('does not call onPending when no pending reports', async () => {
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({
			getPendingReports: async () => [],
			onPending,
		})

		process.emit('beforeExit', 0)
		await new Promise((r) => setTimeout(r, 50))

		expect(onPending).not.toHaveBeenCalled()
		cleanup()
	})

	test('cleanup removes listener', () => {
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({
			getPendingReports: async () => [],
			onPending,
		})
		const before = process.listenerCount('beforeExit')
		cleanup()
		const after = process.listenerCount('beforeExit')
		expect(after).toBeLessThan(before)
	})

	test('interceptProcessExit patches process.exit', () => {
		originalExit = process.exit
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({
			getPendingReports: async () => [],
			onPending,
			interceptProcessExit: true,
		})
		expect(process.exit).not.toBe(originalExit)
		cleanup()
		expect(process.exit).toBe(originalExit)
	})
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/sdk/test/exit-handler.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement exit-handler.ts**

Create `packages/sdk/src/exit-handler.ts`:

```ts
import type { ErrorReport } from '@cluvo/core'

interface ExitHandlerConfig {
	getPendingReports: () => Promise<ErrorReport[]>
	onPending: (reports: ErrorReport[]) => Promise<void>
	interceptProcessExit?: boolean
	timeout?: number
}

export function createExitHandler(config: ExitHandlerConfig): () => void {
	const timeout = config.timeout ?? 30_000
	let handling = false

	const beforeExitHandler = async () => {
		if (handling) return
		handling = true
		try {
			const pending = await config.getPendingReports()
			if (pending.length > 0) {
				await Promise.race([
					config.onPending(pending),
					new Promise<void>((resolve) => setTimeout(resolve, timeout)),
				])
			}
		} finally {
			handling = false
		}
	}

	process.on('beforeExit', beforeExitHandler)

	let originalExit: typeof process.exit | undefined

	if (config.interceptProcessExit) {
		originalExit = process.exit

		process.exit = ((code?: number) => {
			const exitCode = code ?? process.exitCode ?? 0

			config.getPendingReports().then(async (pending) => {
				if (pending.length > 0) {
					await Promise.race([
						config.onPending(pending),
						new Promise<void>((resolve) => setTimeout(resolve, timeout)),
					])
				}
				originalExit!(exitCode as any)
			}).catch(() => {
				originalExit!(exitCode as any)
			})
		}) as typeof process.exit
	}

	return () => {
		process.removeListener('beforeExit', beforeExitHandler)
		if (originalExit) {
			process.exit = originalExit
			originalExit = undefined
		}
	}
}
```

- [ ] **Step 4: Run exit handler tests**

Run: `bun test packages/sdk/test/exit-handler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/exit-handler.ts packages/sdk/test/exit-handler.test.ts
git commit -m "feat(sdk): add exit handler with beforeExit and optional process.exit interception"
```

---

## Task 6: Terminal Presenter with TUI Fallback (SDK)

**Files:**
- Create: `packages/sdk/src/terminal-presenter.ts`
- Create: `packages/sdk/test/terminal-presenter.test.ts`

- [ ] **Step 1: Write failing terminal presenter tests**

Create `packages/sdk/test/terminal-presenter.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { PromptContext } from '@cluvo/core'

// We need to test the module-level capture of original stdout
// Import after potential patches to verify capture timing

describe('TerminalPresenter', () => {
	function makeContext(overrides: Partial<PromptContext> = {}): PromptContext {
		return {
			report: {
				id: 'test-id',
				createdAt: new Date().toISOString(),
				app: { name: 'test', version: '1.0.0', runtime: 'node' },
				error: { name: 'Error', message: 'test error' },
				environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v22.0.0' },
				sanitizedFields: [],
				status: 'pending',
			},
			draft: { title: 'Error: test error', body: '## Summary\n\ntest error' },
			authAvailable: false,
			...overrides,
		}
	}

	test('returns null in non-TTY environment', async () => {
		const { TerminalPresenter } = await import('../src/terminal-presenter.js')
		const presenter = new TerminalPresenter()
		// In test environment, stdout is typically not a TTY
		const result = await presenter.prompt(makeContext())
		expect(result).toBeNull()
	})

	test('captures original stdout.write at module load time', async () => {
		const { getOriginalStdoutWrite } = await import('../src/terminal-presenter.js')
		const original = getOriginalStdoutWrite()
		expect(typeof original).toBe('function')
	})

	test('detects patched stdout.write', async () => {
		const { isStdoutPatched } = await import('../src/terminal-presenter.js')
		expect(isStdoutPatched()).toBe(false)

		const original = process.stdout.write
		process.stdout.write = (() => true) as any
		expect(isStdoutPatched()).toBe(true)
		process.stdout.write = original
	})
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/sdk/test/terminal-presenter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement terminal-presenter.ts**

Create `packages/sdk/src/terminal-presenter.ts`:

```ts
import type { PresenterAction, PresenterAdapter, PromptContext } from '@cluvo/core'
import { renderDetails, renderPromptMessage, renderSummary } from '@cluvo/core'

// Capture at module load time — before TUI frameworks can patch
const originalStdoutWriteRef = process.stdout.write // unbound, for comparison
const originalStdoutWrite = process.stdout.write.bind(process.stdout) // bound, for calling
const originalStdin = process.stdin

export function getOriginalStdoutWrite() {
	return originalStdoutWrite
}

export function isStdoutPatched(): boolean {
	return process.stdout.write !== originalStdoutWriteRef
}

export class TerminalPresenter implements PresenterAdapter {
	async prompt(context: PromptContext): Promise<PresenterAction | null> {
		if (!process.stdout.isTTY) return null

		const write = isStdoutPatched() ? originalStdoutWrite : process.stdout.write.bind(process.stdout)
		const stdin = originalStdin

		if (isStdoutPatched()) {
			// TUI fallback: move cursor to bottom of terminal
			const rows = process.stdout.rows || 24
			write(`\x1b[${rows};1H\x1b[2K`)
		}

		const message = renderPromptMessage(context.promptMessage, context.branding?.showName)
		write(`\n${message} `)

		const confirmed = await readYesNo(stdin, write)
		if (!confirmed) return null

		write(`\n${renderSummary(context.report, context.draft)}\n\n`)

		return await promptAction(context, stdin, write)
	}
}

type WriteFn = (chunk: string) => boolean

async function promptAction(
	context: PromptContext,
	stdin: typeof process.stdin,
	write: WriteFn,
): Promise<PresenterAction> {
	const hasMatches = (context.report.matches?.length ?? 0) > 0

	const options: string[] = []
	if (hasMatches) {
		options.push('[v] View similar issue')
		if (context.authAvailable) options.push('[r] React to issue')
	}
	options.push('[o] Open in browser')
	options.push('[g] Create via gh')
	options.push('[s] Save as markdown')
	options.push('[d] Details')
	options.push('[c] Cancel')

	write(`${options.join('  ')}\n`)

	const key = await readKey(stdin, write)

	switch (key) {
		case 'v': {
			const issue = context.report.matches?.[0]
			return issue ? { type: 'view', issue } : await promptAction(context, stdin, write)
		}
		case 'r': {
			const issue = context.report.matches?.[0]
			return issue ? { type: 'react', issue } : await promptAction(context, stdin, write)
		}
		case 'o':
			return { type: 'open' }
		case 'g':
			return { type: 'gh' }
		case 's':
			return { type: 'save' }
		case 'c':
			return { type: 'cancel' }
		case 'd': {
			write(`\n${renderDetails(context.draft)}\n\n`)
			return await promptAction(context, stdin, write)
		}
		default:
			return { type: 'cancel' }
	}
}

function readYesNo(stdin: typeof process.stdin, write: WriteFn): Promise<boolean> {
	return new Promise((resolve) => {
		if (!stdin.isTTY) {
			resolve(false)
			return
		}
		stdin.setRawMode(true)
		stdin.resume()
		stdin.once('data', (data) => {
			stdin.setRawMode(false)
			stdin.pause()
			const char = data.toString().trim().toLowerCase()
			write(char === 'n' ? 'n\n' : 'Y\n')
			resolve(char !== 'n')
		})
	})
}

function readKey(stdin: typeof process.stdin, write: WriteFn): Promise<string> {
	return new Promise((resolve) => {
		stdin.setRawMode(true)
		stdin.resume()
		stdin.once('data', (data) => {
			stdin.setRawMode(false)
			stdin.pause()
			const char = data.toString().trim().toLowerCase()
			write(`${char}\n`)
			resolve(char)
		})
	})
}
```

- [ ] **Step 4: Verify core exports renderPromptMessage, renderSummary, renderDetails**

Check `packages/core/src/index.ts` already exports these from presenter. If not, add them.

- [ ] **Step 5: Run terminal presenter tests**

Run: `bun test packages/sdk/test/terminal-presenter.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/terminal-presenter.ts packages/sdk/test/terminal-presenter.test.ts
git commit -m "feat(sdk): add TerminalPresenter with TUI fallback via original stdout capture"
```

---

## Task 7: Update Reporter with New APIs (SDK)

**Files:**
- Modify: `packages/sdk/src/reporter.ts`
- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/test/reporter.test.ts`

This is the largest task. It integrates all previous components into the reporter.

- [ ] **Step 1: Write failing tests for new API methods**

Add to `packages/sdk/test/reporter.test.ts`:

```ts
test('reporter exposes new API methods', () => {
	const reporter = createReporter({
		repo: 'owner/repo',
		app: { name: 'test', version: '1.0.0' },
	})
	expect(reporter.reportAndPrompt).toBeInstanceOf(Function)
	expect(reporter.wrap).toBeInstanceOf(Function)
	expect(reporter.installExitHandler).toBeInstanceOf(Function)
	expect(reporter.receiveChildReport).toBeInstanceOf(Function)
})

test('reportAndPrompt collects and stores report in non-interactive mode', async () => {
	const reporter = createReporter({
		repo: 'owner/repo',
		app: { name: 'test', version: '1.0.0' },
		interactive: 'never',
		nonInteractive: 'silent',
		store: { enabled: true },
		dedupe: { enabled: false },
		_storeDir: storeDir,
	} satisfies InternalConfig)

	// Should not throw
	await reporter.reportAndPrompt(new Error('test'))
})

test('wrap catches error and reports it', async () => {
	const reporter = createReporter({
		repo: 'owner/repo',
		app: { name: 'test', version: '1.0.0' },
		interactive: 'never',
		nonInteractive: 'silent',
		store: { enabled: true },
		dedupe: { enabled: false },
		_storeDir: storeDir,
	} satisfies InternalConfig)

	// rethrow: true (default) — should re-throw
	await expect(
		reporter.wrap(async () => {
			throw new Error('wrapped')
		}),
	).rejects.toThrow('wrapped')
})

test('wrap with rethrow=false swallows error', async () => {
	const reporter = createReporter({
		repo: 'owner/repo',
		app: { name: 'test', version: '1.0.0' },
		interactive: 'never',
		nonInteractive: 'silent',
		store: { enabled: true },
		dedupe: { enabled: false },
		_storeDir: storeDir,
	} satisfies InternalConfig)

	// Should NOT throw
	await reporter.wrap(
		async () => {
			throw new Error('swallowed')
		},
		{ rethrow: false },
	)
})

test('wrap does nothing when function succeeds', async () => {
	const reporter = createReporter({
		repo: 'owner/repo',
		app: { name: 'test', version: '1.0.0' },
		store: { enabled: false },
	})

	await reporter.wrap(async () => {
		// success
	})
})

test('wrapCommand accepts WrapOptions', async () => {
	const reporter = createReporter({
		repo: 'owner/repo',
		app: { name: 'test', version: '1.0.0' },
		interactive: 'never',
		nonInteractive: 'silent',
		store: { enabled: false },
		dedupe: { enabled: false },
	})

	await reporter.wrapCommand(
		async () => {
			throw new Error('swallowed-cmd')
		},
		{ rethrow: false },
	)
})

test('duplicate error detection via WeakSet', async () => {
	const reporter = createReporter({
		repo: 'owner/repo',
		app: { name: 'dedup-test', version: '1.0.0' },
		store: { enabled: true },
		_storeDir: storeDir,
	} satisfies InternalConfig)

	const error = new Error('duplicate')
	const report1 = await reporter.reportError(error)
	const report2 = await reporter.reportError(error)
	expect(report1.id).toBe(report2.id) // Same report returned
})

test('receiveChildReport stores report', async () => {
	const reporter = createReporter({
		repo: 'owner/repo',
		app: { name: 'parent-test', version: '1.0.0' },
		interactive: 'never',
		nonInteractive: 'silent',
		store: { enabled: true },
		dedupe: { enabled: false },
		_storeDir: storeDir,
	} satisfies InternalConfig)

	const childReport = {
		id: 'child-1',
		createdAt: new Date().toISOString(),
		app: { name: 'child-lib', version: '0.1.0', runtime: 'node' },
		error: { name: 'Error', message: 'child error' },
		environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v22.0.0' },
		sanitizedFields: [],
		status: 'pending' as const,
	}

	await reporter.receiveChildReport(childReport)
	// Verify it was stored
	const { Store } = await import('@cluvo/core')
	const store = new Store(storeDir)
	const loaded = await store.load('child-lib', 'child-1')
	expect(loaded).not.toBeNull()
})

test('installExitHandler returns cleanup function', () => {
	const reporter = createReporter({
		repo: 'owner/repo',
		app: { name: 'test', version: '1.0.0' },
		store: { enabled: false },
	})

	const cleanup = reporter.installExitHandler()
	expect(typeof cleanup).toBe('function')
	cleanup()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/sdk/test/reporter.test.ts`
Expected: FAIL — new methods don't exist yet

- [ ] **Step 3: Rewrite reporter.ts with all new APIs**

Full rewrite of `packages/sdk/src/reporter.ts`:

The key changes:
1. Add `reportAndPrompt`: combines `reportError` + `promptAndSubmit`
2. Add `wrap(fn, opts?)`: try/catch + `reportAndPrompt` + optional rethrow
3. Update `wrapCommand` to accept `WrapOptions` and delegate to `wrap`
4. Add `installExitHandler`: delegates to `createExitHandler`
5. Add `receiveChildReport`: stores child report + optional prompt
6. Add error dedup via `WeakMap<object, ErrorReport>`
7. Integrate presenter adapter: use `config.presenter` or resolve from preset
8. Integrate registry: register on create, unregister on cleanup
9. Add prompt queue for serialization
10. Update `promptAndSubmit` to set `'prompted'` status

**Presenter resolution in createReporter:**
- If `config.presenter` is explicitly provided (including `null`), use it as-is
- If `config.presenter` is `undefined`, resolve from preset: CLI preset → `new TerminalPresenter()`, SDK preset → `null`
- `interactive` setting only affects the built-in TerminalPresenter (`'auto'` = TTY check, `'never'` = skip). Custom presenters ignore it.

Implementation notes for the developer:
- The `reportError` function should check `seenErrors` WeakMap first. If error is an object and was already seen, return the cached report.
- `promptAndSubmit` should update report status to `'prompted'` before showing prompt, and `'submitted'` on successful submit.
- `wrap(fn, opts)` should call `reportAndPrompt` in the catch block, then conditionally re-throw based on `opts.rethrow ?? true`.
- `wrapCommand(fn, opts)` should extract `process.argv` context and call `wrap` with that context.
- Registry integration: `createReporter` calls `registry.register()` and returns a cleanup function. When `reportAndPrompt` is called, check parent's `childPolicy`.
- Prompt queue: use a simple promise chain to serialize concurrent prompts.

```ts
// Key structural changes (not full file — developer should integrate):

// At top of file:
import { getRegistry, type RegisteredReporter } from './registry.js'
import { createExitHandler } from './exit-handler.js'
import { TerminalPresenter } from './terminal-presenter.js'
import { PRESETS } from './presets.js'

// Error dedup:
const seenErrors = new WeakMap<object, ErrorReport>()

// In reportError:
if (typeof error === 'object' && error !== null && seenErrors.has(error)) {
    return seenErrors.get(error)!
}
// ... after building report:
if (typeof error === 'object' && error !== null) {
    seenErrors.set(error, sanitized)
}

// Prompt queue:
let promptQueue = Promise.resolve()
function enqueuePrompt(fn: () => Promise<void>): Promise<void> {
    promptQueue = promptQueue.then(fn, fn)
    return promptQueue
}

// Reporter interface update:
export interface Reporter {
    reportError(error: unknown, context?: ErrorContext): Promise<ErrorReport>
    reportAndPrompt(error: unknown, context?: ErrorContext): Promise<void>
    promptAndSubmit(report: ErrorReport): Promise<void>
    wrap(fn: () => Promise<void>, opts?: WrapOptions): Promise<void>
    wrapCommand(fn: () => Promise<void>, opts?: WrapOptions): Promise<void>
    installGlobalHandlers(): () => void
    installExitHandler(opts?: ExitHandlerOptions): () => void
    buildReport(error: unknown, context?: ErrorContext): ErrorReport
    sanitizeReport(report: ErrorReport): ErrorReport
    findMatches(report: ErrorReport): Promise<MatchResult>
    buildDraft(report: ErrorReport): DraftPayload
    publish(draft: DraftPayload): Promise<PublishResult>
    receiveChildReport(report: ErrorReport): Promise<void>
}
```

- [ ] **Step 4: Run tests**

Run: `bun test packages/sdk/test/reporter.test.ts`
Expected: PASS

- [ ] **Step 5: Update SDK index.ts exports**

In `packages/sdk/src/index.ts`, add new exports:

```ts
export { type RegisteredReporter, getRegistry } from './registry.js'
export { TerminalPresenter } from './terminal-presenter.js'
export { PRESETS } from './presets.js'
```

- [ ] **Step 6: Run full SDK test suite**

Run: `bun test packages/sdk/`
Expected: All PASS

- [ ] **Step 7: Run full monorepo test suite**

Run: `bun test --recursive`
Expected: All PASS

- [ ] **Step 8: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/sdk/src/reporter.ts packages/sdk/src/index.ts packages/sdk/test/reporter.test.ts
git commit -m "feat(sdk): add reportAndPrompt, wrap, installExitHandler, receiveChildReport, presenter adapter, registry integration, error dedup"
```

---

## Task 8: Integration Tests (SDK)

**Files:**
- Modify: `packages/sdk/test/integration.test.ts`

- [ ] **Step 1: Read current integration tests**

Read `packages/sdk/test/integration.test.ts` to understand existing tests.

- [ ] **Step 2: Write integration tests for nested reporters**

Add to integration tests:

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReporter } from '../src/reporter.js'
import { getRegistry, resetRegistry } from '../src/registry.js'
import type { InternalConfig } from '../src/config.js'
import type { PresenterAdapter, PromptContext, PresenterAction } from '@cluvo/core'

describe('nested reporters', () => {
	let storeDir: string

	beforeEach(async () => {
		storeDir = await mkdtemp(join(tmpdir(), 'cluvo-int-'))
		resetRegistry()
	})
	afterEach(async () => {
		await rm(storeDir, { recursive: true, force: true })
		resetRegistry()
	})

	test('absorb: child error forwarded to parent', async () => {
		const parentPrompted = mock(async (ctx: PromptContext) => ({ type: 'cancel' } as PresenterAction))
		const parentPresenter: PresenterAdapter = { prompt: parentPrompted }

		const parent = createReporter({
			repo: 'owner/repo',
			app: { name: 'cli-app', version: '1.0.0' },
			childPolicy: 'absorb',
			presenter: parentPresenter,
			store: { enabled: true },
			dedupe: { enabled: false },
			_storeDir: storeDir,
		} satisfies InternalConfig)

		const child = createReporter({
			repo: 'owner/repo',
			app: { name: 'sdk-lib', version: '0.1.0' },
			preset: 'sdk',
			store: { enabled: true },
			dedupe: { enabled: false },
			_storeDir: storeDir,
		} satisfies InternalConfig)

		await child.reportAndPrompt(new Error('child error'))

		// Parent's presenter should have been called
		expect(parentPrompted).toHaveBeenCalled()
	})

	test('passthrough: child uses own presenter', async () => {
		const childPrompted = mock(async (ctx: PromptContext) => ({ type: 'cancel' } as PresenterAction))
		const childPresenter: PresenterAdapter = { prompt: childPrompted }

		const parent = createReporter({
			repo: 'owner/repo',
			app: { name: 'cli-app', version: '1.0.0' },
			childPolicy: 'passthrough',
			store: { enabled: false },
		})

		const child = createReporter({
			repo: 'owner/repo',
			app: { name: 'sdk-lib', version: '0.1.0' },
			presenter: childPresenter,
			store: { enabled: false },
			dedupe: { enabled: false },
		})

		await child.reportAndPrompt(new Error('child error'))

		expect(childPrompted).toHaveBeenCalled()
	})

	test('silent: child stores only, no prompt', async () => {
		const parent = createReporter({
			repo: 'owner/repo',
			app: { name: 'cli-app', version: '1.0.0' },
			childPolicy: 'silent',
			store: { enabled: false },
		})

		const child = createReporter({
			repo: 'owner/repo',
			app: { name: 'sdk-lib', version: '0.1.0' },
			preset: 'sdk',
			store: { enabled: true },
			dedupe: { enabled: false },
			_storeDir: storeDir,
		} satisfies InternalConfig)

		await child.reportAndPrompt(new Error('silent error'))

		// Verify stored
		const { Store } = await import('@cluvo/core')
		const store = new Store(storeDir)
		const reports = await store.list('sdk-lib')
		expect(reports.length).toBeGreaterThan(0)
	})

	test('child always stores to own store under absorb', async () => {
		const parent = createReporter({
			repo: 'owner/repo',
			app: { name: 'cli-app', version: '1.0.0' },
			childPolicy: 'absorb',
			interactive: 'never',
			nonInteractive: 'silent',
			store: { enabled: true },
			dedupe: { enabled: false },
			_storeDir: storeDir,
		} satisfies InternalConfig)

		const child = createReporter({
			repo: 'owner/repo',
			app: { name: 'sdk-lib', version: '0.1.0' },
			preset: 'sdk',
			store: { enabled: true },
			dedupe: { enabled: false },
			_storeDir: storeDir,
		} satisfies InternalConfig)

		await child.reportAndPrompt(new Error('stored both'))

		const { Store } = await import('@cluvo/core')
		const store = new Store(storeDir)
		const childReports = await store.list('sdk-lib')
		expect(childReports.length).toBeGreaterThan(0)
	})

	// === Edge Cases (spec 8.1-8.4) ===

	test('reportError(null) does not throw', async () => {
		const reporter = createReporter({
			repo: 'owner/repo',
			app: { name: 'edge-test', version: '1.0.0' },
			store: { enabled: false },
		})
		const report = await reporter.reportError(null)
		expect(report.error.message).toBe('null')
	})

	test('reportError(undefined) does not throw', async () => {
		const reporter = createReporter({
			repo: 'owner/repo',
			app: { name: 'edge-test', version: '1.0.0' },
			store: { enabled: false },
		})
		const report = await reporter.reportError(undefined)
		expect(report.error.message).toBe('undefined')
	})

	test('reportError("string") captures as message', async () => {
		const reporter = createReporter({
			repo: 'owner/repo',
			app: { name: 'edge-test', version: '1.0.0' },
			store: { enabled: false },
		})
		const report = await reporter.reportError('string error')
		expect(report.error.message).toBe('string error')
	})

	test('presenter.prompt() throwing is swallowed', async () => {
		const throwingPresenter: PresenterAdapter = {
			prompt: async () => { throw new Error('presenter crashed') },
		}
		const reporter = createReporter({
			repo: 'owner/repo',
			app: { name: 'edge-test', version: '1.0.0' },
			presenter: throwingPresenter,
			store: { enabled: false },
			dedupe: { enabled: false },
		})
		// Should NOT throw
		await reporter.reportAndPrompt(new Error('test'))
	})

	// === reportError only + exit handler (spec 7.5) ===

	test('reportError only + exit handler triggers prompt for pending', async () => {
		const prompted = mock(async () => {})
		const reporter = createReporter({
			repo: 'owner/repo',
			app: { name: 'exit-test', version: '1.0.0' },
			store: { enabled: true },
			dedupe: { enabled: false },
			_storeDir: storeDir,
		} satisfies InternalConfig)

		await reporter.reportError(new Error('pending only'))
		const cleanup = reporter.installExitHandler()

		process.emit('beforeExit', 0)
		await new Promise((r) => setTimeout(r, 100))
		cleanup()
	})

	// === SDK preset + no parent (spec 7.7) ===

	test('SDK preset with no parent: collect only, no prompt', async () => {
		const reporter = createReporter({
			repo: 'owner/repo',
			app: { name: 'sdk-alone', version: '1.0.0' },
			preset: 'sdk',
			store: { enabled: true },
			dedupe: { enabled: false },
			_storeDir: storeDir,
		} satisfies InternalConfig)

		// SDK preset has presenter=null, so reportAndPrompt should just collect
		await reporter.reportAndPrompt(new Error('sdk only'))

		const { Store } = await import('@cluvo/core')
		const store = new Store(storeDir)
		const reports = await store.list('sdk-alone')
		expect(reports.length).toBeGreaterThan(0)
	})

	// === wrapCommand argv extraction (spec 6.5.3) ===

	test('wrapCommand captures process.argv context', async () => {
		const reporter = createReporter({
			repo: 'owner/repo',
			app: { name: 'argv-test', version: '1.0.0' },
			interactive: 'never',
			nonInteractive: 'silent',
			store: { enabled: true },
			dedupe: { enabled: false },
			_storeDir: storeDir,
		} satisfies InternalConfig)

		const originalArgv = process.argv
		process.argv = ['node', 'script.js', 'deploy', 'prod']

		try {
			await reporter.wrapCommand(
				async () => { throw new Error('argv test') },
				{ rethrow: false },
			)
		} finally {
			process.argv = originalArgv
		}

		const { Store } = await import('@cluvo/core')
		const store = new Store(storeDir)
		const reports = await store.list('argv-test')
		expect(reports.length).toBeGreaterThan(0)
	})

	test('dedup: same error not double-collected', async () => {
		const reporter = createReporter({
			repo: 'owner/repo',
			app: { name: 'dedup-app', version: '1.0.0' },
			interactive: 'never',
			nonInteractive: 'silent',
			store: { enabled: true },
			dedupe: { enabled: false },
			_storeDir: storeDir,
		} satisfies InternalConfig)

		const error = new Error('once only')
		const r1 = await reporter.reportError(error)
		const r2 = await reporter.reportError(error)
		expect(r1.id).toBe(r2.id)
	})
})
```

- [ ] **Step 3: Run integration tests**

Run: `bun test packages/sdk/test/integration.test.ts`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `bun test --recursive`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/test/integration.test.ts
git commit -m "test(sdk): add integration tests for nested reporters, absorb/passthrough/silent, dedup"
```

---

## Task 9: Documentation Updates

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read current README.md**

Read `README.md` to understand current structure.

- [ ] **Step 2: Update README.md**

Key additions:
1. **Getting Started**: split into CLI, SDK, TUI subsections
2. **New API reference**: `reportAndPrompt`, `wrap`, `installExitHandler`, `receiveChildReport`
3. **Presets**: CLI vs SDK table, override examples
4. **Presenter Adapter**: interface docs, custom presenter example
5. **Nested Usage**: registry concept, childPolicy options, multi-layer example
6. **Configuration**: new fields: `preset`, `presenter`, `childPolicy`

- [ ] **Step 3: Read current ARCHITECTURE.md section headers**

Use a haiku subagent to read ARCHITECTURE.md and identify sections to update.

- [ ] **Step 4: Update ARCHITECTURE.md**

Update sections:
1. **Presenter System**: add adapter pattern, built-in vs custom
2. **SDK Package Architecture**: add preset system, registry, new APIs
3. **Integration Patterns**: add CLI, SDK, TUI, nested patterns

- [ ] **Step 5: Update CLAUDE.md**

Add to the Core Pipeline section:

```
Each stage is a separate directory under `packages/core/src/` and independently testable.
The presenter uses an Adapter pattern (`PresenterAdapter`) allowing custom UI implementations.
```

- [ ] **Step 6: Run typecheck and tests**

Run: `bun run typecheck && bun test --recursive`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add README.md ARCHITECTURE.md CLAUDE.md
git commit -m "docs: update README, ARCHITECTURE, CLAUDE.md for SDK improvement"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `bun test --recursive`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: All packages build successfully

- [ ] **Step 4: Verify exports**

Check that all new public APIs are properly exported:

```ts
// This should work from consuming code:
import {
	createReporter,
	type Reporter,
	TerminalPresenter,
	getRegistry,
	PRESETS,
} from '@cluvo/sdk'

import {
	type PresenterAdapter,
	type PromptContext,
	type PresenterAction,
	type WrapOptions,
	type ExitHandlerOptions,
	type Preset,
	type ChildPolicy,
} from '@cluvo/core'
```

- [ ] **Step 5: Add changeset**

Run: `pubm changesets add`
- Select: `packages/core` (minor), `packages/sdk` (minor)
- Summary: "Add presenter adapter, preset system, global reporter registry, and new convenience APIs (reportAndPrompt, wrap, installExitHandler) for SDK/TUI support"
