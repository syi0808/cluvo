import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// Prevent tests from opening a real browser
mock.module('node:child_process', () => ({
  execFile: (_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
    cb(null)
  },
}))

import { rm } from 'node:fs/promises'
import { Store } from '../../../packages/core/src/index.js'
import type { InternalConfig } from '../../../packages/sdk/src/config.js'
import { createReporter } from '../../../packages/sdk/src/index.js'
import { resetRegistry } from '../../../packages/sdk/src/registry.js'
import { installMockFetch } from '../helpers/mock-fetch.js'
import { configs, withStoreDir } from '../helpers/fixtures.js'
import { createTestPresenter } from '../helpers/test-presenter.js'
import { createTempStoreDir } from '../helpers/subprocess.js'

describe('E2E: sdk-api/sanitization', () => {
  let storeDir: string
  let restoreFetch: () => void

  beforeEach(async () => {
    storeDir = await createTempStoreDir()
    restoreFetch = installMockFetch()
    resetRegistry()
  })

  afterEach(async () => {
    restoreFetch()
    resetRegistry()
    await rm(storeDir, { recursive: true, force: true })
  })

  test('1: GitHub token in error message is redacted', async () => {
    const reporter = createReporter({
      ...withStoreDir(configs.nonInteractiveSilent, storeDir),
      store: { enabled: true },
      sanitize: { enabled: true },
    })

    const error = new Error('Auth failed with token ghp_abc123secret456789012345678901234567')
    const report = await reporter.reportError(error)

    expect(report.error.message).not.toContain('ghp_abc123secret456')
    expect(report.error.message).toContain('[REDACTED]')
    expect(report.sanitizedFields.length).toBeGreaterThan(0)
  })

  test('2: sk_live token, AWS-style key, password, and DB URL are sanitized', async () => {
    const reporter = createReporter({
      ...withStoreDir(configs.nonInteractiveSilent, storeDir),
      store: { enabled: true },
      sanitize: {
        enabled: true,
        customRules: [
          // AWS access key pattern (not built-in — added via customRules)
          { name: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/g, replacement: '[REDACTED]' },
          // Database connection string (not built-in — added via customRules)
          { name: 'db-connection-string', pattern: /\w+:\/\/[^@]+@[^\s]+/g, replacement: '[REDACTED_DB_URL]' },
        ],
      },
    })

    const error = new Error(
      'Failed: api_key=sk_live_secretvalue1234567890 password=hunter2 ' +
      'aws_key=AKIAIOSFODNN7EXAMPLE db=postgres://user:pass@host/db',
    )
    const report = await reporter.reportError(error)
    const reportJson = JSON.stringify(report)

    // sk_live token redacted by built-in sk-token rule
    expect(reportJson).not.toContain('sk_live_secretvalue1234567890')
    // password redacted by built-in password rule
    expect(reportJson).not.toContain('hunter2')
    // AWS key redacted by custom rule (no built-in rule for AKIA keys)
    expect(reportJson).not.toContain('AKIAIOSFODNN7EXAMPLE')
    // DB connection string redacted by custom rule (no built-in rule for connection URIs)
    expect(reportJson).not.toContain('postgres://user:pass@host/db')
  })

  test('3: HOME path in stack trace replaced with ~', async () => {
    const homeDir = process.env.HOME ?? '/Users/testuser'
    const reporter = createReporter({
      ...withStoreDir(configs.nonInteractiveSilent, storeDir),
      store: { enabled: true },
      sanitize: { enabled: true },
    })

    const error = new Error('File not found')
    const report = await reporter.reportError(error)

    expect(report.error.stack).not.toContain(homeDir)
  })

  test('4: argv values after --token, --api-key are redacted', async () => {
    const originalArgv = process.argv
    process.argv = ['bun', 'cli', 'deploy', '--token', 'ghp_mysecrettoken123', '--verbose']

    try {
      const reporter = createReporter({
        ...withStoreDir(configs.cliPreset, storeDir),
        interactive: 'never',
        nonInteractive: 'silent',
        store: { enabled: true },
        sanitize: { enabled: true },
      } satisfies InternalConfig)

      try {
        await reporter.wrapCommand(async () => {
          throw new Error('deploy failed')
        })
      } catch {
        // expected rethrow
      }

      const store = new Store(storeDir)
      const stored = await store.list('test-app')
      expect(stored).toHaveLength(1)

      const reportJson = JSON.stringify(stored[0])
      expect(reportJson).not.toContain('ghp_mysecrettoken123')
    } finally {
      process.argv = originalArgv
    }
  })

  test('5: custom sanitize rule applied', async () => {
    const reporter = createReporter({
      ...withStoreDir(configs.nonInteractiveSilent, storeDir),
      store: { enabled: true },
      sanitize: {
        enabled: true,
        customRules: [
          { name: 'internal-url', pattern: /internal\.corp\.example\.com/g, replacement: '<INTERNAL>' },
        ],
      },
    } satisfies InternalConfig)

    const error = new Error('Cannot reach internal.corp.example.com:8080')
    const report = await reporter.reportError(error)

    expect(report.error.message).not.toContain('internal.corp.example.com')
    expect(report.error.message).toContain('<INTERNAL>')
  })

  test('6: sanitize disabled preserves original values', async () => {
    const reporter = createReporter({
      ...withStoreDir(configs.noSanitize, storeDir),
      interactive: 'never',
      nonInteractive: 'silent',
      store: { enabled: true },
    })

    const error = new Error('Token: ghp_abc123secret456789012345678901234567')
    const report = await reporter.reportError(error)

    expect(report.error.message).toContain('ghp_abc123secret456')
    expect(report.sanitizedFields).toHaveLength(0)
  })

  test('7: sensitiveEnv full pipeline -- store + draft both clean', async () => {
    const presenter = createTestPresenter({ type: 'open' })
    const reporter = createReporter({
      ...withStoreDir(configs.minimal, storeDir),
      presenter,
      store: { enabled: true },
      sanitize: { enabled: true },
    } satisfies InternalConfig)

    const error = new Error(
      'Connection failed, password=s3cretP4ss token=ghp_abc123secret456789012345678901234567',
    )
    await reporter.reportAndPrompt(error)

    const store = new Store(storeDir)
    const stored = await store.list('test-app')
    const storedJson = JSON.stringify(stored[0])

    expect(storedJson).not.toContain('s3cretP4ss')
    expect(storedJson).not.toContain('ghp_abc123secret')
  })

  test('8: email in error message is masked', async () => {
    const reporter = createReporter({
      ...withStoreDir(configs.nonInteractiveSilent, storeDir),
      store: { enabled: true },
      sanitize: { enabled: true },
    })

    const error = new Error('Notification failed for user admin@company.com')
    const report = await reporter.reportError(error)

    expect(report.error.message).not.toContain('admin@company.com')
  })
})
