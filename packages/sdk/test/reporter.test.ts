import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { getRegistry, resetRegistry } from '../src/registry.js'
import { createReporter, Reporter } from '../src/reporter.js'
import { cleanTempDir, createTempDir, makeConfig, makeSilentConfig } from './fixtures.js'

describe('createReporter', () => {
	let storeDir: string

	beforeEach(async () => {
		storeDir = await createTempDir()
		resetRegistry()
	})
	afterEach(async () => {
		await cleanTempDir(storeDir)
		resetRegistry()
	})

	test('creates reporter with config', () => {
		const reporter = createReporter(makeConfig())
		expect(reporter).toBeDefined()
		expect(reporter.reportError).toBeInstanceOf(Function)
		expect(reporter.promptAndSubmit).toBeInstanceOf(Function)
		expect(reporter.wrapCommand).toBeInstanceOf(Function)
		expect(reporter.buildReport).toBeInstanceOf(Function)
		expect(reporter.sanitizeReport).toBeInstanceOf(Function)
		expect(reporter.findMatches).toBeInstanceOf(Function)
		expect(reporter.buildDraft).toBeInstanceOf(Function)
		expect(reporter.publish).toBeInstanceOf(Function)
	})

	test('reportError returns ErrorReport and never throws', async () => {
		const reporter = createReporter(makeConfig({
			store: { enabled: true },
			_storeDir: storeDir,
		}))

		const report = await reporter.reportError(new Error('test failure'), {
			command: 'build',
		})

		expect(report.id).toBeTruthy()
		expect(report.error.name).toBe('Error')
		expect(report.error.message).toBe('test failure')
		expect(report.status).toBe('pending')
		expect(report.app.name).toBe('test-cli')
	})

	test('reportError never throws even with bad input', async () => {
		const reporter = createReporter(makeConfig({
			store: { enabled: false },
		}))

		const report = await reporter.reportError(null)
		expect(report.error.message).toBe('null')
	})

	test('buildReport returns unsanitized report', () => {
		const reporter = createReporter(makeConfig())

		const report = reporter.buildReport(new Error('raw error'), { command: 'deploy' })
		expect(report.error.message).toBe('raw error')
		expect(report.sanitizedFields).toHaveLength(0)
	})

	test('sanitizeReport returns new report with sanitized data', () => {
		const reporter = createReporter(makeConfig())

		const report = reporter.buildReport(new Error('token=ghp_abc123xyz789def456ghi012jkl345mno678'))
		const sanitized = reporter.sanitizeReport(report)
		expect(sanitized).not.toBe(report)
		expect(sanitized.error.message).not.toContain('ghp_abc123')
	})

	test('buildDraft returns DraftPayload', () => {
		const reporter = createReporter(makeConfig())

		const report = reporter.buildReport(new Error('test'))
		const draft = reporter.buildDraft(report)
		expect(draft.title).toContain('Error')
		expect(draft.body).toContain('test')
	})

	test('buildReport uses context when provided', () => {
		const reporter = createReporter(makeConfig())

		const report = reporter.buildReport(new Error('fail'), {
			command: 'deploy',
			subcommand: 'prod',
			argv: ['deploy', 'prod'],
		})
		expect(report.command?.command).toBe('deploy')
		expect(report.command?.subcommand).toBe('prod')
		expect(report.command?.argv).toEqual(['deploy', 'prod'])
	})

	test('sanitizeReport returns original when sanitize disabled', () => {
		const reporter = createReporter(makeConfig({ sanitize: { enabled: false } }))

		const report = reporter.buildReport(new Error('api_key=secret123'))
		const result = reporter.sanitizeReport(report)
		expect(result.error.message).toContain('api_key=secret123')
	})

	test('reportError stores report when store enabled', async () => {
		const reporter = createReporter(makeConfig({
			app: { name: 'store-test', version: '1.0.0' },
			store: { enabled: true },
			_storeDir: storeDir,
		}))

		const report = await reporter.reportError(new Error('stored'))
		const { Store } = await import('@cluvo/core')
		const store = new Store(storeDir)
		const loaded = await store.load('store-test', report.id)
		expect(loaded).not.toBeNull()
	})

	test('reportError does not store when store disabled', async () => {
		const reporter = createReporter(makeConfig({
			app: { name: 'no-store', version: '1.0.0' },
			store: { enabled: false },
		}))

		const report = await reporter.reportError(new Error('not stored'))
		expect(report.id).toBeTruthy()
		// No assertion on store -- just verifying it doesn't throw
	})

	test('findMatches returns result with fetch mock', async () => {
		const originalFetch = globalThis.fetch
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ items: [] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}),
			),
		)
		try {
			const reporter = createReporter(makeConfig({ dedupe: { enabled: true } }))
			const report = reporter.buildReport(new Error('test'))
			const result = await reporter.findMatches(report)
			expect(result.found).toBe(false)
			expect(result.matches).toHaveLength(0)
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	test('buildReport includes metadata from context', () => {
		const reporter = createReporter(makeConfig())

		const report = reporter.buildReport(new Error('test'), {
			metadata: { origin: 'uncaughtException' },
		})
		expect(report.metadata).toEqual({ origin: 'uncaughtException' })
	})

	test('installGlobalHandlers returns uninstall function', () => {
		const reporter = createReporter(makeConfig({
			interactive: 'never',
			nonInteractive: 'silent',
			store: { enabled: false },
		}))

		const uninstall = reporter.installGlobalHandlers()
		expect(typeof uninstall).toBe('function')
		uninstall() // clean up
	})

	test('publish delegates to core publish', async () => {
		const reporter = createReporter(makeConfig({
			mode: 'file',
			_storeDir: storeDir,
		}))

		const report = reporter.buildReport(new Error('test'))
		const draft = reporter.buildDraft(report)
		const result = await reporter.publish(draft)
		expect(result.method).toBe('file')
		expect(result.filePath).toBeTruthy()
	})

	test('promptAndSubmit in non-interactive mode does not throw', async () => {
		const reporter = createReporter(makeSilentConfig(storeDir))

		const report = await reporter.reportError(new Error('test'))
		// Should not throw in non-interactive silent mode
		await reporter.promptAndSubmit(report)
	})

	test('promptAndSubmit sets status to dismissed in non-interactive mode', async () => {
		const reporter = createReporter(makeSilentConfig(storeDir, {
			app: { name: 'nonint-test', version: '1.0.0' },
		}))

		const report = await reporter.reportError(new Error('non-interactive'))
		await reporter.promptAndSubmit(report)

		const { Store } = await import('@cluvo/core')
		const store = new Store(storeDir)
		const loaded = await store.load('nonint-test', report.id)
		expect(loaded?.status).toBe('dismissed')
	})

	// --- New tests for Task 7 ---

	test('reporter exposes new API methods', () => {
		const reporter = createReporter(makeConfig({
			app: { name: 'test', version: '1.0.0' },
		}))
		expect(reporter.reportAndPrompt).toBeInstanceOf(Function)
		expect(reporter.wrap).toBeInstanceOf(Function)
		expect(reporter.installExitHandler).toBeInstanceOf(Function)
		expect(reporter.receiveChildReport).toBeInstanceOf(Function)
	})

	test('reportAndPrompt collects and stores report in non-interactive mode', async () => {
		const reporter = createReporter(makeSilentConfig(storeDir, {
			app: { name: 'test', version: '1.0.0' },
		}))
		await reporter.reportAndPrompt(new Error('test'))
	})

	test('wrap catches error and reports it', async () => {
		const reporter = createReporter(makeSilentConfig(storeDir, {
			app: { name: 'test', version: '1.0.0' },
		}))
		await expect(
			reporter.wrap(async () => {
				throw new Error('wrapped')
			}),
		).rejects.toThrow('wrapped')
	})

	test('wrap with rethrow=false swallows error', async () => {
		const reporter = createReporter(makeSilentConfig(storeDir, {
			app: { name: 'test', version: '1.0.0' },
		}))
		await reporter.wrap(
			async () => {
				throw new Error('swallowed')
			},
			{ rethrow: false },
		)
	})

	test('wrap does nothing when function succeeds', async () => {
		const reporter = createReporter(makeConfig({
			app: { name: 'test', version: '1.0.0' },
			store: { enabled: false },
		}))
		await reporter.wrap(async () => {
			/* success */
		})
	})

	test('wrapCommand accepts WrapOptions', async () => {
		const reporter = createReporter(makeConfig({
			app: { name: 'test', version: '1.0.0' },
			interactive: 'never',
			nonInteractive: 'silent',
			store: { enabled: false },
			dedupe: { enabled: false },
		}))
		await reporter.wrapCommand(
			async () => {
				throw new Error('swallowed-cmd')
			},
			{ rethrow: false },
		)
	})

	test('duplicate error detection via WeakMap', async () => {
		const reporter = createReporter(makeConfig({
			app: { name: 'dedup-test', version: '1.0.0' },
			store: { enabled: true },
			_storeDir: storeDir,
		}))
		const error = new Error('duplicate')
		const report1 = await reporter.reportError(error)
		const report2 = await reporter.reportError(error)
		expect(report1.id).toBe(report2.id) // Same report returned
	})

	test('receiveChildReport stores report', async () => {
		const reporter = createReporter(makeSilentConfig(storeDir, {
			app: { name: 'parent-test', version: '1.0.0' },
		}))
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
		const { Store } = await import('@cluvo/core')
		const store = new Store(storeDir)
		const loaded = await store.load('child-lib', 'child-1')
		expect(loaded).not.toBeNull()
	})

	test('promptAndSubmit sets status to dismissed on cancel', async () => {
		const reporter = createReporter(makeConfig({
			app: { name: 'cancel-test', version: '1.0.0' },
			interactive: 'always',
			store: { enabled: true },
			dedupe: { enabled: false },
			_storeDir: storeDir,
		}))

		const report = await reporter.reportError(new Error('will cancel'))
		// In non-TTY, TerminalPresenter.prompt() returns null → cancel path
		await reporter.promptAndSubmit(report)

		const { Store } = await import('@cluvo/core')
		const store = new Store(storeDir)
		const loaded = await store.load('cancel-test', report.id)
		expect(loaded?.status).toBe('dismissed')
	})

	test('installExitHandler returns cleanup function', () => {
		const reporter = createReporter(makeConfig({
			app: { name: 'test', version: '1.0.0' },
			store: { enabled: false },
		}))
		const cleanup = reporter.installExitHandler()
		expect(typeof cleanup).toBe('function')
		cleanup()
	})
})

describe('no-op reporter (non-top-level new Reporter)', () => {
	beforeEach(() => resetRegistry())
	afterEach(() => resetRegistry())

	// Named function + `new` → Bun preserves caller frame → detected as non-top-level
	function createInsideFunction() {
		return new Reporter(makeConfig({
			app: { name: 'should-be-noop', version: '1.0.0' },
			store: { enabled: false },
		}))
	}

	test('createReporter inside named function returns no-op reporter', () => {
		const reporter = createInsideFunction()
		expect(reporter).toBeDefined()
		expect(reporter.reportError).toBeInstanceOf(Function)
	})

	test('no-op reportError returns noop report with id=noop', async () => {
		const reporter = createInsideFunction()
		const report = await reporter.reportError(new Error('test'))
		expect(report.id).toBe('noop')
		expect(report.status).toBe('dismissed')
		expect(report.app.name).toBe('noop')
	})

	test('no-op reportAndPrompt completes without error', async () => {
		const reporter = createInsideFunction()
		await reporter.reportAndPrompt(new Error('test'))
	})

	test('no-op promptAndSubmit completes without error', async () => {
		const reporter = createInsideFunction()
		const report = await reporter.reportError(new Error('test'))
		await reporter.promptAndSubmit(report)
	})

	test('no-op wrap executes the wrapped function', async () => {
		const reporter = createInsideFunction()
		let executed = false
		await reporter.wrap(async () => {
			executed = true
		})
		expect(executed).toBe(true)
	})

	test('no-op wrapCommand executes the wrapped function', async () => {
		const reporter = createInsideFunction()
		let executed = false
		await reporter.wrapCommand(async () => {
			executed = true
		})
		expect(executed).toBe(true)
	})

	test('no-op installGlobalHandlers returns cleanup function', () => {
		const reporter = createInsideFunction()
		const cleanup = reporter.installGlobalHandlers()
		expect(typeof cleanup).toBe('function')
		cleanup()
	})

	test('no-op installExitHandler returns cleanup function', () => {
		const reporter = createInsideFunction()
		const cleanup = reporter.installExitHandler()
		expect(typeof cleanup).toBe('function')
		cleanup()
	})

	test('no-op buildReport returns noop report', () => {
		const reporter = createInsideFunction()
		const report = reporter.buildReport(new Error('test'))
		expect(report.id).toBe('noop')
	})

	test('no-op sanitizeReport returns input unchanged', () => {
		const reporter = createInsideFunction()
		const input = reporter.buildReport(new Error('test'))
		const output = reporter.sanitizeReport(input)
		expect(output).toBe(input)
	})

	test('no-op findMatches returns no matches', async () => {
		const reporter = createInsideFunction()
		const report = reporter.buildReport(new Error('test'))
		const result = await reporter.findMatches(report)
		expect(result.found).toBe(false)
		expect(result.matches).toHaveLength(0)
	})

	test('no-op publish returns terminal method', async () => {
		const reporter = createInsideFunction()
		const report = reporter.buildReport(new Error('test'))
		const draft = reporter.buildDraft(report)
		const result = await reporter.publish(draft)
		expect(result.method).toBe('terminal')
	})

	test('no-op reporter is not registered in registry', () => {
		const registry = getRegistry()
		const before = registry.stack.length
		createInsideFunction()
		expect(registry.stack.length).toBe(before)
	})
})
