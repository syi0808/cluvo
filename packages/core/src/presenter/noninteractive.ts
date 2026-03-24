import type { ErrorReport, NonInteractiveMode } from '../types.js'

export function handleNonInteractive(
	_report: ErrorReport,
	mode: NonInteractiveMode,
	filePath?: string,
): void {
	switch (mode) {
		case 'save':
			if (filePath) {
				process.stdout.write(`Bug report saved to ${filePath}\n`)
			}
			break
		case 'log':
			if (filePath) {
				process.stderr.write(`Bug report saved to ${filePath}\n`)
			}
			break
		case 'silent':
			// no output
			break
	}
}
