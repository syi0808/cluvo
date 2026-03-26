import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { runScript, createTempStoreDir, readReports, SDK_IMPORT } from '../helpers/subprocess.js'
import { mockFetchScript } from '../helpers/mock-fetch.js'
import { environments } from '../helpers/environments.js'

describe('E2E: subprocess-sdk/dedup', () => {
  let storeDir: string

  beforeEach(async () => {
    storeDir = await createTempStoreDir()
  })

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true })
  })

  const baseScript = (configOverrides: string = '') => `
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
await reporter.reportAndPrompt(new Error('dedup test error'));
`

  test('1: mock fetch returns similar issues -> process completes without crash', async () => {
    // In subprocess mode we can't inspect presenter args for matches.
    // We verify the search integration works by providing search results
    // and confirming the process completes and report is created.
    const mockIssue = {
      type: 'issue' as const,
      number: 99,
      title: 'Error: dedup test error',
      url: 'https://github.com/test/repo/issues/99',
      state: 'open' as const,
      labels: ['cluvo-report'],
    }
    const result = await runScript(baseScript(`dedupe: { enabled: true },`), {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript({ searchResults: [mockIssue] }),
    })
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
  })

  test('2: search API failure -> no crash, report created', async () => {
    const result = await runScript(baseScript(`dedupe: { enabled: true },`), {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript({ searchError: 500 }),
    })
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
  })

  test('3: dedupe disabled -> report created without search', async () => {
    const result = await runScript(baseScript(`dedupe: { enabled: false },`), {
      env: environments.pipe,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
  })
})
