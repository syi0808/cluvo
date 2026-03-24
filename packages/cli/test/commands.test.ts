import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ErrorReport } from '@cluvo/core'
import { Store } from '@cluvo/core'
import { cleanReports } from '../src/commands/clean.js'
import { dismissReport } from '../src/commands/dismiss.js'
import { formatReportList, listReports } from '../src/commands/list.js'
import { formatReportDetail, showReport } from '../src/commands/show.js'

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

describe('CLI commands', () => {
	let storeDir: string
	let store: Store

	beforeEach(async () => {
		storeDir = await mkdtemp(join(tmpdir(), 'cluvo-cli-'))
		store = new Store(storeDir)
	})
	afterEach(async () => {
		await rm(storeDir, { recursive: true, force: true })
	})

	test('list returns pending reports', async () => {
		await store.save(makeReport('r1'))
		await store.save(makeReport('r2', 'test-app', 'submitted'))
		const result = await listReports(store, {})
		expect(result).toHaveLength(1)
		expect(result[0].id).toBe('r1')
	})

	test('list --all returns all reports', async () => {
		await store.save(makeReport('r1'))
		await store.save(makeReport('r2', 'test-app', 'submitted'))
		const result = await listReports(store, { all: true })
		expect(result).toHaveLength(2)
	})

	test('list --app filters by app', async () => {
		await store.save(makeReport('r1', 'app-a'))
		await store.save(makeReport('r2', 'app-b'))
		const result = await listReports(store, { app: 'app-a', all: true })
		expect(result).toHaveLength(1)
	})

	test('show returns specific report', async () => {
		await store.save(makeReport('r1'))
		const result = await showReport(store, 'r1')
		expect(result).not.toBeNull()
		expect(result!.id).toBe('r1')
	})

	test('dismiss updates report status', async () => {
		await store.save(makeReport('r1'))
		await dismissReport(store, 'test-app', 'r1')
		const report = await store.load('test-app', 'r1')
		expect(report!.status).toBe('dismissed')
	})

	test('clean removes submitted/dismissed', async () => {
		await store.save(makeReport('r1', 'test-app', 'pending'))
		await store.save(makeReport('r2', 'test-app', 'submitted'))
		await cleanReports(store, {})
		const all = await store.list('test-app')
		expect(all).toHaveLength(1)
		expect(all[0].id).toBe('r1')
	})

	test('formatReportList returns "No reports found." for empty list', () => {
		expect(formatReportList([])).toBe('No reports found.')
	})

	test('formatReportList shows status indicators', () => {
		const reports = [
			makeReport('r1', 'app', 'pending'),
			makeReport('r2', 'app', 'submitted'),
			makeReport('r3', 'app', 'dismissed'),
		]
		const output = formatReportList(reports)
		expect(output).toContain('●')
		expect(output).toContain('✓')
		expect(output).toContain('✗')
	})

	test('formatReportDetail includes body content', async () => {
		const report = makeReport('r1')
		report.error = { name: 'TypeError', message: 'x is not a function', stack: 'at foo.ts:1:1' }
		const output = formatReportDetail(report)
		expect(output).toContain('TypeError')
		expect(output).toContain('x is not a function')
		expect(output).toContain('## Environment')
	})

	test('showReport returns null for nonexistent id', async () => {
		const result = await showReport(store, 'nonexistent')
		expect(result).toBeNull()
	})

	test('cleanReports with olderThanDays only cleans old reports', async () => {
		const recent = makeReport('r-recent', 'test-app', 'submitted')
		recent.createdAt = new Date().toISOString()
		await store.save(recent)

		const old = makeReport('r-old', 'test-app', 'submitted')
		old.createdAt = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
		await store.save(old)

		const removed = await cleanReports(store, { olderThanDays: 30 })
		expect(removed).toBe(1)
		const remaining = await store.list('test-app')
		expect(remaining).toHaveLength(1)
		expect(remaining[0].id).toBe('r-recent')
	})
})
