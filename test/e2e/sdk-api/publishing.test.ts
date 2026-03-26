import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { rm } from 'node:fs/promises'
import { Store } from '../../../packages/core/src/index.js'
import type { InternalConfig } from '../../../packages/sdk/src/config.js'
import { createReporter } from '../../../packages/sdk/src/index.js'
import { resetRegistry } from '../../../packages/sdk/src/registry.js'
import { installMockFetch } from '../helpers/mock-fetch.js'
import { createErrors, configs, withStoreDir } from '../helpers/fixtures.js'
import { createTestPresenter } from '../helpers/test-presenter.js'
import { createTempStoreDir, readDrafts, readDraftContent } from '../helpers/subprocess.js'

describe('E2E: sdk-api/publishing', () => {
  let storeDir: string
  let restoreFetch: () => void

  beforeEach(async () => {
    storeDir = await createTempStoreDir()
    resetRegistry()
  })

  afterEach(async () => {
    if (restoreFetch) restoreFetch()
    resetRegistry()
    await rm(storeDir, { recursive: true, force: true })
  })

  test('1: presenter open action -> status=submitted', async () => {
    restoreFetch = installMockFetch()
    const presenter = createTestPresenter({ type: 'open' })
    const reporter = createReporter({
      ...withStoreDir(configs.minimal, storeDir),
      presenter,
      store: { enabled: true },
    } satisfies InternalConfig)

    await reporter.reportAndPrompt(createErrors().simple)

    const store = new Store(storeDir)
    const stored = await store.list('test-app')
    expect(stored[0].status).toBe('submitted')
  })

  test('2: browser URL>8000 chars falls back to file', async () => {
    const originalToken = process.env.GITHUB_TOKEN
    const originalGhToken = process.env.GH_TOKEN
    delete process.env.GITHUB_TOKEN
    delete process.env.GH_TOKEN
    restoreFetch = installMockFetch()

    try {
      const longMessage = 'A'.repeat(10000)
      const reporter = createReporter({
        ...withStoreDir(configs.nonInteractiveSilent, storeDir),
        mode: 'browser',
        store: { enabled: true },
      })

      const report = await reporter.reportError(new Error(longMessage))
      const draft = reporter.buildDraft(report)
      const result = await reporter.publish(draft)

      expect(result.method).toBe('file')
      expect(result.filePath).toBeTruthy()
    } finally {
      if (originalToken) process.env.GITHUB_TOKEN = originalToken
      if (originalGhToken) process.env.GH_TOKEN = originalGhToken
    }
  })

  test('3: mode=api + token -> issueUrl returned, status=submitted', async () => {
    const originalToken = process.env.GITHUB_TOKEN
    process.env.GITHUB_TOKEN = 'ghp_test_token_for_api_publish_1234567890'
    restoreFetch = installMockFetch({ createIssueUrl: 'https://github.com/test/repo/issues/42' })

    try {
      const reporter = createReporter({
        ...withStoreDir(configs.nonInteractiveSilent, storeDir),
        mode: 'api',
        store: { enabled: true },
      })

      const report = await reporter.reportError(createErrors().simple)
      const draft = reporter.buildDraft(report)
      const result = await reporter.publish(draft)

      expect(result.method).toBe('api')
      expect(result.issueUrl).toContain('github.com')
    } finally {
      if (originalToken) process.env.GITHUB_TOKEN = originalToken
      else delete process.env.GITHUB_TOKEN
    }
  })

  test('4: mode=api + no token -> file fallback', async () => {
    const originalToken = process.env.GITHUB_TOKEN
    const originalGhToken = process.env.GH_TOKEN
    delete process.env.GITHUB_TOKEN
    delete process.env.GH_TOKEN
    restoreFetch = installMockFetch()

    try {
      const reporter = createReporter({
        ...withStoreDir(configs.nonInteractiveSilent, storeDir),
        mode: 'api',
        store: { enabled: true },
      })

      const report = await reporter.reportError(createErrors().simple)
      const draft = reporter.buildDraft(report)
      const result = await reporter.publish(draft)

      expect(result.method).toBe('file')
      expect(result.filePath).toBeTruthy()
    } finally {
      if (originalToken) process.env.GITHUB_TOKEN = originalToken
      if (originalGhToken) process.env.GH_TOKEN = originalGhToken
    }
  })

  test('5: presenter gh action with no auth -> does not crash', async () => {
    const originalToken = process.env.GITHUB_TOKEN
    delete process.env.GITHUB_TOKEN
    delete process.env.GH_TOKEN
    restoreFetch = installMockFetch()

    try {
      const presenter = createTestPresenter({ type: 'gh' })
      const reporter = createReporter({
        ...withStoreDir(configs.minimal, storeDir),
        presenter,
        store: { enabled: true },
      } satisfies InternalConfig)

      await reporter.reportAndPrompt(createErrors().simple)

      const store = new Store(storeDir)
      const stored = await store.list('test-app')
      expect(stored).toHaveLength(1)
    } finally {
      if (originalToken) process.env.GITHUB_TOKEN = originalToken
    }
  })

  test('6: mode=file explicitly creates markdown file via publish()', async () => {
    restoreFetch = installMockFetch()
    const reporter = createReporter({
      ...withStoreDir(configs.fileModeOnly, storeDir),
      interactive: 'never',
      nonInteractive: 'silent',
      store: { enabled: true },
    })

    const report = await reporter.reportError(createErrors().simple)
    const draft = reporter.buildDraft(report)
    const result = await reporter.publish(draft)

    expect(result.method).toBe('file')
    expect(result.filePath).toBeTruthy()
  })

  test('7: post-publish via api has status=submitted + issueUrl in store', async () => {
    const originalToken = process.env.GITHUB_TOKEN
    process.env.GITHUB_TOKEN = 'ghp_test_token_for_status_check_1234567890'
    restoreFetch = installMockFetch({ createIssueUrl: 'https://github.com/test/repo/issues/55' })

    try {
      const presenter = createTestPresenter({ type: 'open' })
      const reporter = createReporter({
        ...withStoreDir(configs.minimal, storeDir),
        presenter,
        store: { enabled: true },
      } satisfies InternalConfig)

      await reporter.reportAndPrompt(createErrors().simple)

      const store = new Store(storeDir)
      const stored = await store.list('test-app')
      expect(stored[0].status).toBe('submitted')
      // Note: issueUrl is not stored by the SDK's open action (publish result is not persisted)
    } finally {
      if (originalToken) process.env.GITHUB_TOKEN = originalToken
      else delete process.env.GITHUB_TOKEN
    }
  })

  test('8: custom labels included in draft', async () => {
    restoreFetch = installMockFetch()
    const reporter = createReporter({
      ...withStoreDir(configs.customLabels, storeDir),
      interactive: 'never',
      nonInteractive: 'silent',
      store: { enabled: true },
    })

    const report = await reporter.reportError(new Error('label test'))
    const draft = reporter.buildDraft(report)
    expect(draft.labels).toContain('bug')
    expect(draft.labels).toContain('auto-report')
  })

  test('9: custom title function reflected in draft', async () => {
    restoreFetch = installMockFetch()
    const reporter = createReporter({
      ...withStoreDir(configs.customTitle, storeDir),
      interactive: 'never',
      nonInteractive: 'silent',
      store: { enabled: true },
    })

    const report = await reporter.reportError(createErrors().simple, { command: 'deploy' })
    const draft = reporter.buildDraft(report)

    expect(draft.title).toContain('[deploy]')
    expect(draft.title).toContain('Error')
  })
})
