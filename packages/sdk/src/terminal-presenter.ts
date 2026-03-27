import type { PresenterAction, PresenterAdapter, PromptContext, WriteFn } from '@cluvo/core'
import { promptAction, readYesNo, renderPromptMessage, renderSummary } from '@cluvo/core'

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

		const write = isStdoutPatched()
			? originalStdoutWrite
			: (process.stdout.write.bind(process.stdout) as WriteFn)
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

		return await promptAction(context.report, context.draft, context.authAvailable, stdin, write)
	}
}
