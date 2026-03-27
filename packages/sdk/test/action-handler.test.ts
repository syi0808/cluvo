import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type DraftPayload, type ErrorReport, Store } from '@cluvo/core'
import { handlePresenterAction } from '../src/action-handler.js'

function makeReport(overrides: Partial<ErrorReport> = {}): ErrorReport {
	return {
		id: 'test-id',
		createdAt: '2026-03-27T10:00:00Z',
		app: { name: 'test-app', version: '1.0.0', runtime: 'node' },
		error: { name: 'Error', message: 'test error' },
		environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v22.0.0' },
		sanitizedFields: [],
		status: 'pending',
		...overrides,
	}
}

const draft: DraftPayload = {
	title: 'Error: test error',
	body: '## Summary\n\nTest body',
}

describe('handlePresenterAction', () => {
	let storeDir: string
	let store: Store

	beforeEach(async () => {
		storeDir = await mkdtemp(join(tmpdir(), 'cluvo-action-'))
		store = new Store(storeDir)
	})
	afterEach(async () => {
		await rm(storeDir, { recursive: true, force: true })
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
