import { describe, expect, mock, test } from 'bun:test'

let mockExecFile: ReturnType<typeof mock>

mock.module('node:child_process', () => ({
	execFile: (...args: unknown[]) => mockExecFile(...args),
}))

const { openBrowser } = await import('../src/publisher/browser.js')

describe('openBrowser', () => {
	test('resolves when command succeeds', async () => {
		mockExecFile = mock((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
			cb(null)
		})
		await expect(openBrowser('https://example.com')).resolves.toBeUndefined()
	})

	test('rejects when command fails', async () => {
		mockExecFile = mock((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
			cb(new Error('spawn failed'))
		})
		await expect(openBrowser('https://example.com')).rejects.toThrow('Failed to open browser')
	})

	test('passes URL as argument to platform command', async () => {
		mockExecFile = mock((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
			cb(null)
		})
		await openBrowser('https://example.com')
		const [, args] = mockExecFile.mock.calls[0]
		expect(args).toContain('https://example.com')
	})
})
