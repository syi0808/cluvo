import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { PromptContext } from '@cluvo/core'

// We need to test the module-level capture of original stdout
// Import after potential patches to verify capture timing

describe('TerminalPresenter', () => {
	function makeContext(overrides: Partial<PromptContext> = {}): PromptContext {
		return {
			report: {
				id: 'test-id',
				createdAt: new Date().toISOString(),
				app: { name: 'test', version: '1.0.0', runtime: 'node' },
				error: { name: 'Error', message: 'test error' },
				environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v22.0.0' },
				sanitizedFields: [],
				status: 'pending',
			},
			draft: { title: 'Error: test error', body: '## Summary\n\ntest error' },
			authAvailable: false,
			...overrides,
		}
	}

	test('returns null in non-TTY environment', async () => {
		const { TerminalPresenter } = await import('../src/terminal-presenter.js')
		const presenter = new TerminalPresenter()
		// In test environment, stdout is typically not a TTY
		const result = await presenter.prompt(makeContext())
		expect(result).toBeNull()
	})

	test('captures original stdout.write at module load time', async () => {
		const { getOriginalStdoutWrite } = await import('../src/terminal-presenter.js')
		const original = getOriginalStdoutWrite()
		expect(typeof original).toBe('function')
	})

	test('detects patched stdout.write', async () => {
		const { isStdoutPatched } = await import('../src/terminal-presenter.js')
		expect(isStdoutPatched()).toBe(false)

		const original = process.stdout.write
		process.stdout.write = (() => true) as any
		expect(isStdoutPatched()).toBe(true)
		process.stdout.write = original
	})
})
