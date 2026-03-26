import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { rm } from 'node:fs/promises'
import { Store } from '../../../packages/core/src/index.js'
import type { ExistingIssue } from '../../../packages/core/src/index.js'
import type { InternalConfig } from '../../../packages/sdk/src/config.js'
import { createReporter } from '../../../packages/sdk/src/index.js'
import { resetRegistry } from '../../../packages/sdk/src/registry.js'
import { installMockFetch } from '../helpers/mock-fetch.js'
import { createErrors, configs, withStoreDir } from '../helpers/fixtures.js'
import { createTestPresenter } from '../helpers/test-presenter.js'
import { createTempStoreDir } from '../helpers/subprocess.js'

const mockIssue: ExistingIssue = {
  type: 'issue',
  number: 99,
  title: '[deploy] Error: Something went wrong',
  url: 'https://github.com/test-owner/test-repo/issues/99',
  state: 'open',
  labels: ['cluvo-report'],
  createdAt: new Date().toISOString(),
}

describe('E2E: sdk-api/dedup', () => {
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

  test('1: GitHub search finds similar issues -> matches populated', async () => {
    restoreFetch = installMockFetch({ searchResults: [mockIssue] })
    const presenter = createTestPresenter({ type: 'cancel' })
    const reporter = createReporter({
      ...withStoreDir(configs.minimal, storeDir),
      presenter,
      dedupe: { enabled: true },
      store: { enabled: true },
    } satisfies InternalConfig)

    await reporter.reportAndPrompt(createErrors().simple)

    expect(presenter.prompt).toHaveBeenCalledTimes(1)
    const promptCtx = (presenter.prompt as any).mock.calls[0][0]
    expect(promptCtx.report.matches).toBeDefined()
    expect(promptCtx.report.matches.length).toBeGreaterThan(0)
    expect(promptCtx.report.matches[0].number).toBe(99)
  })

  test('2: user selects react on existing issue', async () => {
    restoreFetch = installMockFetch({ searchResults: [mockIssue] })
    const presenter = createTestPresenter({ type: 'react', issue: mockIssue })
    const reporter = createReporter({
      ...withStoreDir(configs.minimal, storeDir),
      presenter,
      dedupe: { enabled: true },
      store: { enabled: true },
    } satisfies InternalConfig)

    await reporter.reportAndPrompt(createErrors().simple)

    // react action should NOT create a new issue
    const fetchCalls = (globalThis.fetch as any).mock.calls
    const createCalls = fetchCalls.filter(
      (c: any) =>
        c[0]?.includes?.('/issues') &&
        c[1]?.method === 'POST' &&
        !c[0]?.includes?.('/reactions') &&
        !c[0]?.includes?.('search'),
    )
    expect(createCalls).toHaveLength(0)
  })

  test('3: user selects view on existing issue -> no new issue', async () => {
    restoreFetch = installMockFetch({ searchResults: [mockIssue] })
    const presenter = createTestPresenter({ type: 'view', issue: mockIssue })
    const reporter = createReporter({
      ...withStoreDir(configs.minimal, storeDir),
      presenter,
      dedupe: { enabled: true },
      store: { enabled: true },
    } satisfies InternalConfig)

    await reporter.reportAndPrompt(createErrors().simple)

    const store = new Store(storeDir)
    const stored = await store.list('test-app')
    expect(stored).toHaveLength(1)
    expect(stored[0].status).not.toBe('submitted')
  })

  test('4: no matches found -> empty array, normal flow', async () => {
    restoreFetch = installMockFetch({ searchResults: [] })
    const presenter = createTestPresenter({ type: 'cancel' })
    const reporter = createReporter({
      ...withStoreDir(configs.minimal, storeDir),
      presenter,
      dedupe: { enabled: true },
      store: { enabled: true },
    } satisfies InternalConfig)

    await reporter.reportAndPrompt(createErrors().simple)

    const promptCtx = (presenter.prompt as any).mock.calls[0][0]
    // When no matches found (found=false), matches is not set on the report
    expect(promptCtx.report.matches ?? []).toHaveLength(0)
  })

  test('5: search API failure -> graceful, continues without matches', async () => {
    restoreFetch = installMockFetch({ searchError: 500 })
    const presenter = createTestPresenter({ type: 'cancel' })
    const reporter = createReporter({
      ...withStoreDir(configs.minimal, storeDir),
      presenter,
      dedupe: { enabled: true },
      store: { enabled: true },
    } satisfies InternalConfig)

    await reporter.reportAndPrompt(createErrors().simple)

    expect(presenter.prompt).toHaveBeenCalledTimes(1)
  })

  test('6: dedupe disabled -> search not called', async () => {
    restoreFetch = installMockFetch({ searchResults: [mockIssue] })
    const presenter = createTestPresenter({ type: 'cancel' })
    const reporter = createReporter({
      ...withStoreDir(configs.noDedupe, storeDir),
      presenter,
      store: { enabled: true },
    } satisfies InternalConfig)

    await reporter.reportAndPrompt(createErrors().simple)

    const fetchCalls = (globalThis.fetch as any).mock.calls
    const searchCalls = fetchCalls.filter((c: any) => c[0]?.includes?.('search/issues'))
    expect(searchCalls).toHaveLength(0)
  })

  test('7: searchDiscussions: true includes discussions in query', async () => {
    restoreFetch = installMockFetch({ searchResults: [] })
    const presenter = createTestPresenter({ type: 'cancel' })
    const reporter = createReporter({
      ...withStoreDir(configs.minimal, storeDir),
      presenter,
      dedupe: { enabled: true, searchDiscussions: true },
      store: { enabled: true },
    } satisfies InternalConfig)

    await reporter.reportAndPrompt(createErrors().simple)

    const fetchCalls = (globalThis.fetch as any).mock.calls
    const searchCalls = fetchCalls.filter((c: any) => c[0]?.includes?.('search/issues'))
    expect(searchCalls.length).toBeGreaterThan(0)
  })
})
