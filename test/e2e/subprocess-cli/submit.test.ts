import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ErrorReport } from '@cluvo/core'
import { makeReport } from '../helpers/fixtures.js'
import { createTempStoreDir, runCluvo, seedReports } from '../helpers/subprocess.js'

describe('E2E: subprocess-cli/submit', () => {
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

	test('1: cluvo submit <id> --repo -> status becomes submitted', async () => {
		const report = makeReport('rpt-sub-1', 'test-app')
		await seedReports(cluvoStoreDir, 'test-app', [report])

		// Submit will fall back to file mode in test env (no gh, no browser, no token)
		const result = await runCluvo(['submit', 'rpt-sub-1', '--repo', 'owner/repo'], { storeDir })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain('Submitted')

		// Verify status updated on disk
		const updated = await readReport('test-app', 'rpt-sub-1')
		expect(updated.status).toBe('submitted')
	})

	test('2: cluvo submit already-submitted report re-submits', async () => {
		const report = makeReport('rpt-sub-2', 'test-app', { status: 'submitted' })
		await seedReports(cluvoStoreDir, 'test-app', [report])

		const result = await runCluvo(['submit', 'rpt-sub-2', '--repo', 'owner/repo'], { storeDir })

		// The CLI does not guard against re-submitting; it succeeds
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain('Submitted')
	})

	test('3: cluvo submit dismissed report still submits', async () => {
		const report = makeReport('rpt-sub-3', 'test-app', { status: 'dismissed' })
		await seedReports(cluvoStoreDir, 'test-app', [report])

		const result = await runCluvo(['submit', 'rpt-sub-3', '--repo', 'owner/repo'], { storeDir })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain('Submitted')

		const updated = await readReport('test-app', 'rpt-sub-3')
		expect(updated.status).toBe('submitted')
	})

	test('4: cluvo submit with no id shows usage hint or not-found error', async () => {
		// When args are ['submit', '--repo', 'owner/repo'], args[1] is '--repo'
		// which gets interpreted as the id, leading to "Report --repo not found"
		const result = await runCluvo(['submit', '--repo', 'owner/repo'], { storeDir })
		expect(result.exitCode).toBe(1)
		expect(result.stderr).toContain('not found')

		// Without --repo flag at all, the CLI requires --repo first
		const result2 = await runCluvo(['submit'], { storeDir })
		expect(result2.exitCode).toBe(1)
		expect(result2.stderr).toContain('--repo is required')
	})
})
