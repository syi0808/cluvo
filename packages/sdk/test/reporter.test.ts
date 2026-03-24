import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { createReporter } from '../src/reporter.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('createReporter', () => {
  let storeDir: string

  beforeEach(async () => {
    storeDir = await mkdtemp(join(tmpdir(), 'cluvo-sdk-'))
  })
  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true })
  })

  test('creates reporter with config', () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'test-cli', version: '1.0.0' },
    })
    expect(reporter).toBeDefined()
    expect(reporter.reportError).toBeInstanceOf(Function)
    expect(reporter.promptAndSubmit).toBeInstanceOf(Function)
    expect(reporter.wrapCommand).toBeInstanceOf(Function)
    expect(reporter.buildReport).toBeInstanceOf(Function)
    expect(reporter.sanitizeReport).toBeInstanceOf(Function)
    expect(reporter.findMatches).toBeInstanceOf(Function)
    expect(reporter.buildDraft).toBeInstanceOf(Function)
    expect(reporter.publish).toBeInstanceOf(Function)
  })

  test('reportError returns ErrorReport and never throws', async () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'test-cli', version: '1.0.0' },
      store: { enabled: true },
      _storeDir: storeDir,
    } as any)

    const report = await reporter.reportError(new Error('test failure'), {
      command: 'build',
    })

    expect(report.id).toBeTruthy()
    expect(report.error.name).toBe('Error')
    expect(report.error.message).toBe('test failure')
    expect(report.status).toBe('pending')
    expect(report.app.name).toBe('test-cli')
  })

  test('reportError never throws even with bad input', async () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'test-cli', version: '1.0.0' },
      store: { enabled: false },
    })

    const report = await reporter.reportError(null)
    expect(report.error.message).toBe('null')
  })

  test('buildReport returns unsanitized report', () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'test-cli', version: '1.0.0' },
    })

    const report = reporter.buildReport(new Error('raw error'), { command: 'deploy' })
    expect(report.error.message).toBe('raw error')
    expect(report.sanitizedFields).toHaveLength(0)
  })

  test('sanitizeReport returns new report with sanitized data', () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'test-cli', version: '1.0.0' },
    })

    const report = reporter.buildReport(
      new Error('token=ghp_abc123xyz789def456ghi012jkl345mno678'),
    )
    const sanitized = reporter.sanitizeReport(report)
    expect(sanitized).not.toBe(report)
    expect(sanitized.error.message).not.toContain('ghp_abc123')
  })

  test('buildDraft returns DraftPayload', () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'test-cli', version: '1.0.0' },
    })

    const report = reporter.buildReport(new Error('test'))
    const draft = reporter.buildDraft(report)
    expect(draft.title).toContain('Error')
    expect(draft.body).toContain('test')
  })

  test('buildReport uses context when provided', () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'test-cli', version: '1.0.0' },
    })

    const report = reporter.buildReport(new Error('fail'), {
      command: 'deploy',
      subcommand: 'prod',
      argv: ['deploy', 'prod'],
    })
    expect(report.command?.command).toBe('deploy')
    expect(report.command?.subcommand).toBe('prod')
    expect(report.command?.argv).toEqual(['deploy', 'prod'])
  })

  test('sanitizeReport returns original when sanitize disabled', () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'test-cli', version: '1.0.0' },
      sanitize: { enabled: false },
    })

    const report = reporter.buildReport(new Error('api_key=secret123'))
    const result = reporter.sanitizeReport(report)
    expect(result.error.message).toContain('api_key=secret123')
  })

  test('reportError stores report when store enabled', async () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'store-test', version: '1.0.0' },
      store: { enabled: true },
      _storeDir: storeDir,
    } as any)

    const report = await reporter.reportError(new Error('stored'))
    const { Store } = await import('@cluvo/core')
    const store = new Store(storeDir)
    const loaded = await store.load('store-test', report.id)
    expect(loaded).not.toBeNull()
  })

  test('reportError does not store when store disabled', async () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'no-store', version: '1.0.0' },
      store: { enabled: false },
    })

    const report = await reporter.reportError(new Error('not stored'))
    expect(report.id).toBeTruthy()
    // No assertion on store — just verifying it doesn't throw
  })

  test('findMatches returns result with fetch mock', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })),
    )
    try {
      const reporter = createReporter({
        repo: 'owner/repo',
        app: { name: 'test-cli', version: '1.0.0' },
        dedupe: { enabled: true },
      })
      const report = reporter.buildReport(new Error('test'))
      const result = await reporter.findMatches(report)
      expect(result.found).toBe(false)
      expect(result.matches).toHaveLength(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('buildReport includes metadata from context', () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'test-cli', version: '1.0.0' },
    })

    const report = reporter.buildReport(new Error('test'), {
      metadata: { origin: 'uncaughtException' },
    })
    expect(report.metadata).toEqual({ origin: 'uncaughtException' })
  })

  test('installGlobalHandlers returns uninstall function', () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'test-cli', version: '1.0.0' },
      interactive: 'never',
      nonInteractive: 'silent',
      store: { enabled: false },
    })

    const uninstall = reporter.installGlobalHandlers()
    expect(typeof uninstall).toBe('function')
    uninstall() // clean up
  })

  test('publish delegates to core publish', async () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'test-cli', version: '1.0.0' },
      mode: 'file',
      _storeDir: storeDir,
    } as any)

    const report = reporter.buildReport(new Error('test'))
    const draft = reporter.buildDraft(report)
    const result = await reporter.publish(draft)
    expect(result.method).toBe('file')
    expect(result.filePath).toBeTruthy()
  })

  test('promptAndSubmit in non-interactive mode does not throw', async () => {
    const reporter = createReporter({
      repo: 'owner/repo',
      app: { name: 'test-cli', version: '1.0.0' },
      interactive: 'never',
      nonInteractive: 'silent',
      store: { enabled: true },
      dedupe: { enabled: false },
      _storeDir: storeDir,
    } as any)

    const report = await reporter.reportError(new Error('test'))
    // Should not throw in non-interactive silent mode
    await reporter.promptAndSubmit(report)
  })
})
