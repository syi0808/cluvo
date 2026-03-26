import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { environments } from '../helpers/environments.js'
import { mockFetchScript } from '../helpers/mock-fetch.js'
import { createTempStoreDir, runScript, SDK_IMPORT } from '../helpers/subprocess.js'

describe('E2E: subprocess-sdk/publishing', () => {
	let storeDir: string

	beforeEach(async () => {
		storeDir = await createTempStoreDir()
	})

	afterEach(async () => {
		await rm(storeDir, { recursive: true, force: true })
	})

	// Publishing tests call reporter.publish(draft) directly since the
	// non-interactive path (interactive: 'never') does not invoke publish.
	const publishScript = (
		configOverrides: string,
		errorExpr: string = `new Error('test error')`,
	) => `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  interactive: 'never',
  nonInteractive: 'silent',
  store: { enabled: true },
  _storeDir: storeDir,
  ${configOverrides}
});
const report = await reporter.reportError(${errorExpr});
const draft = reporter.buildDraft(report);
const result = await reporter.publish(draft);
// Write result to stdout so the test can inspect it
process.stdout.write(JSON.stringify(result));
`

	test('1: mode=file creates markdown via publish()', async () => {
		const result = await runScript(publishScript(`mode: 'file',`), {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
		})
		expect(result.exitCode).toBe(0)
		const publishResult = JSON.parse(result.stdout)
		expect(publishResult.method).toBe('file')
		expect(publishResult.filePath).toBeTruthy()
	})

	test('2: mode=api + token + mock success -> api method + issueUrl', async () => {
		const result = await runScript(publishScript(`mode: 'api',`), {
			env: environments.localDevWithToken,
			storeDir,
			prependCode: mockFetchScript({
				createIssueUrl: 'https://github.com/test/repo/issues/42',
			}),
		})
		expect(result.exitCode).toBe(0)
		const publishResult = JSON.parse(result.stdout)
		expect(publishResult.method).toBe('api')
		expect(publishResult.issueUrl).toContain('github.com')
	})

	test('3: mode=api + no token -> file fallback', async () => {
		const result = await runScript(publishScript(`mode: 'api',`), {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
		})
		expect(result.exitCode).toBe(0)
		const publishResult = JSON.parse(result.stdout)
		expect(publishResult.method).toBe('file')
		expect(publishResult.filePath).toBeTruthy()
	})

	test('4: mode=browser + body > 8000 chars -> file fallback', async () => {
		const longMsg = 'x'.repeat(10000)
		const result = await runScript(publishScript(`mode: 'browser',`, `new Error('${longMsg}')`), {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
		})
		expect(result.exitCode).toBe(0)
		const publishResult = JSON.parse(result.stdout)
		expect(publishResult.method).toBe('file')
		expect(publishResult.filePath).toBeTruthy()
	})

	test('5: post-publish api returns issueUrl', async () => {
		const result = await runScript(publishScript(`mode: 'api',`), {
			env: environments.localDevWithToken,
			storeDir,
			prependCode: mockFetchScript({
				createIssueUrl: 'https://github.com/test/repo/issues/55',
			}),
		})
		expect(result.exitCode).toBe(0)
		const publishResult = JSON.parse(result.stdout)
		expect(publishResult.method).toBe('api')
		expect(publishResult.issueUrl).toBe('https://github.com/test/repo/issues/55')
	})

	test('6: custom labels included in draft', async () => {
		const script = `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  interactive: 'never',
  nonInteractive: 'silent',
  store: { enabled: true },
  _storeDir: storeDir,
  issue: { labels: ['bug', 'auto-report'] },
});
const report = await reporter.reportError(new Error('label test'));
const draft = reporter.buildDraft(report);
process.stdout.write(JSON.stringify(draft));
`
		const result = await runScript(script, {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
		})
		expect(result.exitCode).toBe(0)
		const draft = JSON.parse(result.stdout)
		expect(draft.labels).toContain('bug')
		expect(draft.labels).toContain('auto-report')
	})
})
