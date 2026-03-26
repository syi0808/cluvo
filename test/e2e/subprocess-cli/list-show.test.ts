import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { makeReport } from '../helpers/fixtures.js'
import { createTempStoreDir, runCluvo, seedReports } from '../helpers/subprocess.js'

describe('E2E: subprocess-cli/list-show', () => {
	let storeDir: string
	let cluvoStoreDir: string

	beforeEach(async () => {
		storeDir = await createTempStoreDir()
		// CLI resolves store at <HOME>/.cluvo, and HOME is set to storeDir
		cluvoStoreDir = join(storeDir, '.cluvo')
	})

	afterEach(async () => {
		await rm(storeDir, { recursive: true, force: true })
	})

	test('1: cluvo list with 3 pending reports shows all', async () => {
		const reports = [
			makeReport('rpt-001', 'test-app'),
			makeReport('rpt-002', 'test-app'),
			makeReport('rpt-003', 'test-app'),
		]
		await seedReports(cluvoStoreDir, 'test-app', reports)

		const result = await runCluvo(['list'], { storeDir })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain('rpt-001')
		expect(result.stdout).toContain('rpt-002')
		expect(result.stdout).toContain('rpt-003')
		// All pending -> bullet indicator
		expect(result.stdout).toContain('\u25CF')
	})

	test('2: cluvo list with no reports shows empty message', async () => {
		const result = await runCluvo(['list'], { storeDir })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain('No reports found.')
	})

	test('3: cluvo list with mixed apps shows reports from all apps', async () => {
		const reportsA = [makeReport('rpt-a1', 'app-alpha')]
		const reportsB = [makeReport('rpt-b1', 'app-beta')]
		await seedReports(cluvoStoreDir, 'app-alpha', reportsA)
		await seedReports(cluvoStoreDir, 'app-beta', reportsB)

		const result = await runCluvo(['list'], { storeDir })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain('rpt-a1')
		expect(result.stdout).toContain('app-alpha')
		expect(result.stdout).toContain('rpt-b1')
		expect(result.stdout).toContain('app-beta')
	})

	test('4: cluvo show <id> displays report detail', async () => {
		const report = makeReport('rpt-detail', 'test-app', {
			error: { name: 'TypeError', message: 'Cannot read properties of undefined' },
		})
		await seedReports(cluvoStoreDir, 'test-app', [report])

		const result = await runCluvo(['show', 'rpt-detail'], { storeDir })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain('TypeError')
		expect(result.stdout).toContain('Cannot read properties of undefined')
	})

	test('5: cluvo show with non-existent id exits with error', async () => {
		const result = await runCluvo(['show', 'nonexistent-id'], { storeDir })

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toContain('not found')
	})

	test('6: cluvo list --all shows submitted and dismissed reports too', async () => {
		const reports = [
			makeReport('rpt-pending', 'test-app', { status: 'pending' }),
			makeReport('rpt-submitted', 'test-app', { status: 'submitted' }),
			makeReport('rpt-dismissed', 'test-app', { status: 'dismissed' }),
		]
		await seedReports(cluvoStoreDir, 'test-app', reports)

		// Without --all: only pending
		const listDefault = await runCluvo(['list'], { storeDir })
		expect(listDefault.exitCode).toBe(0)
		expect(listDefault.stdout).toContain('rpt-pending')
		expect(listDefault.stdout).not.toContain('rpt-submitted')
		expect(listDefault.stdout).not.toContain('rpt-dismissed')

		// With --all: all statuses
		const listAll = await runCluvo(['list', '--all'], { storeDir })
		expect(listAll.exitCode).toBe(0)
		expect(listAll.stdout).toContain('rpt-pending')
		expect(listAll.stdout).toContain('rpt-submitted')
		expect(listAll.stdout).toContain('rpt-dismissed')
	})
})
