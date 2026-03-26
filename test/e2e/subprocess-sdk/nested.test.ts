import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { runScript, createTempStoreDir, readReports, SDK_IMPORT } from '../helpers/subprocess.js'
import { mockFetchScript } from '../helpers/mock-fetch.js'
import { environments } from '../helpers/environments.js'

describe('E2E: subprocess-sdk/nested', () => {
  let storeDir: string

  beforeEach(async () => {
    storeDir = await createTempStoreDir()
  })

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true })
  })

  // Post-order: child (deeper depth) registers before parent (shallower depth)
  const nestedScript = (childPolicy: string) => `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;

const child = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'child-sdk', version: '0.1.0' },
  preset: 'sdk',
  store: { enabled: true },
  _storeDir: storeDir,
  _depth: 7,
});

const parent = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'parent-cli', version: '1.0.0' },
  childPolicy: '${childPolicy}',
  interactive: 'never',
  nonInteractive: 'silent',
  store: { enabled: true },
  _storeDir: storeDir,
  _depth: 5,
});

await child.reportAndPrompt(new Error('child error'));
`

  test('1: absorb -- child report saved, parent presenter would be called', async () => {
    const result = await runScript(nestedScript('absorb'), {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    const childReports = await readReports(storeDir, 'child-sdk')
    expect(childReports).toHaveLength(1)
  })

  test('2: passthrough -- child store has report', async () => {
    const result = await runScript(nestedScript('passthrough'), {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    const childReports = await readReports(storeDir, 'child-sdk')
    expect(childReports).toHaveLength(1)
  })

  test('3: silent -- no output, child store only', async () => {
    const result = await runScript(nestedScript('silent'), {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    const childReports = await readReports(storeDir, 'child-sdk')
    expect(childReports).toHaveLength(1)
  })

  test('4: parent + child each error -- both stores have reports', async () => {
    const script = `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const child = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'child-sdk', version: '0.1.0' },
  preset: 'sdk',
  store: { enabled: true }, _storeDir: storeDir,
  _depth: 7,
});
const parent = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'parent-cli', version: '1.0.0' },
  childPolicy: 'absorb',
  interactive: 'never', nonInteractive: 'silent',
  store: { enabled: true }, _storeDir: storeDir,
  _depth: 5,
});
await parent.reportError(new Error('parent error'));
await child.reportError(new Error('child error'));
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    const parentReports = await readReports(storeDir, 'parent-cli')
    const childReports = await readReports(storeDir, 'child-sdk')
    expect(parentReports).toHaveLength(1)
    expect(childReports).toHaveLength(1)
  })

  test('5: child alone (no parent) -- no crash', async () => {
    const script = `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const child = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'standalone-sdk', version: '0.1.0' },
  preset: 'sdk',
  store: { enabled: true }, _storeDir: storeDir,
  _depth: 7,
});
await child.reportAndPrompt(new Error('standalone error'));
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'standalone-sdk')
    expect(reports).toHaveLength(1)
  })

  test('6: 3-level nesting absorb chain -- child report saved', async () => {
    const script = `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const child = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'child', version: '1.0.0' },
  preset: 'sdk',
  store: { enabled: true }, _storeDir: storeDir,
  _depth: 9,
});
const parent = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'parent', version: '1.0.0' },
  childPolicy: 'absorb',
  store: { enabled: true }, _storeDir: storeDir,
  _depth: 7,
});
const grandparent = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'grandparent', version: '1.0.0' },
  childPolicy: 'absorb',
  interactive: 'never', nonInteractive: 'silent',
  store: { enabled: true }, _storeDir: storeDir,
  _depth: 5,
});
await child.reportAndPrompt(new Error('deep nested error'));
`
    const result = await runScript(script, {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    const childReports = await readReports(storeDir, 'child')
    expect(childReports).toHaveLength(1)
  })
})
