import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store/store.js'
import type { ErrorReport } from '../src/types.js'

function makeReport(
	id: string,
	status: 'pending' | 'submitted' | 'dismissed' = 'pending',
): ErrorReport {
	return {
		id,
		createdAt: new Date().toISOString(),
		app: { name: 'test-app', version: '1.0.0', runtime: 'node' },
		error: { name: 'Error', message: `error ${id}` },
		environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v20.0.0' },
		sanitizedFields: [],
		status,
	}
}

describe('Store', () => {
	let storeDir: string
	let store: Store

	beforeEach(async () => {
		storeDir = await mkdtemp(join(tmpdir(), 'cluvo-test-'))
		store = new Store(storeDir)
	})

	afterEach(async () => {
		await rm(storeDir, { recursive: true, force: true })
	})

	test('save and load a report', async () => {
		const report = makeReport('r1')
		await store.save(report)
		const loaded = await store.load('test-app', 'r1')
		expect(loaded).not.toBeNull()
		expect(loaded!.id).toBe('r1')
		expect(loaded!.error.message).toBe('error r1')
	})

	test('list reports for an app', async () => {
		await store.save(makeReport('r1'))
		await store.save(makeReport('r2'))
		const list = await store.list('test-app')
		expect(list).toHaveLength(2)
	})

	test('list only pending reports', async () => {
		await store.save(makeReport('r1', 'pending'))
		await store.save(makeReport('r2', 'submitted'))
		const list = await store.list('test-app', { statusFilter: 'pending' })
		expect(list).toHaveLength(1)
		expect(list[0].id).toBe('r1')
	})

	test('list all apps', async () => {
		await store.save(makeReport('r1'))
		const r2 = makeReport('r2')
		r2.app.name = 'other-app'
		await store.save(r2)
		const list = await store.list()
		expect(list).toHaveLength(2)
	})

	test('update report status', async () => {
		await store.save(makeReport('r1'))
		await store.updateStatus('test-app', 'r1', 'submitted', 'https://github.com/issue/1')
		const loaded = await store.load('test-app', 'r1')
		expect(loaded!.status).toBe('submitted')
		expect(loaded!.issueUrl).toBe('https://github.com/issue/1')
	})

	test('delete a report', async () => {
		await store.save(makeReport('r1'))
		await store.delete('test-app', 'r1')
		const loaded = await store.load('test-app', 'r1')
		expect(loaded).toBeNull()
	})

	test('clean removes submitted and dismissed', async () => {
		await store.save(makeReport('r1', 'pending'))
		await store.save(makeReport('r2', 'submitted'))
		await store.save(makeReport('r3', 'dismissed'))
		await store.clean('test-app')
		const list = await store.list('test-app')
		expect(list).toHaveLength(1)
		expect(list[0].id).toBe('r1')
	})

	test('evict oldest when maxReports exceeded', async () => {
		const smallStore = new Store(storeDir, 2)
		await smallStore.save(makeReport('r1', 'submitted'))
		await smallStore.save(makeReport('r2', 'pending'))
		await smallStore.save(makeReport('r3', 'pending'))
		const list = await smallStore.list('test-app')
		expect(list).toHaveLength(2)
		// r1 (submitted) should be evicted first
		expect(list.find((r) => r.id === 'r1')).toBeUndefined()
	})

	test('findById searches across multiple apps', async () => {
		await store.save(makeReport('r1'))
		const r2 = makeReport('r2')
		r2.app.name = 'other-app'
		await store.save(r2)
		const found = await store.findById('r2')
		expect(found).not.toBeNull()
		expect(found!.id).toBe('r2')
		expect(found!.app.name).toBe('other-app')
	})

	test('findById returns null when id does not exist', async () => {
		const found = await store.findById('nonexistent')
		expect(found).toBeNull()
	})

	test('listApps returns empty when reports dir does not exist', async () => {
		// New store with no saves — listApps called implicitly via list()
		const list = await store.list()
		expect(list).toHaveLength(0)
	})

	test('list skips malformed report files without dropping valid reports', async () => {
		await store.save(makeReport('r-valid'))
		await writeFile(join(storeDir, 'reports', 'test-app', '0-broken.json'), '{not json', 'utf-8')

		const list = await store.list('test-app')

		expect(list).toHaveLength(1)
		expect(list[0].id).toBe('r-valid')
	})

	test('supports scoped package names as one logical app', async () => {
		const report = makeReport('r-scoped')
		report.app.name = '@scope/pkg'

		await store.save(report)

		const loaded = await store.load('@scope/pkg', 'r-scoped')
		const all = await store.list()

		expect(loaded?.app.name).toBe('@scope/pkg')
		expect(all.map((r) => r.id)).toContain('r-scoped')
		expect(await store.findById('r-scoped')).not.toBeNull()
	})

	test('reads legacy scoped app directories created before app name encoding', async () => {
		const report = makeReport('r-legacy')
		report.app.name = '@legacy/pkg'
		const legacyDir = join(storeDir, 'reports', '@legacy', 'pkg')
		await mkdir(legacyDir, { recursive: true })
		await writeFile(join(legacyDir, 'r-legacy.json'), JSON.stringify(report), 'utf-8')

		const list = await store.list()
		const loaded = await store.load('@legacy/pkg', 'r-legacy')

		expect(list.map((r) => r.id)).toContain('r-legacy')
		expect(loaded?.app.name).toBe('@legacy/pkg')
	})

	test('encodes unsafe app names instead of treating them as paths', async () => {
		const report = makeReport('r-traversal')
		report.app.name = '../escape'

		await store.save(report)

		expect(existsSync(join(storeDir, 'escape', 'r-traversal.json'))).toBe(false)
		expect(await store.load('../escape', 'r-traversal')).not.toBeNull()
	})

	test('encodes unsafe report ids instead of treating them as paths', async () => {
		const report = makeReport('../escape')

		await store.save(report)

		expect(existsSync(join(storeDir, 'reports', 'escape.json'))).toBe(false)
		expect(await store.load('test-app', '../escape')).not.toBeNull()
	})

	test('clean with olderThanMs only removes old reports', async () => {
		// Save a recent submitted report
		const recent = makeReport('r-recent', 'submitted')
		recent.createdAt = new Date().toISOString()
		await store.save(recent)

		// Save an old submitted report
		const old = makeReport('r-old', 'submitted')
		old.createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
		await store.save(old)

		await store.clean('test-app', 5 * 24 * 60 * 60 * 1000) // 5 days

		const list = await store.list('test-app')
		expect(list).toHaveLength(1)
		expect(list[0].id).toBe('r-recent')
	})

	test('evict prioritizes submitted over dismissed over pending', async () => {
		const smallStore = new Store(storeDir, 2)
		await smallStore.save(makeReport('r-pending', 'pending'))
		await smallStore.save(makeReport('r-dismissed', 'dismissed'))
		await smallStore.save(makeReport('r-submitted', 'submitted'))
		const list = await smallStore.list('test-app')
		expect(list).toHaveLength(2)
		// submitted should be evicted first
		expect(list.find((r) => r.id === 'r-submitted')).toBeUndefined()
		expect(list.find((r) => r.id === 'r-pending')).toBeDefined()
	})

	test('evict warns to stderr when pending reports are evicted', async () => {
		const smallStore = new Store(storeDir, 2)
		await smallStore.save(makeReport('r1', 'pending'))
		await smallStore.save(makeReport('r2', 'pending'))

		const chunks: string[] = []
		const origWrite = process.stderr.write
		process.stderr.write = ((chunk: string) => {
			chunks.push(chunk)
			return true
		}) as typeof process.stderr.write

		await smallStore.save(makeReport('r3', 'pending'))

		process.stderr.write = origWrite
		expect(chunks.some((c) => c.includes('pending'))).toBe(true)
	})

	test('evict does not warn when only submitted reports are evicted', async () => {
		const smallStore = new Store(storeDir, 2)
		await smallStore.save(makeReport('r1', 'submitted'))
		await smallStore.save(makeReport('r2', 'pending'))

		const chunks: string[] = []
		const origWrite = process.stderr.write
		process.stderr.write = ((chunk: string) => {
			chunks.push(chunk)
			return true
		}) as typeof process.stderr.write

		await smallStore.save(makeReport('r3', 'pending'))

		process.stderr.write = origWrite
		expect(chunks.some((c) => c.includes('pending'))).toBe(false)
	})
})
