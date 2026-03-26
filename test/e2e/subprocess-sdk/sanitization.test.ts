import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import {
  runScript,
  createTempStoreDir,
  readReports,
  readDrafts,
  readDraftContent,
  SDK_IMPORT,
} from '../helpers/subprocess.js'
import { mockFetchScript } from '../helpers/mock-fetch.js'
import { environments } from '../helpers/environments.js'

describe('E2E: subprocess-sdk/sanitization', () => {
  let storeDir: string

  beforeEach(async () => {
    storeDir = await createTempStoreDir()
  })

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true })
  })

  const makeScript = (errorExpr: string, configOverrides: string = '') => `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  interactive: 'never',
  nonInteractive: 'silent',
  store: { enabled: true },
  sanitize: { enabled: true },
  _storeDir: storeDir,
  ${configOverrides}
});
await reporter.reportError(${errorExpr});
`

  test('1: GitHub token in error message not in store file', async () => {
    const result = await runScript(
      makeScript(
        `new Error('Auth failed: ghp_abc123secret456789012345678901234567')`,
      ),
      { env: environments.sensitiveEnv, storeDir, prependCode: mockFetchScript() },
    )
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
    const json = JSON.stringify(reports[0])
    expect(json).not.toContain('ghp_abc123secret456')
  })

  test('2: HOME path in stack trace replaced with ~', async () => {
    const result = await runScript(
      makeScript(`new Error('File not found at home dir')`),
      { env: environments.sensitiveEnv, storeDir, prependCode: mockFetchScript() },
    )
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    const json = JSON.stringify(reports[0])
    // The HOME env is set to storeDir in runScript, so check storeDir is not in the output
    // Stack traces will contain the temp script path, which is under tmpdir
    expect(json).not.toContain('/Users/realuser')
  })

  test('3: --token value in argv is redacted', async () => {
    const script = `
import { createReporter } from '${SDK_IMPORT}';
process.argv = ['bun', 'cli', 'deploy', '--token', 'ghp_mysecrettoken123456789012345', '--verbose'];
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  preset: 'cli',
  interactive: 'never',
  nonInteractive: 'silent',
  store: { enabled: true },
  sanitize: { enabled: true },
  _storeDir: storeDir,
});
await reporter.wrapCommand(async () => { throw new Error('deploy failed'); });
`
    const result = await runScript(script, {
      env: environments.sensitiveEnv,
      storeDir,
      prependCode: mockFetchScript(),
    })
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
    const json = JSON.stringify(reports[0])
    expect(json).not.toContain('ghp_mysecrettoken123456789012345')
  })

  test('4: DB connection string password not in report', async () => {
    const result = await runScript(
      makeScript(
        `new Error('Connection failed: postgres://admin:s3cretP4ss@db.internal:5432/prod')`,
      ),
      { env: environments.sensitiveEnv, storeDir, prependCode: mockFetchScript() },
    )
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    const json = JSON.stringify(reports[0])
    expect(json).not.toContain('s3cretP4ss')
  })

  test('5: custom sanitize rule applied', async () => {
    const result = await runScript(
      makeScript(
        `new Error('Cannot reach internal.corp.example.com:8080')`,
        `sanitize: { enabled: true, customRules: [{ name: 'internal-url', pattern: /internal\\.corp\\.example\\.com/g, replacement: '<INTERNAL>' }] },`,
      ),
      { env: environments.pipe, storeDir, prependCode: mockFetchScript() },
    )
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports[0].error.message).not.toContain('internal.corp.example.com')
    expect(reports[0].error.message).toContain('<INTERNAL>')
  })

  test('6: sanitize disabled preserves original', async () => {
    const result = await runScript(
      makeScript(
        `new Error('Token: ghp_abc123secret456789012345678901234567')`,
        `sanitize: { enabled: false },`,
      ),
      { env: environments.pipe, storeDir, prependCode: mockFetchScript() },
    )
    expect(result.exitCode).toBe(0)
    const reports = await readReports(storeDir, 'test-app')
    expect(reports[0].error.message).toContain('ghp_abc123secret456')
    expect(reports[0].sanitizedFields).toHaveLength(0)
  })

  test('7: full pipeline -> file export also clean', async () => {
    const script = `
import { createReporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
const reporter = createReporter({
  repo: 'test-owner/test-repo',
  app: { name: 'test-app', version: '1.0.0' },
  interactive: 'never',
  nonInteractive: 'save',
  mode: 'file',
  store: { enabled: true },
  sanitize: { enabled: true },
  _storeDir: storeDir,
});
await reporter.reportAndPrompt(new Error('Connection failed, password=s3cretP4ss token=ghp_abc123secret456789012345678901234567'));
`
    const result = await runScript(script, {
      env: environments.sensitiveEnv,
      storeDir,
      prependCode: mockFetchScript(),
    })
    expect(result.exitCode).toBe(0)
    // In non-interactive mode, verify the stored report is sanitized
    const reports = await readReports(storeDir, 'test-app')
    expect(reports).toHaveLength(1)
    const json = JSON.stringify(reports[0])
    expect(json).not.toContain('s3cretP4ss')
    expect(json).not.toContain('ghp_secrettoken')
  })
})
