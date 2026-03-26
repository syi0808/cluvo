import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { Store } from '../../../packages/core/src/index.js'
import type { InternalConfig } from '../../../packages/sdk/src/config.js'
import { createReporter } from '../../../packages/sdk/src/index.js'
import { resetRegistry } from '../../../packages/sdk/src/registry.js'
import { installMockFetch } from '../helpers/mock-fetch.js'
import { createTempStoreDir } from '../helpers/subprocess.js'
import { createTestPresenter } from '../helpers/test-presenter.js'

// Simulate ESM post-order depths: child (deeper) registers before parent (shallower)
const DEPTH = { grandparent: 3, parent: 5, child: 7 } as const

describe('E2E: sdk-api/nested', () => {
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

	test('1: absorb -- child error forwarded to parent presenter', async () => {
		const parentPresenter = createTestPresenter({ type: 'cancel' })
		const childPresenter = createTestPresenter({ type: 'cancel' })

		// Post-order: child registers first (deeper), then parent (shallower)
		const child = createReporter({
			repo: 'test-owner/test-repo',
			app: { name: 'child-sdk', version: '0.1.0' },
			preset: 'sdk',
			presenter: childPresenter,
			store: { enabled: true },
			_storeDir: storeDir,
			_skipTopLevelCheck: true,
			_depth: DEPTH.child,
		} satisfies InternalConfig)

		createReporter({
			repo: 'test-owner/test-repo',
			app: { name: 'parent-cli', version: '1.0.0' },
			childPolicy: 'absorb',
			presenter: parentPresenter,
			store: { enabled: true },
			_storeDir: storeDir,
			_skipTopLevelCheck: true,
			_depth: DEPTH.parent,
		} satisfies InternalConfig)

		await child.reportAndPrompt(new Error('child error'))

		expect(parentPresenter.prompt).toHaveBeenCalled()
		expect(childPresenter.prompt).not.toHaveBeenCalled()
	})

	test('2: absorb -- stored in both child and parent store', async () => {
		const parentStoreDir = await createTempStoreDir()
		const parentPresenter = createTestPresenter({ type: 'cancel' })

		const child = createReporter({
			repo: 'test-owner/test-repo',
			app: { name: 'child-sdk', version: '0.1.0' },
			preset: 'sdk',
			store: { enabled: true },
			_storeDir: storeDir,
			_skipTopLevelCheck: true,
			_depth: DEPTH.child,
		} satisfies InternalConfig)

		createReporter({
			repo: 'test-owner/test-repo',
			app: { name: 'parent-cli', version: '1.0.0' },
			childPolicy: 'absorb',
			presenter: parentPresenter,
			store: { enabled: true },
			_storeDir: parentStoreDir,
			_skipTopLevelCheck: true,
			_depth: DEPTH.parent,
		} satisfies InternalConfig)

		await child.reportAndPrompt(new Error('child error'))

		// Child store has the report (saved by child's reportError)
		const childStore = new Store(storeDir)
		const childReports = await childStore.list('child-sdk')
		expect(childReports).toHaveLength(1)

		// Parent store also has the report (saved by parent's receiveChildReport)
		const parentStore = new Store(parentStoreDir)
		const parentReports = await parentStore.list('child-sdk')
		expect(parentReports.length).toBeGreaterThanOrEqual(1)

		await rm(parentStoreDir, { recursive: true, force: true })
	})

	test('3: passthrough -- child uses own presenter', async () => {
		const parentPresenter = createTestPresenter({ type: 'cancel' })
		const childPresenter = createTestPresenter({ type: 'cancel' })

		const child = createReporter({
			repo: 'test-owner/test-repo',
			app: { name: 'child-sdk', version: '0.1.0' },
			presenter: childPresenter,
			store: { enabled: true },
			_storeDir: storeDir,
			_skipTopLevelCheck: true,
			_depth: DEPTH.child,
		} satisfies InternalConfig)

		createReporter({
			repo: 'test-owner/test-repo',
			app: { name: 'parent-cli', version: '1.0.0' },
			childPolicy: 'passthrough',
			presenter: parentPresenter,
			store: { enabled: true },
			_storeDir: storeDir,
			_skipTopLevelCheck: true,
			_depth: DEPTH.parent,
		} satisfies InternalConfig)

		await child.reportAndPrompt(new Error('child error'))

		expect(childPresenter.prompt).toHaveBeenCalled()
		expect(parentPresenter.prompt).not.toHaveBeenCalled()
	})

	test('4: silent -- store only, no presenter called', async () => {
		const parentPresenter = createTestPresenter({ type: 'cancel' })
		const childPresenter = createTestPresenter({ type: 'cancel' })

		const child = createReporter({
			repo: 'test-owner/test-repo',
			app: { name: 'child-sdk', version: '0.1.0' },
			preset: 'sdk',
			presenter: childPresenter,
			store: { enabled: true },
			_storeDir: storeDir,
			_skipTopLevelCheck: true,
			_depth: DEPTH.child,
		} satisfies InternalConfig)

		createReporter({
			repo: 'test-owner/test-repo',
			app: { name: 'parent-cli', version: '1.0.0' },
			childPolicy: 'silent',
			presenter: parentPresenter,
			store: { enabled: true },
			_storeDir: storeDir,
			_skipTopLevelCheck: true,
			_depth: DEPTH.parent,
		} satisfies InternalConfig)

		await child.reportAndPrompt(new Error('silent child error'))

		expect(parentPresenter.prompt).not.toHaveBeenCalled()
		expect(childPresenter.prompt).not.toHaveBeenCalled()

		const store = new Store(storeDir)
		const childReports = await store.list('child-sdk')
		expect(childReports).toHaveLength(1)
	})

	test('5: 3-level nesting with absorb reaches grandparent', async () => {
		const grandparentPresenter = createTestPresenter({ type: 'cancel' })

		// Post-order: child → parent → grandparent
		const child = createReporter({
			repo: 'test-owner/test-repo',
			app: { name: 'child', version: '1.0.0' },
			preset: 'sdk',
			store: { enabled: true },
			_storeDir: storeDir,
			_skipTopLevelCheck: true,
			_depth: DEPTH.child,
		} satisfies InternalConfig)

		createReporter({
			repo: 'test-owner/test-repo',
			app: { name: 'parent', version: '1.0.0' },
			childPolicy: 'absorb',
			store: { enabled: true },
			_storeDir: storeDir,
			_skipTopLevelCheck: true,
			_depth: DEPTH.parent,
		} satisfies InternalConfig)

		createReporter({
			repo: 'test-owner/test-repo',
			app: { name: 'grandparent', version: '1.0.0' },
			childPolicy: 'absorb',
			presenter: grandparentPresenter,
			store: { enabled: true },
			_storeDir: storeDir,
			_skipTopLevelCheck: true,
			_depth: DEPTH.grandparent,
		} satisfies InternalConfig)

		await child.reportAndPrompt(new Error('deep nested error'))

		expect(grandparentPresenter.prompt).toHaveBeenCalled()
	})

	test('6: child alone without parent works normally', async () => {
		const childPresenter = createTestPresenter({ type: 'cancel' })

		const child = createReporter({
			repo: 'test-owner/test-repo',
			app: { name: 'standalone-sdk', version: '0.1.0' },
			preset: 'sdk',
			presenter: childPresenter,
			store: { enabled: true },
			_storeDir: storeDir,
			_skipTopLevelCheck: true,
			_depth: DEPTH.child,
		} satisfies InternalConfig)

		await child.reportAndPrompt(new Error('standalone error'))

		const store = new Store(storeDir)
		const reports = await store.list('standalone-sdk')
		expect(reports).toHaveLength(1)
	})
})
