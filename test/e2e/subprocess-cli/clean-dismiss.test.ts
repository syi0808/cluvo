import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ErrorReport } from '@cluvo/core'
import { makeReport } from '../helpers/fixtures.js'
import { createTempStoreDir, readReports, runCluvo, seedReports } from '../helpers/subprocess.js'

describe('E2E: subprocess-cli/clean-dismiss', () => {
	let storeDir: string
	let cluvoStoreDir: string

	beforeEach(async () => {
		storeDir = await createTempStoreDir()
		cluvoStoreDir = join(storeDir, '.cluvo')
	})

	afterEach(async () => {
		await rm(storeDir, { recursive: true, force: true })
	})

	/** Read a single report from the CLI store. */
	async function readReport(appName: string, id: string): Promise<ErrorReport> {
		const content = await readFile(join(cluvoStoreDir, 'reports', appName, `${id}.json`), 'utf-8')
		return JSON.parse(content)
	}

	test('1: cluvo dismiss <id> -> status becomes dismissed', async () => {
		const report = makeReport('rpt-dis-1', 'test-app')
		await seedReports(cluvoStoreDir, 'test-app', [report])

		const result = await runCluvo(['dismiss', 'rpt-dis-1'], { storeDir })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain('Dismissed rpt-dis-1')

		const updated = await readReport('test-app', 'rpt-dis-1')
		expect(updated.status).toBe('dismissed')
	})

	test('2: cluvo dismiss already-dismissed is idempotent', async () => {
		const report = makeReport('rpt-dis-2', 'test-app', { status: 'dismissed' })
		await seedReports(cluvoStoreDir, 'test-app', [report])

		const result = await runCluvo(['dismiss', 'rpt-dis-2'], { storeDir })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain('Dismissed rpt-dis-2')

		const updated = await readReport('test-app', 'rpt-dis-2')
		expect(updated.status).toBe('dismissed')
	})

	test('3: cluvo clean removes submitted+dismissed, keeps pending', async () => {
		const reports = [
			makeReport('rpt-pending', 'test-app', { status: 'pending' }),
			makeReport('rpt-submitted', 'test-app', { status: 'submitted' }),
			makeReport('rpt-dismissed', 'test-app', { status: 'dismissed' }),
		]
		await seedReports(cluvoStoreDir, 'test-app', reports)

		const result = await runCluvo(['clean'], { storeDir })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain('Cleaned 2 report(s)')

		// Verify pending still exists, others removed
		const remaining = await readReports(cluvoStoreDir, 'test-app')
		expect(remaining).toHaveLength(1)
		expect(remaining[0].id).toBe('rpt-pending')
	})

	test('4: cluvo clean on empty store shows no error', async () => {
		const result = await runCluvo(['clean'], { storeDir })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain('Cleaned 0 report(s)')
	})

	test('5: cluvo clean --older-than 7d only removes old reports', async () => {
		const now = new Date()
		const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
		const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()

		const reports = [
			makeReport('rpt-old-submitted', 'test-app', {
				status: 'submitted',
				createdAt: tenDaysAgo,
			}),
			makeReport('rpt-recent-submitted', 'test-app', {
				status: 'submitted',
				createdAt: oneHourAgo,
			}),
			makeReport('rpt-pending', 'test-app', {
				status: 'pending',
				createdAt: tenDaysAgo,
			}),
		]
		await seedReports(cluvoStoreDir, 'test-app', reports)

		const result = await runCluvo(['clean', '--older-than', '7d'], { storeDir })

		expect(result.exitCode).toBe(0)
		// Only the old submitted report should be cleaned
		expect(result.stdout).toContain('Cleaned 1 report(s)')

		const remaining = await readReports(cluvoStoreDir, 'test-app')
		expect(remaining).toHaveLength(2)
		const ids = remaining.map((r) => r.id).sort()
		expect(ids).toEqual(['rpt-pending', 'rpt-recent-submitted'])
	})
})
