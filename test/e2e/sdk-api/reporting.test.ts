import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { rm } from 'node:fs/promises'
import { Store } from '../../../packages/core/src/index.js'
import type { InternalConfig } from '../../../packages/sdk/src/config.js'
import { createReporter } from '../../../packages/sdk/src/index.js'
import { resetRegistry } from '../../../packages/sdk/src/registry.js'
import { configs, createErrors, withStoreDir } from '../helpers/fixtures.js'
import { installMockFetch } from '../helpers/mock-fetch.js'
import { createTempStoreDir } from '../helpers/subprocess.js'
import { createTestPresenter } from '../helpers/test-presenter.js'

describe('E2E: sdk-api/reporting', () => {
	let storeDir: string
	let restoreFetch: () => void

	beforeEach(async () => {
		storeDir = await createTempStoreDir()
		restoreFetch = installMockFetch()
		resetRegistry()
	})

	afterEach(async () => {
		restoreFetch()
		resetRegistry()
		await rm(storeDir, { recursive: true, force: true })
	})

	test('1: reportError() returns ErrorReport with id/createdAt, status=pending, saved to store', async () => {
		const reporter = createReporter({
			...withStoreDir(configs.nonInteractiveSilent, storeDir),
			store: { enabled: true },
		})
		const errors = createErrors()
		const report = await reporter.reportError(errors.simple)

		expect(report.id).toBeTruthy()
		expect(report.createdAt).toBeTruthy()
		expect(report.status).toBe('pending')
		expect(report.error.name).toBe('Error')
		expect(report.error.message).toContain('Something went wrong')
		expect(report.app.name).toBe('test-app')

		const store = new Store(storeDir)
		const stored = await store.list('test-app')
		expect(stored).toHaveLength(1)
		expect(stored[0].id).toBe(report.id)
	})

	test('2: reportAndPrompt() with presenter returning open -> status=submitted', async () => {
		const presenter = createTestPresenter({ type: 'open' })
		const reporter = createReporter({
			...withStoreDir(configs.minimal, storeDir),
			presenter,
			store: { enabled: true },
		} satisfies InternalConfig)

		const errors = createErrors()
		await reporter.reportAndPrompt(errors.simple)

		const store = new Store(storeDir)
		const stored = await store.list('test-app')
		expect(stored).toHaveLength(1)
		expect(stored[0].status).toBe('submitted')
		expect(presenter.prompt).toHaveBeenCalledTimes(1)
	})

	test('3: reportAndPrompt() with presenter returning cancel -> status=dismissed', async () => {
		const presenter = createTestPresenter({ type: 'cancel' })
		const reporter = createReporter({
			...withStoreDir(configs.minimal, storeDir),
			presenter,
			store: { enabled: true },
		} satisfies InternalConfig)

		await reporter.reportAndPrompt(createErrors().simple)

		const store = new Store(storeDir)
		const stored = await store.list('test-app')
		expect(stored).toHaveLength(1)
		expect(stored[0].status).toBe('dismissed')
	})

	test('4: reportAndPrompt() with presenter returning save -> status=dismissed (saved to file)', async () => {
		const presenter = createTestPresenter({ type: 'save' })
		const reporter = createReporter({
			...withStoreDir(configs.minimal, storeDir),
			presenter,
			store: { enabled: true },
		} satisfies InternalConfig)

		await reporter.reportAndPrompt(createErrors().simple)

		const store = new Store(storeDir)
		const stored = await store.list('test-app')
		expect(stored).toHaveLength(1)
		// save action writes markdown file + marks as dismissed
		expect(stored[0].status).toBe('dismissed')
	})

	test('5: wrap() captures error, calls reportAndPrompt, rethrows', async () => {
		const presenter = createTestPresenter({ type: 'cancel' })
		const reporter = createReporter({
			...withStoreDir(configs.minimal, storeDir),
			presenter,
			store: { enabled: true },
		} satisfies InternalConfig)

		const testError = new Error('wrap test error')
		let caughtError: unknown
		try {
			await reporter.wrap(async () => {
				throw testError
			})
		} catch (e) {
			caughtError = e
		}

		expect(caughtError).toBe(testError)
		expect(presenter.prompt).toHaveBeenCalledTimes(1)

		const store = new Store(storeDir)
		const stored = await store.list('test-app')
		expect(stored).toHaveLength(1)
	})

	test('6: wrap() with no error -> no report created', async () => {
		const presenter = createTestPresenter({ type: 'cancel' })
		const reporter = createReporter({
			...withStoreDir(configs.minimal, storeDir),
			presenter,
			store: { enabled: true },
		} satisfies InternalConfig)

		await reporter.wrap(async () => {
			// no error
		})

		expect(presenter.prompt).not.toHaveBeenCalled()

		const store = new Store(storeDir)
		const stored = await store.list('test-app')
		expect(stored).toHaveLength(0)
	})

	test('7: wrapCommand() extracts context from process.argv', async () => {
		const originalArgv = process.argv
		process.argv = ['bun', 'cli.ts', 'deploy', 'production', '--verbose']

		try {
			const presenter = createTestPresenter({ type: 'cancel' })
			const reporter = createReporter({
				...withStoreDir(configs.cliPreset, storeDir),
				presenter,
				store: { enabled: true },
			} satisfies InternalConfig)

			try {
				await reporter.wrapCommand(async () => {
					throw new Error('deploy failed')
				})
			} catch {
				// expected rethrow
			}

			const store = new Store(storeDir)
			const stored = await store.list('test-app')
			expect(stored).toHaveLength(1)
			expect(stored[0].command?.command).toBe('deploy')
			expect(stored[0].command?.argv).toContain('--verbose')
		} finally {
			process.argv = originalArgv
		}
	})

	test('8: buildReport() returns ErrorReport without saving to store', async () => {
		const reporter = createReporter({
			...withStoreDir(configs.nonInteractiveSilent, storeDir),
			store: { enabled: true },
		})

		const report = reporter.buildReport(createErrors().simple)

		expect(report.id).toBeTruthy()
		expect(report.error.name).toBe('Error')

		// Should NOT be saved to store
		const store = new Store(storeDir)
		const stored = await store.list('test-app')
		expect(stored).toHaveLength(0)
	})

	test('9: same Error object -> reportError() x2 returns same id (dedup)', async () => {
		const reporter = createReporter({
			...withStoreDir(configs.nonInteractiveSilent, storeDir),
			store: { enabled: true },
		})

		const error = new Error('dedup test')
		const r1 = await reporter.reportError(error)
		const r2 = await reporter.reportError(error)

		expect(r1.id).toBe(r2.id)
	})

	test('10: primitive errors (string, null) handled normally', async () => {
		const reporter = createReporter({
			...withStoreDir(configs.nonInteractiveSilent, storeDir),
			store: { enabled: true },
		})

		const r1 = await reporter.reportError('string error thrown')
		expect(r1.error.message).toContain('string error thrown')

		const r2 = await reporter.reportError(null)
		expect(r2.error.message).toBeTruthy()

		const store = new Store(storeDir)
		const stored = await store.list('test-app')
		expect(stored.length).toBeGreaterThanOrEqual(2)
	})

	test('11: error with cause chain populates causeChain', async () => {
		const reporter = createReporter({
			...withStoreDir(configs.nonInteractiveSilent, storeDir),
			store: { enabled: true },
		})

		const errors = createErrors()
		const report = await reporter.reportError(errors.deepCause)

		expect(report.error.causeChain).toBeDefined()
		expect(report.error.causeChain!.length).toBeGreaterThanOrEqual(2)
	})

	test('12: error with circular reference handled without crash', async () => {
		const reporter = createReporter({
			...withStoreDir(configs.nonInteractiveSilent, storeDir),
			store: { enabled: true },
		})

		const errors = createErrors()
		const report = await reporter.reportError(errors.circular)

		expect(report.id).toBeTruthy()
		expect(report.error.name).toBe('Error')
	})

	test('13: reportError() never throws even on internal failure', async () => {
		const reporter = createReporter({
			...withStoreDir(configs.nonInteractiveSilent, storeDir),
			store: { enabled: true },
		})

		const report = await reporter.reportError(undefined)
		expect(report).toBeTruthy()
		expect(report.id).toBeTruthy()
	})
})
