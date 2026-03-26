import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { runScript, createTempStoreDir, readReports, SDK_IMPORT } from '../helpers/subprocess.js'
import { mockFetchScript } from '../helpers/mock-fetch.js'
import { environments } from '../helpers/environments.js'

describe('E2E: subprocess-sdk/config', () => {
  let storeDir: string

  beforeEach(async () => {
    storeDir = await createTempStoreDir()
  })

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true })
  })

  test('1: cli preset -- store report has argv', async () => {
    const script = `
import { createReporter } from '${SDK_IMPORT}';
process.argv = ['bun', 'cli', 'deploy', '--force'];
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  preset: 'cli',
  interactive: 'never', nonInteractive: 'silent',
  store: { enabled: true }, _storeDir: storeDir,
});
await reporter.wrapCommand(async () => { throw new Error('test'); });
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
    expect(reports[0].command?.argv).toContain('--force')
  })

  test('2: sdk preset -- no argv captured', async () => {
    const script = `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  preset: 'sdk',
  store: { enabled: true }, _storeDir: storeDir,
});
await reporter.reportError(new Error('sdk test'));
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    // sdk preset has collect.argv=false, so command should be undefined
    expect(reports[0].command).toBeUndefined()
  })

  test('3: preset + override -- override applied', async () => {
    const script = `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  preset: 'sdk',
  collect: { diagnosticReport: true },
  interactive: 'never', nonInteractive: 'silent',
  store: { enabled: true }, _storeDir: storeDir,
});
await reporter.reportError(new Error('override test'));
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports[0].diagnostic).toBeDefined()
  })

  test('4: diagnosticReport=true -- diagnostic exists', async () => {
    const script = `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  collect: { diagnosticReport: true },
  interactive: 'never', nonInteractive: 'silent',
  store: { enabled: true }, _storeDir: storeDir,
});
await reporter.reportError(new Error('diagnostic test'));
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports[0].diagnostic).toBeDefined()
    expect(reports[0].diagnostic?.heapUsed).toBeDefined()
  })

  test('5: maxReports=2, 3 saves -- only 2 in store', async () => {
    const script = `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  interactive: 'never', nonInteractive: 'silent',
  store: { enabled: true, maxReports: 2 }, _storeDir: storeDir,
});
await reporter.reportError(new Error('error 1'));
await reporter.reportError(new Error('error 2'));
await reporter.reportError(new Error('error 3'));
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(2)
  })

  test('6: store.enabled=false -- no files in store', async () => {
    const script = `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  interactive: 'never', nonInteractive: 'silent',
  store: { enabled: false }, _storeDir: storeDir,
});
await reporter.reportError(new Error('no store test'));
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    try {
      const files = await readdir(join(storeDir, 'reports'))
      expect(files).toHaveLength(0)
    } catch {
      // Directory doesn't exist -- expected
    }
  })

  test('7: all options off -- process exits cleanly', async () => {
    const script = `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  interactive: 'never', nonInteractive: 'silent',
  sanitize: { enabled: false },
  dedupe: { enabled: false },
  store: { enabled: false },
  _storeDir: storeDir,
});
await reporter.reportError(new Error('all off test'));
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
  })
})
