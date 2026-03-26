import type { PresenterAction, PresenterAdapter, PromptContext } from '@cluvo/core'
import { boldCyan, renderDetails, renderPromptMessage, renderSummary } from '@cluvo/core'

// Capture at module load time — before TUI frameworks can patch
const originalStdoutWriteRef = process.stdout.write // unbound, for comparison
const originalStdoutWrite = process.stdout.write.bind(process.stdout) // bound, for calling
const originalStdin = process.stdin

export function getOriginalStdoutWrite() {
	return originalStdoutWrite
}

export function isStdoutPatched(): boolean {
	return process.stdout.write !== originalStdoutWriteRef
}

export class TerminalPresenter implements PresenterAdapter {
	async prompt(context: PromptContext): Promise<PresenterAction | null> {
		if (!process.stdout.isTTY) return null

		const write = isStdoutPatched() ? originalStdoutWrite : process.stdout.write.bind(process.stdout)
		const stdin = originalStdin

		if (isStdoutPatched()) {
			// TUI fallback: move cursor to bottom of terminal
			const rows = process.stdout.rows || 24
			write(`\x1b[${rows};1H\x1b[2K`)
		}

		const message = renderPromptMessage(context.promptMessage, context.branding?.showName)
		const spacing = context.promptSpacing ?? 1
		if (spacing < 0) {
			const up = Math.abs(spacing)
			write(`\x1b[${up}A\x1b[2K${message} `)
		} else {
			write(`${'\n'.repeat(spacing)}${message} `)
		}

		const confirmed = await readYesNo(stdin, write)
		if (!confirmed) return null

		write(`\n${renderSummary(context.report, context.draft)}\n\n`)

		return await promptAction(context, stdin, write)
	}
}

type WriteFn = (chunk: string) => boolean

async function promptAction(
	context: PromptContext,
	stdin: typeof process.stdin,
	write: WriteFn,
): Promise<PresenterAction> {
	const hasMatches = (context.report.matches?.length ?? 0) > 0

	const options: string[] = []
	if (hasMatches) {
		options.push(`${boldCyan('[v]')} View similar issue`)
		if (context.authAvailable) options.push(`${boldCyan('[r]')} React to issue`)
	}
	options.push(`${boldCyan('[o]')} Open in browser`)
	options.push(`${boldCyan('[g]')} Create via gh`)
	options.push(`${boldCyan('[s]')} Save as markdown`)
	options.push(`${boldCyan('[d]')} Details`)
	options.push(`${boldCyan('[c]')} Cancel`)

	write(`${options.join('  ')}\n`)

	const key = await readKey(stdin, write)

	switch (key) {
		case 'v': {
			const issue = context.report.matches?.[0]
			return issue ? { type: 'view', issue } : await promptAction(context, stdin, write)
		}
		case 'r': {
			const issue = context.report.matches?.[0]
			return issue ? { type: 'react', issue } : await promptAction(context, stdin, write)
		}
		case 'o':
			return { type: 'open' }
		case 'g':
			return { type: 'gh' }
		case 's':
			return { type: 'save' }
		case 'c':
			return { type: 'cancel' }
		case 'd': {
			write(`\n${renderDetails(context.draft)}\n\n`)
			return await promptAction(context, stdin, write)
		}
		default:
			return { type: 'cancel' }
	}
}

function readYesNo(stdin: typeof process.stdin, write: WriteFn): Promise<boolean> {
	return new Promise((resolve) => {
		if (!stdin.isTTY) {
			resolve(false)
			return
		}
		stdin.setRawMode(true)
		stdin.resume()
		stdin.once('data', (data) => {
			stdin.setRawMode(false)
			stdin.pause()
			const char = data.toString().trim().toLowerCase()
			write(char === 'n' ? 'n\n' : 'Y\n')
			resolve(char !== 'n')
		})
	})
}

function readKey(stdin: typeof process.stdin, write: WriteFn): Promise<string> {
	return new Promise((resolve) => {
		stdin.setRawMode(true)
		stdin.resume()
		stdin.once('data', (data) => {
			stdin.setRawMode(false)
			stdin.pause()
			const char = data.toString().trim().toLowerCase()
			write(`${char}\n`)
			resolve(char)
		})
	})
}
