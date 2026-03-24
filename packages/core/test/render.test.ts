import { describe, expect, test } from 'bun:test'
import { renderPromptMessage, renderSummary } from '../src/presenter/render.js'
import type { ErrorReport, DraftPayload } from '../src/types.js'

describe('renderPromptMessage', () => {
  test('returns custom message when provided', () => {
    expect(renderPromptMessage('Custom prompt?')).toBe('Custom prompt?')
  })

  test('uses Cluvo branding when showBranding is true', () => {
    const msg = renderPromptMessage(undefined, true)
    expect(msg).toContain('Cluvo can prepare')
  })

  test('uses Prepare when showBranding is false', () => {
    const msg = renderPromptMessage(undefined, false)
    expect(msg).toStartWith('Prepare')
    expect(msg).not.toContain('Cluvo')
  })
})

describe('renderSummary edge cases', () => {
  const draft: DraftPayload = { title: 'Error: test', body: 'body' }

  test('omits command line when no argv', () => {
    const report: ErrorReport = {
      id: 'r1',
      createdAt: '2026-01-01T00:00:00Z',
      app: { name: 'app', version: '1.0.0', runtime: 'node' },
      error: { name: 'Error', message: 'test' },
      environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v20' },
      sanitizedFields: [],
      status: 'pending',
    }
    const output = renderSummary(report, draft)
    expect(output).not.toContain('Command:')
  })

  test('omits sanitized notice when 0 fields', () => {
    const report: ErrorReport = {
      id: 'r1',
      createdAt: '2026-01-01T00:00:00Z',
      app: { name: 'app', version: '1.0.0', runtime: 'node' },
      error: { name: 'Error', message: 'test' },
      environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v20' },
      sanitizedFields: [],
      status: 'pending',
    }
    const output = renderSummary(report, draft)
    expect(output).not.toContain('sanitized')
  })
})
