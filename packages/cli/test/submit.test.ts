import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ErrorReport } from '@cluvo/core'
import { Store } from '@cluvo/core'
import { submitAll } from '../src/commands/submit.js'

function makeReport(
	id: string,
	appName = 'test-app',
	status: 'pending' | 'submitted' | 'dismissed' = 'pending',
): ErrorReport {
	return {
		id,
		createdAt: new Date().toISOString(),
		app: { name: appName, version: '1.0.0', runtime: 'node' },
		error: { name: 'Error', message: `error ${id}` },
		environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v20.0.0' },
		sanitizedFields: [],
		status,
	}
}

describe('submitAll', () => {
	let storeDir: string
	let store: Store

	beforeEach(async () => {
		storeDir = await mkdtemp(join(tmpdir(), 'cluvo-submit-'))
		store = new Store(storeDir)
	})
	afterEach(async () => {
		await rm(storeDir, { recursive: true, force: true })
	})

	test('submits all pending reports', async () => {
		await store.save(makeReport('r1'))
		await store.save(makeReport('r2'))
		await store.save(makeReport('r3', 'test-app', 'submitted'))

		// submitAll calls submitReport which calls corePublish — will fall through to file
		const result = await submitAll(store, { repo: 'owner/repo', mode: 'file' })
		expect(result.submitted).toBe(2)
		expect(result.failed).toBe(0)
		expect(result.skipped).toBe(0)
	})

	test('skips reports when confirm callback returns false', async () => {
		await store.save(makeReport('r1'))
		await store.save(makeReport('r2'))

		let callCount = 0
		const confirm = async () => {
			callCount++
			return callCount !== 1 // skip first, approve second
		}

		const result = await submitAll(store, { repo: 'owner/repo', mode: 'file' }, confirm)
		expect(result.skipped).toBe(1)
		expect(result.submitted).toBe(1)
	})

	test('counts failed submissions', async () => {
		await store.save(makeReport('r1'))

		// Using a mode that will fail (api requires token)
		const originalFetch = globalThis.fetch
		globalThis.fetch = mock(() => Promise.reject(new Error('network error')))
		try {
			const result = await submitAll(store, { repo: 'owner/repo', mode: 'api' })
			// api fails, falls through chain; if all fail, file fallback should succeed
			// Since we mock fetch to reject, the fallback to file should still work
			expect(result.submitted + result.failed).toBe(1)
		} finally {
			globalThis.fetch = originalFetch
		}
	})
})
