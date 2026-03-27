import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Store } from '@cluvo/core'
import { handlePresenterAction } from '../src/action-handler.js'
import { cleanTempDir, createTempDir, makeDraft, makeReport } from './fixtures.js'

const draft = makeDraft()

describe('handlePresenterAction', () => {
	let storeDir: string
	let store: Store

	beforeEach(async () => {
		storeDir = await createTempDir()
		store = new Store(storeDir)
	})
	afterEach(async () => {
		await cleanTempDir(storeDir)
	})

	test('cancel action updates status to dismissed', async () => {
		const report = makeReport()
		await store.save(report)
		await handlePresenterAction(
			{ type: 'cancel' },
			{ report, draft, repo: 'owner/repo', storeDir, store },
		)
		const loaded = await store.load('test-app', 'test-id')
		expect(loaded?.status).toBe('dismissed')
	})

	test('null action updates status to dismissed', async () => {
		const report = makeReport()
		await store.save(report)
		await handlePresenterAction(null, {
			report,
			draft,
			repo: 'owner/repo',
			storeDir,
			store,
		})
		const loaded = await store.load('test-app', 'test-id')
		expect(loaded?.status).toBe('dismissed')
	})

	test('save action updates status to dismissed', async () => {
		const report = makeReport()
		await store.save(report)
		await handlePresenterAction(
			{ type: 'save' },
			{ report, draft, repo: 'owner/repo', storeDir, store },
		)
		const loaded = await store.load('test-app', 'test-id')
		expect(loaded?.status).toBe('dismissed')
	})

	test('open action updates status to submitted', async () => {
		const report = makeReport()
		await store.save(report)
		await handlePresenterAction(
			{ type: 'open' },
			{ report, draft, repo: 'owner/repo', storeDir, store },
		)
		const loaded = await store.load('test-app', 'test-id')
		expect(loaded?.status).toBe('submitted')
	})

	test('gh action updates status to submitted', async () => {
		const report = makeReport()
		await store.save(report)
		await handlePresenterAction(
			{ type: 'gh' },
			{ report, draft, repo: 'owner/repo', storeDir, store },
		)
		const loaded = await store.load('test-app', 'test-id')
		expect(loaded?.status).toBe('submitted')
	})
})
