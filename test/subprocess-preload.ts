// Monkey-patch node:child_process to prevent browser opens in subprocess tests.
// Only intercepts browser-opening commands (open/xdg-open/cmd); other execFile
// calls (e.g. gh CLI) pass through to the original implementation.
const cp = require('node:child_process')
const originalExecFile = cp.execFile
cp.execFile = (cmd: string, ...rest: unknown[]) => {
	if (cmd === 'open' || cmd === 'xdg-open' || cmd === 'cmd') {
		const cb = rest[rest.length - 1]
		if (typeof cb === 'function') {
			const callback = cb as (error: Error | null, stdout: string, stderr: string) => void
			callback(null, '', '')
		}
		return
	}
	return originalExecFile(cmd, ...rest)
}
