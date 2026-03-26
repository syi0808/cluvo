import { mock } from 'bun:test'

// Prevent tests from opening a real browser via openBrowser() → execFile('open', ...)
mock.module('node:child_process', () => ({
	execFile: (_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
		cb(null)
	},
}))
