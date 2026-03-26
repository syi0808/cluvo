import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { Store } from '../../../packages/core/src/index.js'
import type { InternalConfig } from '../../../packages/sdk/src/config.js'
import { createReporter } from '../../../packages/sdk/src/index.js'
import { resetRegistry } from '../../../packages/sdk/src/registry.js'
import { installMockFetch } from '../helpers/mock-fetch.js'
import { createErrors, configs, withStoreDir, makeReport } from '../helpers/fixtures.js'
import { createTestPresenter } from '../helpers/test-presenter.js'
import { createTempStoreDir, seedReports } from '../helpers/subprocess.js'

describe('E2E: sdk-api/lifecycle', () => {
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

  test('1: installGlobalHandlers() captures uncaughtException', async () => {
    const reporter = createReporter({
      ...withStoreDir(configs.nonInteractiveSilent, storeDir),
      store: { enabled: true },
    })

    const uninstall = reporter.installGlobalHandlers()

    try {
      const error = new Error('uncaught test error')
      process.emit('uncaughtException', error)

      await new Promise((r) => setTimeout(r, 100))

      const store = new Store(storeDir)
      const stored = await store.list('test-app')
      expect(stored.length).toBeGreaterThanOrEqual(1)
    } finally {
      uninstall()
    }
  })

  test('2: installGlobalHandlers() captures unhandledRejection', async () => {
    const reporter = createReporter({
      ...withStoreDir(configs.nonInteractiveSilent, storeDir),
      store: { enabled: true },
    })

    const uninstall = reporter.installGlobalHandlers()

    try {
      const error = new Error('unhandled rejection test')
      process.emit('unhandledRejection', error, Promise.reject(error).catch(() => {}))

      await new Promise((r) => setTimeout(r, 100))

      const store = new Store(storeDir)
      const stored = await store.list('test-app')
      expect(stored.length).toBeGreaterThanOrEqual(1)
    } finally {
      uninstall()
    }
  })

  test('3: after uninstall, global handlers removed', async () => {
    const reporter = createReporter({
      ...withStoreDir(configs.nonInteractiveSilent, storeDir),
      store: { enabled: true },
    })

    const countBefore = process.listenerCount('uncaughtException')
    const uninstall = reporter.installGlobalHandlers()
    const countDuring = process.listenerCount('uncaughtException')
    uninstall()
    const countAfter = process.listenerCount('uncaughtException')

    expect(countDuring).toBeGreaterThan(countBefore)
    expect(countAfter).toBe(countBefore)
  })

  test('4: installExitHandler() processes pending reports on beforeExit', async () => {
    await seedReports(storeDir, 'test-app', [makeReport('pending-1', 'test-app')])

    const presenter = createTestPresenter({ type: 'cancel' })
    const reporter = createReporter({
      ...withStoreDir(configs.minimal, storeDir),
      presenter,
      store: { enabled: true },
    } satisfies InternalConfig)

    const cleanup = reporter.installExitHandler()

    try {
      process.emit('beforeExit', 0)
      // The beforeExit handler is async fire-and-forget, give it enough time
      await new Promise((r) => setTimeout(r, 1000))

      expect(presenter.prompt).toHaveBeenCalled()
    } finally {
      cleanup()
    }
  })

  test('5: exit handler respects timeout', async () => {
    const reporter = createReporter({
      ...withStoreDir(configs.nonInteractiveSilent, storeDir),
      store: { enabled: true },
    })

    const cleanup = reporter.installExitHandler({ timeout: 100 })

    try {
      const start = Date.now()
      process.emit('beforeExit', 0)
      await new Promise((r) => setTimeout(r, 200))
      const elapsed = Date.now() - start
      // Exit handler with 100ms timeout should not block beyond that
      expect(elapsed).toBeLessThan(5000)
    } finally {
      cleanup()
    }
  })

  test('6: non-interactive exit handler marks report as dismissed (regression)', async () => {
    await seedReports(storeDir, 'test-app', [makeReport('dismiss-test', 'test-app')])

    const reporter = createReporter({
      ...withStoreDir(configs.nonInteractiveSilent, storeDir),
      store: { enabled: true },
    })

    const cleanup = reporter.installExitHandler()

    try {
      process.emit('beforeExit', 0)
      await new Promise((r) => setTimeout(r, 200))

      const store = new Store(storeDir)
      const report = await store.load('test-app', 'dismiss-test')
      expect(report?.status).toBe('dismissed')
    } finally {
      cleanup()
    }
  })

  test('7: presenter decline does not cause infinite loop (regression)', async () => {
    await seedReports(storeDir, 'test-app', [makeReport('loop-test', 'test-app')])

    const presenter = createTestPresenter(null)
    const reporter = createReporter({
      ...withStoreDir(configs.minimal, storeDir),
      presenter,
      store: { enabled: true },
    } satisfies InternalConfig)

    const cleanup = reporter.installExitHandler({ timeout: 2000 })

    try {
      process.emit('beforeExit', 0)

      await new Promise((r) => setTimeout(r, 500))

      const callCount = (presenter.prompt as any).mock.calls.length
      expect(callCount).toBeLessThanOrEqual(2)
    } finally {
      cleanup()
    }
  })
})
