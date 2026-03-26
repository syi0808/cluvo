import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { runScript, createTempStoreDir, readReports, SDK_IMPORT } from '../helpers/subprocess.js'
import { mockFetchScript } from '../helpers/mock-fetch.js'
import { environments } from '../helpers/environments.js'

describe('E2E: subprocess-sdk/top-level enforcement', () => {
  let storeDir: string

  beforeEach(async () => {
    storeDir = await createTempStoreDir()
  })

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true })
  })

  test('new Reporter at module top-level works normally', async () => {
    const script = `
import { Reporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = new Reporter({
  repo: 'test-owner/test-repo',
  app: { name: 'top-level-app', version: '1.0.0' },
  interactive: 'never',
  nonInteractive: 'silent',
  store: { enabled: true },
  _storeDir: storeDir,
});
await reporter.reportError(new Error('top-level error'));
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'top-level-app')
    expect(reports).toHaveLength(1)
    expect(reports[0].error.message).toBe('top-level error')
  })

  test('new Reporter inside named function returns no-op (no reports stored)', async () => {
    const script = `
import { Reporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;

function createInsideFunction() {
  return new Reporter({
    repo: 'test-owner/test-repo',
    app: { name: 'inside-fn-app', version: '1.0.0' },
    interactive: 'never',
    nonInteractive: 'silent',
    store: { enabled: true },
    _storeDir: storeDir,
  });
}

const reporter = createInsideFunction();
await reporter.reportError(new Error('should not be stored'));
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'inside-fn-app')
    expect(reports).toHaveLength(0)
  })

  test('no-op reporter wrap/wrapCommand still executes the function', async () => {
    const script = `
import { Reporter } from '${SDK_IMPORT}';

function createInsideFunction() {
  return new Reporter({
    repo: 'test-owner/test-repo',
    app: { name: 'noop-wrap', version: '1.0.0' },
    store: { enabled: false },
  });
}

const reporter = createInsideFunction();
let executed = false;
await reporter.wrap(async () => { executed = true; });
if (!executed) process.exit(1);

let cmdExecuted = false;
await reporter.wrapCommand(async () => { cmdExecuted = true; });
if (!cmdExecuted) process.exit(1);
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
  })

  test('no-op reporter is not registered in the registry', async () => {
    const script = `
import { Reporter, getRegistry } from '${SDK_IMPORT}';

function createInsideFunction() {
  return new Reporter({
    repo: 'test-owner/test-repo',
    app: { name: 'noop-registry', version: '1.0.0' },
    store: { enabled: false },
  });
}

createInsideFunction();
const count = getRegistry().stack.length;
if (count !== 0) {
  process.stderr.write('Expected 0 registry entries, got ' + count);
  process.exit(1);
}
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
  })
})
