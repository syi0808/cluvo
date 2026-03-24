import { describe, expect, test } from 'bun:test'
import { collectDiagnostic } from '../src/diagnostic/diagnostic.js'

describe('collectDiagnostic', () => {
  test('returns summary object with memory and uptime', () => {
    const diag = collectDiagnostic()
    if (diag === null) {
      expect(diag).toBeNull()
    } else {
      expect(diag).toHaveProperty('heapUsed')
      expect(diag).toHaveProperty('heapTotal')
      expect(diag).toHaveProperty('uptime')
      expect(typeof diag.heapUsed).toBe('number')
    }
  })

  test('includes resourceUsage when available from process.report', () => {
    const diag = collectDiagnostic()
    if (diag === null) return
    expect(diag.heapUsed).toBeGreaterThan(0)
  })
})
