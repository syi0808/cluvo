const RESET = '\x1b[0m'

let enabled =
	typeof process !== 'undefined' &&
	process.stdout?.isTTY === true &&
	!process.env.NO_COLOR &&
	process.env.FORCE_COLOR !== '0'

export function setColorEnabled(flag: boolean): void {
	enabled = flag
}

export function isColorEnabled(): boolean {
	return enabled
}

function wrap(code: string, s: string): string {
	return enabled ? `${code}${s}${RESET}` : s
}

export function bold(s: string): string {
	return wrap('\x1b[1m', s)
}

export function dim(s: string): string {
	return wrap('\x1b[2m', s)
}

export function cyan(s: string): string {
	return wrap('\x1b[36m', s)
}

export function yellow(s: string): string {
	return wrap('\x1b[33m', s)
}

export function green(s: string): string {
	return wrap('\x1b[32m', s)
}

export function boldCyan(s: string): string {
	return wrap('\x1b[1;36m', s)
}

export function stripAnsi(s: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences intentionally start with ESC.
	return s.replace(/\x1b\[[0-9;]*m/g, '')
}
