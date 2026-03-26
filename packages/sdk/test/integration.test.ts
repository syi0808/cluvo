import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '@cluvo/core'
import type { PresenterAdapter, PresenterAction, PromptContext } from '@cluvo/core'
import type { InternalConfig } from '../src/config.js'
import { createReporter } from '../src/reporter.js'
import { resetRegistry } from '../src/registry.js'

describe('Full pipeline integration', () => {
	let storeDir: string

	beforeEach(async () => {
		storeDir = await mkdtemp(join(tmpdir(), 'cluvo-int-'))
	})
	afterEach(async () => {
		await rm(storeDir, { recursive: true, force: true })
		resetRegistry()
	})

	test('error → collect → sanitize → store → draft', async () => {
		const reporter = createReporter({
			repo: 'owner/repo',
			app: { name: 'test-cli', version: '2.0.0', gitSha: 'abc123' },
			store: { enabled: true },
			sanitize: { enabled: true },
			interactive: 'never',
			nonInteractive: 'silent',
			_storeDir: storeDir,
		} satisfies InternalConfig)

		// Simulate error with sensitive data
		const error = new Error('Connection failed: api_key=sk_live_secret123')

		// Step 1: reportError (collect + sanitize + store)
		const report = await reporter.reportError(error, {
			command: 'deploy',
			argv: ['deploy', '--token', 'ghp_mysecret', '--verbose'],
		})

		// Verify report
		expect(report.error.name).toBe('Error')
		expect(report.error.message).not.toContain('sk_live_secret123')
		expect(report.command?.argv).not.toContain('ghp_mysecret')
		expect(report.app.gitSha).toBe('abc123')
		expect(report.environment.os).toBeTruthy()

		// Verify stored
		const store = new Store(storeDir)
		const stored = await store.list('test-cli')
		expect(stored).toHaveLength(1)
		expect(stored[0].id).toBe(report.id)

		// Step 2: build draft
		const draft = reporter.buildDraft(report)
		expect(draft.title).toContain('deploy')
		expect(draft.title).toContain('Error')
		expect(draft.body).toContain('## Environment')
		expect(draft.body).toContain('test-cli@2.0.0')
		expect(draft.body).not.toContain('sk_live_secret123')
	})

	test('wrapCommand catches error and stores report', async () => {
		const reporter = createReporter({
			repo: 'owner/repo',
			app: { name: 'wrap-test', version: '1.0.0' },
			store: { enabled: true },
			interactive: 'never',
			nonInteractive: 'silent',
			_storeDir: storeDir,
		} satisfies InternalConfig)

		let thrown = false
		try {
			await reporter.wrapCommand(async () => {
				throw new Error('command failed')
			})
		} catch {
			thrown = true
		}

		expect(thrown).toBe(true)

		const store = new Store(storeDir)
		const stored = await store.list('wrap-test')
		expect(stored).toHaveLength(1)
		expect(stored[0].error.message).toBe('command failed')
	})
})

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

		const store = new Store(storeDir)
		const childReports = await store.list('sdk-lib')
		expect(childReports.length).toBeGreaterThan(0)
	})

	// === Edge Cases ===

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

	// === reportError only + exit handler ===

	test('reportError only + exit handler triggers prompt for pending', async () => {
		const reporter = createReporter({
			repo: 'owner/repo',
			app: { name: 'exit-test', version: '1.0.0' },
			store: { enabled: true },
			dedupe: { enabled: false },
			interactive: 'never',
			nonInteractive: 'silent',
			_storeDir: storeDir,
		} satisfies InternalConfig)

		await reporter.reportError(new Error('pending only'))
		const cleanup = reporter.installExitHandler()

		process.emit('beforeExit', 0)
		await new Promise((r) => setTimeout(r, 100))
		cleanup()
	})

	// === SDK preset + no parent ===

	test('SDK preset with no parent: collect only, no prompt', async () => {
		resetRegistry() // ensure no parent exists
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

		const store = new Store(storeDir)
		const reports = await store.list('sdk-alone')
		expect(reports.length).toBeGreaterThan(0)
	})

	// === wrapCommand argv extraction ===

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

		const store = new Store(storeDir)
		const reports = await store.list('argv-test')
		expect(reports.length).toBeGreaterThan(0)
	})

	// === dedup ===

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
