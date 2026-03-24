import type { DraftPayload, ErrorReport } from '../types.js'

export function renderSummary(report: ErrorReport, draft: DraftPayload): string {
	const lines: string[] = []

	lines.push(`── Bug Report ${'─'.repeat(36)}`)
	lines.push(draft.title)
	lines.push(
		`${report.environment.os} · ${report.app.runtime} ${report.environment.runtimeVersion} · ${report.environment.arch}`,
	)

	if (report.command?.argv?.length) {
		lines.push(`Command: ${report.command.argv.join(' ')}`)
	}

	if (report.sanitizedFields.length > 0) {
		lines.push(`${report.sanitizedFields.length} field(s) sanitized`)
	}

	if (report.matches?.length) {
		lines.push('')
		lines.push('Similar issues found:')
		for (const match of report.matches.slice(0, 3)) {
			const state = match.state === 'open' ? 'open' : 'closed'
			lines.push(`  #${match.number} [${state}]  ${match.title}`)
		}
	}

	lines.push('─'.repeat(50))
	return lines.join('\n')
}

export function renderDetails(draft: DraftPayload): string {
	return `── Full Report ${'─'.repeat(35)}\n\n${draft.body}\n${'─'.repeat(50)}`
}

export function renderPromptMessage(customMessage?: string, showBranding?: boolean): string {
	const brand = showBranding ? 'Cluvo can prepare' : 'Prepare'
	return customMessage ?? `${brand} a sanitized bug report? (Y/n)`
}
