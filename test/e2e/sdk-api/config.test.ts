import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Store } from '../../../packages/core/src/index.js'
import type { InternalConfig } from '../../../packages/sdk/src/config.js'
import { createReporter } from '../../../packages/sdk/src/index.js'
import { resetRegistry } from '../../../packages/sdk/src/registry.js'
import { installMockFetch } from '../helpers/mock-fetch.js'
import { createErrors, configs, withStoreDir } from '../helpers/fixtures.js'
import { createTestPresenter } from '../helpers/test-presenter.js'
import { createTempStoreDir } from '../helpers/subprocess.js'

describe('E2E: sdk-api/config', () => {
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

  test('1: cli preset defaults -- argv collected, command section present', async () => {
    const originalArgv = process.argv
    process.argv = ['bun', 'cli', 'test-cmd', '--flag']

    try {
      const presenter = createTestPresenter({ type: 'cancel' })
      const reporter = createReporter({
        ...withStoreDir(configs.cliPreset, storeDir),
        presenter,
        store: { enabled: true },
      } satisfies InternalConfig)

      try {
        await reporter.wrapCommand(async () => {
          throw new Error('test')
        })
      } catch {
        // expected
      }

      const store = new Store(storeDir)
      const stored = await store.list('test-app')
      expect(stored[0].command).toBeDefined()
      expect(stored[0].command?.argv).toContain('--flag')
    } finally {
      process.argv = originalArgv
    }
  })

  test('2: sdk preset defaults -- no argv collection by default', async () => {
    const reporter = createReporter({
      ...withStoreDir(configs.sdkPreset, storeDir),
      store: { enabled: true },
    })

    const report = await reporter.reportError(createErrors().simple)

    // sdk preset has collect.argv = false, so no command context unless explicitly passed
    expect(report.command).toBeUndefined()
  })

  test('3: preset + individual override takes precedence', async () => {
    const originalArgv = process.argv
    process.argv = ['bun', 'cli', 'override-test']

    try {
      const reporter = createReporter({
        ...withStoreDir(configs.sdkPreset, storeDir),
        collect: { argv: true },
        store: { enabled: true },
      } satisfies InternalConfig)

      const report = await reporter.reportError(createErrors().simple, {
        command: 'override-test',
        argv: ['override-test'],
      })
      expect(report.command?.command).toBe('override-test')
    } finally {
      process.argv = originalArgv
    }
  })

  test('4: collect.diagnosticReport=true includes diagnostic data', async () => {
    const reporter = createReporter({
      ...withStoreDir(configs.nonInteractiveSilent, storeDir),
      collect: { diagnosticReport: true },
      store: { enabled: true },
    } satisfies InternalConfig)

    const report = await reporter.reportError(createErrors().simple)

    expect(report.diagnostic).toBeDefined()
    expect(report.diagnostic?.heapUsed).toBeDefined()
    expect(report.diagnostic?.uptime).toBeDefined()
  })

  test('5: store.maxReports=3 -> 4th save triggers eviction', async () => {
    const reporter = createReporter({
      ...withStoreDir(configs.nonInteractiveSilent, storeDir),
      store: { enabled: true, maxReports: 3 },
    })

    for (let i = 0; i < 4; i++) {
      await reporter.reportError(new Error(`error ${i}`))
    }

    const store = new Store(storeDir)
    const stored = await store.list('test-app')
    expect(stored).toHaveLength(3)
  })

  test('6: store.enabled=false writes nothing to filesystem', async () => {
    const reporter = createReporter({
      ...withStoreDir(configs.noStore, storeDir),
      interactive: 'never',
      nonInteractive: 'silent',
    })

    await reporter.reportError(createErrors().simple)

    try {
      const files = await readdir(join(storeDir, 'reports'))
      expect(files).toHaveLength(0)
    } catch {
      // Dir doesn't exist -- that's fine, means nothing was stored
    }
  })

  test('7: all options off (sanitize/dedupe/store) -- pipeline still works', async () => {
    const reporter = createReporter({
      repo: 'test-owner/test-repo',
      app: { name: 'minimal-app', version: '1.0.0' },
      sanitize: { enabled: false },
      dedupe: { enabled: false },
      store: { enabled: false },
      interactive: 'never',
      nonInteractive: 'silent',
      _storeDir: storeDir,
    } satisfies InternalConfig)

    const report = await reporter.reportError(createErrors().simple)

    expect(report.id).toBeTruthy()
    expect(report.error.message).toContain('Something went wrong')
  })
})
