import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { runScript, createTempStoreDir, readReports, SDK_IMPORT } from '../helpers/subprocess.js'
import { mockFetchScript } from '../helpers/mock-fetch.js'
import { environments } from '../helpers/environments.js'

describe('E2E: subprocess-sdk/reporting', () => {
  let storeDir: string

  beforeEach(async () => {
    storeDir = await createTempStoreDir()
  })

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true })
  })

  const baseScript = (body: string, configOverrides: string = '') => `
import { createReporter } from '${SDK_IMPORT}';

const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  interactive: 'never',
  nonInteractive: 'save',
  store: { enabled: true },
  _storeDir: storeDir,
  ${configOverrides}
});

${body}
`

  test('1: reportError() nonInteractive=save -> report in store with status pending', async () => {
    const result = await runScript(
      baseScript(`await reporter.reportError(new Error('test error'));`),
      { env: environments.pipe, storeDir, prependCode: mockFetchScript() },
    )

    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
    expect(reports[0].error.message).toBe('test error')
    // reportError() only saves — does not call promptAndSubmit, so status stays pending
    expect(reports[0].status).toBe('pending')
  })

  test('2: reportAndPrompt() nonInteractive=save -> saved and dismissed', async () => {
    const result = await runScript(
      baseScript(`await reporter.reportAndPrompt(new Error('prompt error'));`),
      { env: environments.pipe, storeDir, prependCode: mockFetchScript() },
    )

    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
    // promptAndSubmit calls handleNonInteractive then updateStatus('dismissed')
    expect(reports[0].status).toBe('dismissed')
  })

  test('3: reportAndPrompt() nonInteractive=silent -> no stdout, report in store', async () => {
    const result = await runScript(
      baseScript(
        `await reporter.reportAndPrompt(new Error('silent error'));`,
        `nonInteractive: 'silent',`,
      ),
      { env: environments.pipe, storeDir, prependCode: mockFetchScript() },
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe('')
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
  })

  test('4: reportAndPrompt() nonInteractive=log -> stderr has path', async () => {
    const result = await runScript(
      baseScript(
        `await reporter.reportAndPrompt(new Error('log error'));`,
        `nonInteractive: 'log',`,
      ),
      { env: environments.pipe, storeDir, prependCode: mockFetchScript() },
    )

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain('Bug report saved to')
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
  })

  test('5: wrap() + error -> exitCode!=0, report in store', async () => {
    const result = await runScript(
      baseScript(`
await reporter.wrap(async () => {
  throw new Error('wrapped error');
});
`),
      { env: environments.pipe, storeDir, prependCode: mockFetchScript() },
    )

    expect(result.exitCode).not.toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
    expect(reports[0].error.message).toBe('wrapped error')
  })

  test('6: wrap() + no error -> exitCode=0, store empty', async () => {
    const result = await runScript(
      baseScript(`
await reporter.wrap(async () => {
  // no error
});
`),
      { env: environments.pipe, storeDir, prependCode: mockFetchScript() },
    )

    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(0)
  })

  test('7: wrapCommand() captures process.argv context', async () => {
    const script = `
import { createReporter } from '${SDK_IMPORT}';
process.argv = ['bun', 'cli', 'deploy', 'production', '--verbose'];
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  preset: 'cli',
  interactive: 'never',
  nonInteractive: 'save',
  store: { enabled: true },
  _storeDir: storeDir,
});
await reporter.wrapCommand(async () => {
  throw new Error('deploy failed');
});
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })

    expect(result.exitCode).not.toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
    expect(reports[0].command?.command).toBe('deploy')
  })

  test('8: same error x2 -> 1 report in store (dedup)', async () => {
    const result = await runScript(
      baseScript(`
const error = new Error('dedup error');
await reporter.reportError(error);
await reporter.reportError(error);
`),
      { env: environments.pipe, storeDir, prependCode: mockFetchScript() },
    )

    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
  })

  test('9: primitive error (string throw)', async () => {
    const result = await runScript(
      baseScript(`
try {
  throw 'string error thrown';
} catch (e) {
  await reporter.reportError(e);
}
`),
      { env: environments.pipe, storeDir, prependCode: mockFetchScript() },
    )

    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
    expect(reports[0].error.message).toContain('string error thrown')
  })

  test('10: cause chain error -> causeChain in store', async () => {
    const result = await runScript(
      baseScript(`
const root = new Error('root cause');
const mid = new Error('middle', { cause: root });
const top = new Error('top level', { cause: mid });
await reporter.reportError(top);
`),
      { env: environments.pipe, storeDir, prependCode: mockFetchScript() },
    )

    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
    expect(reports[0].error.causeChain?.length).toBeGreaterThanOrEqual(2)
  })

  test('11: reportError() never crashes process', async () => {
    const result = await runScript(
      baseScript(`
await reporter.reportError(undefined);
await reporter.reportError(null);
await reporter.reportError(42);
process.exit(0);
`),
      { env: environments.pipe, storeDir, prependCode: mockFetchScript() },
    )

    expect(result.exitCode).toBe(0)
  })
})
