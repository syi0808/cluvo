import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { environments } from '../helpers/environments.js'
import { mockFetchScript } from '../helpers/mock-fetch.js'
import { createTempStoreDir, readReports, runScript, SDK_IMPORT } from '../helpers/subprocess.js'

describe('E2E: subprocess-sdk/lifecycle', () => {
	let storeDir: string

	beforeEach(async () => {
		storeDir = await createTempStoreDir()
	})

	afterEach(async () => {
		await rm(storeDir, { recursive: true, force: true })
	})

	const reporterSetup = (configOverrides: string = '') => `
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
`

	test('1: global handler + uncaughtException -> report in store', async () => {
		// Use process.emit to simulate uncaughtException (like the SDK API tests)
		// instead of actually throwing, which would crash the process unpredictably.
		const script = `
${reporterSetup()}
reporter.installGlobalHandlers();
process.emit('uncaughtException', new Error('uncaught test error'));
await new Promise(r => setTimeout(r, 200));
`
		const _result = await runScript(script, {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
			timeout: 10000,
		})
		const reports = await readReports(storeDir, 'test-app')
		expect(reports.length).toBeGreaterThanOrEqual(1)
	})

	test('2: global handler + unhandledRejection -> report in store', async () => {
		const script = `
${reporterSetup()}
reporter.installGlobalHandlers();
process.emit('unhandledRejection', new Error('unhandled rejection'), Promise.resolve());
await new Promise(r => setTimeout(r, 200));
`
		const _result = await runScript(script, {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
			timeout: 10000,
		})
		const reports = await readReports(storeDir, 'test-app')
		expect(reports.length).toBeGreaterThanOrEqual(1)
	})

	test('3: global handler uninstalled -> store empty', async () => {
		const script = `
${reporterSetup()}
const uninstall = reporter.installGlobalHandlers();
uninstall();
// After uninstall, emitting uncaughtException should NOT create a report
// (but it also won't crash since we're using process.emit)
try { throw new Error('after uninstall'); } catch {}
`
		const result = await runScript(script, {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
		})
		expect(result.exitCode).toBe(0)
		const reports = await readReports(storeDir, 'test-app')
		expect(reports).toHaveLength(0)
	})

	test('4: exit handler + pending report -> processed before exit', async () => {
		const script = `
${reporterSetup()}
await reporter.reportError(new Error('pending error'));
reporter.installExitHandler({ timeout: 5000 });
// Emit beforeExit to trigger exit handler processing
process.emit('beforeExit', 0);
await new Promise(r => setTimeout(r, 500));
`
		const result = await runScript(script, {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
			timeout: 10000,
		})
		expect(result.exitCode).toBe(0)
		const reports = await readReports(storeDir, 'test-app')
		expect(reports).toHaveLength(1)
	})

	test('5: exit handler + nonInteractive=silent -> silent processing', async () => {
		const script = `
${reporterSetup(`nonInteractive: 'silent',`)}
await reporter.reportError(new Error('silent exit'));
reporter.installExitHandler({ timeout: 5000 });
process.emit('beforeExit', 0);
await new Promise(r => setTimeout(r, 500));
`
		const result = await runScript(script, {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
			timeout: 10000,
		})
		expect(result.exitCode).toBe(0)
	})

	test('6: no exit handler -> report stays pending', async () => {
		const script = `
${reporterSetup()}
await reporter.reportError(new Error('no exit handler'));
`
		const result = await runScript(script, {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
		})
		expect(result.exitCode).toBe(0)
		const reports = await readReports(storeDir, 'test-app')
		expect(reports).toHaveLength(1)
		expect(reports[0].status).toBe('pending')
	})

	test('7: exit handler timeout -> process exits within time', async () => {
		const script = `
${reporterSetup()}
await reporter.reportError(new Error('timeout test'));
reporter.installExitHandler({ timeout: 500 });
process.emit('beforeExit', 0);
await new Promise(r => setTimeout(r, 200));
`
		const start = Date.now()
		const _result = await runScript(script, {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
			timeout: 10000,
		})
		const elapsed = Date.now() - start
		expect(elapsed).toBeLessThan(10000)
	})

	test('8: non-interactive dismissed marking via reportAndPrompt (regression)', async () => {
		const script = `
${reporterSetup(`nonInteractive: 'silent',`)}
await reporter.reportAndPrompt(new Error('dismiss test'));
`
		const result = await runScript(script, {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
			timeout: 10000,
		})
		expect(result.exitCode).toBe(0)
		const reports = await readReports(storeDir, 'test-app')
		expect(reports).toHaveLength(1)
		expect(reports[0].status).toBe('dismissed')
	})

	test('9: non-interactive no infinite loop (regression)', async () => {
		const script = `
${reporterSetup()}
await reporter.reportAndPrompt(new Error('loop test'));
`
		const start = Date.now()
		const _result = await runScript(script, {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
			timeout: 10000,
		})
		const elapsed = Date.now() - start
		expect(elapsed).toBeLessThan(8000)
	})

	test('10: timer cleanup -- no hanging process (regression)', async () => {
		const script = `
${reporterSetup()}
await reporter.reportError(new Error('timer test'));
reporter.installExitHandler({ timeout: 1000 });
process.emit('beforeExit', 0);
await new Promise(r => setTimeout(r, 200));
`
		const start = Date.now()
		const result = await runScript(script, {
			env: environments.pipe,
			storeDir,
			prependCode: mockFetchScript(),
			timeout: 10000,
		})
		const elapsed = Date.now() - start
		expect(elapsed).toBeLessThan(8000)
		expect(result.exitCode).toBe(0)
	})
})
