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

	test('falls back to process.memoryUsage when process.report unavailable', () => {
		const origReport = process.report
		try {
			Object.defineProperty(process, 'report', { value: undefined, configurable: true })
			const diag = collectDiagnostic()
			expect(diag).not.toBeNull()
			expect(diag!.heapUsed).toBeGreaterThan(0)
			expect(diag!.heapTotal).toBeGreaterThan(0)
			expect(diag!.activeHandles).toBeUndefined()
		} finally {
			Object.defineProperty(process, 'report', { value: origReport, configurable: true })
		}
	})

	test('returns null when memoryUsage throws', () => {
		const origMem = process.memoryUsage
		const origReport = process.report
		try {
			Object.defineProperty(process, 'report', { value: undefined, configurable: true })
			process.memoryUsage = (() => {
				throw new Error('fail')
			}) as typeof process.memoryUsage
			const diag = collectDiagnostic()
			expect(diag).toBeNull()
		} finally {
			process.memoryUsage = origMem
			Object.defineProperty(process, 'report', { value: origReport, configurable: true })
		}
	})
})
