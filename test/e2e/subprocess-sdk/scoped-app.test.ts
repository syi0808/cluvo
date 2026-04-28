import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { environments } from '../helpers/environments.js'
import { mockFetchScript } from '../helpers/mock-fetch.js'
import {
	createTempStoreDir,
	readReports,
	runCluvo,
	runScript,
	SDK_IMPORT,
} from '../helpers/subprocess.js'

describe('E2E: subprocess-sdk/scoped-app', () => {
	let homeDir: string
	let cluvoStoreDir: string

	beforeEach(async () => {
		homeDir = await createTempStoreDir()
		cluvoStoreDir = join(homeDir, '.cluvo')
	})

	afterEach(async () => {
		await rm(homeDir, { recursive: true, force: true })
	})

	test('pubm-like scoped app reports are visible to the CLI store listing', async () => {
		const script = `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: '@pubm/cli', version: '1.0.0' },
  preset: 'cli',
  interactive: 'never',
  nonInteractive: 'silent',
  store: { enabled: true },
  _storeDir: storeDir,
});
await reporter.reportError(new Error('scoped app failure'));
`
		const result = await runScript(script, {
			env: environments.pipe,
			storeDir: cluvoStoreDir,
			prependCode: mockFetchScript(),
		})
		expect(result.exitCode).toBe(0)

		const reports = await readReports(cluvoStoreDir, '@pubm/cli')
		expect(reports).toHaveLength(1)
		expect(reports[0].error.message).toBe('scoped app failure')

		const list = await runCluvo(['list', '--all'], { storeDir: homeDir })
		expect(list.exitCode).toBe(0)
		expect(list.stdout).toContain('@pubm/cli')
		expect(list.stdout).toContain('scoped app failure')
	})
})
