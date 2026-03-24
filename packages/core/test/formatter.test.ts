import { describe, expect, test } from 'bun:test'
import { formatTitle, formatBody } from '../src/formatter/format.js'
import type { ErrorReport } from '../src/types.js'

function makeReport(overrides: Partial<ErrorReport> = {}): ErrorReport {
  return {
    id: 'test-id',
    createdAt: '2026-03-24T10:00:00Z',
    app: { name: 'my-cli', version: '1.0.0', runtime: 'node' },
    error: {
      name: 'TypeError',
      message: 'Cannot read property of undefined',
      stack: 'TypeError: Cannot read property of undefined\n  at foo (src/foo.ts:10:5)\n  at bar (src/bar.ts:20:3)',
    },
    environment: { os: 'darwin 23.1.0', arch: 'arm64', runtimeVersion: 'v20.11.0' },
    command: { command: 'deploy', subcommand: 'prod', argv: ['deploy', 'prod', '--force'] },
    sanitizedFields: ['error.stack'],
    status: 'pending',
    ...overrides,
  }
}

describe('formatTitle', () => {
  test('generates title from error', () => {
    const title = formatTitle(makeReport())
    expect(title).toContain('TypeError')
    expect(title).toContain('Cannot read property of undefined')
  })

  test('includes command when present', () => {
    const title = formatTitle(makeReport())
    expect(title).toContain('deploy')
  })

  test('uses custom title formatter', () => {
    const report = makeReport()
    const title = formatTitle(report, (ctx) => `[BUG] ${ctx.error.name}`)
    expect(title).toBe('[BUG] TypeError')
  })
})

describe('formatBody', () => {
  test('includes all default sections', () => {
    const body = formatBody(makeReport())
    expect(body).toContain('## Environment')
    expect(body).toContain('## Stack Trace')
    expect(body).toContain('## Command')
    expect(body).toContain('darwin')
    expect(body).toContain('arm64')
    expect(body).toContain('v20.11.0')
  })

  test('includes stack trace in code block', () => {
    const body = formatBody(makeReport())
    expect(body).toContain('```')
    expect(body).toContain('at foo (src/foo.ts:10:5)')
  })

  test('includes command context', () => {
    const body = formatBody(makeReport())
    expect(body).toContain('deploy prod --force')
  })

  test('filters sections by list', () => {
    const body = formatBody(makeReport(), { sections: ['environment'] })
    expect(body).toContain('## Environment')
    expect(body).not.toContain('## Stack Trace')
  })

  test('shows sanitized fields notice', () => {
    const body = formatBody(makeReport())
    expect(body).toContain('sanitized')
  })

  test('handles missing optional fields', () => {
    const report = makeReport({ command: undefined, error: { name: 'Error', message: 'fail' } })
    const body = formatBody(report)
    expect(body).toContain('## Environment')
    expect(body).not.toContain('## Command')
  })
})
