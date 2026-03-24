import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
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
})
