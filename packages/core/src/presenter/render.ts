import type { DraftPayload, ErrorReport } from '../types.js'
import { bold, boldCyan, cyan, dim, green, yellow } from './style.js'

export function renderSummary(report: ErrorReport, draft: DraftPayload): string {
	const lines: string[] = []

	lines.push(boldCyan(`── Bug Report ${'─'.repeat(36)}`))
	lines.push(bold(draft.title))
	lines.push(
		dim(
			`${report.environment.os} · ${report.app.runtime} ${report.environment.runtimeVersion} · ${report.environment.arch}`,
		),
	)

	if (report.command?.argv?.length) {
		lines.push(`${dim('Command:')} ${cyan(report.command.argv.join(' '))}`)
	}

	if (report.sanitizedFields.length > 0) {
		lines.push(yellow(`${report.sanitizedFields.length} field(s) sanitized`))
	}

	if (report.matches?.length) {
		lines.push('')
		lines.push(yellow('Similar issues found:'))
		for (const match of report.matches.slice(0, 3)) {
			const stateLabel = match.state === 'open' ? green('[open]') : dim('[closed]')
			lines.push(`  ${dim(`#${match.number}`)} ${stateLabel}  ${match.title}`)
		}
	}

	lines.push(dim('─'.repeat(50)))
	return lines.join('\n')
}

export function renderDetails(draft: DraftPayload): string {
	return `${boldCyan(`── Full Report ${'─'.repeat(35)}`)}\n\n${draft.body}\n${dim('─'.repeat(50))}`
}

export function renderPromptMessage(customMessage?: string, showBranding?: boolean): string {
	const brand = showBranding ? 'Cluvo can prepare' : 'Prepare'
	return customMessage ?? bold(`${brand} a sanitized bug report? (Y/n)`)
}
