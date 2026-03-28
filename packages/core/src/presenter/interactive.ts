import type { DraftPayload, ErrorReport, PresenterAction, ReporterConfig } from '../types.js'
import type { WriteFn } from './io.js'
import { readKey, readYesNo } from './io.js'
import { renderDetails, renderPromptMessage, renderSummary } from './render.js'
import { boldCyan } from './style.js'

export async function promptUser(
	report: ErrorReport,
	draft: DraftPayload,
	config: ReporterConfig,
	authAvailable: boolean,
): Promise<PresenterAction | null> {
	const message = renderPromptMessage(config.prompt?.message, config.branding?.showName)
	const write = process.stdout.write.bind(process.stdout) as WriteFn

	write(`\n${message} `)

	const confirmed = await readYesNo(process.stdin, write)
	if (!confirmed) return null

	write(`\n${renderSummary(report, draft)}\n\n`)

	return await promptAction(report, draft, authAvailable, process.stdin, write)
}

export async function promptAction(
	report: ErrorReport,
	draft: DraftPayload,
	authAvailable: boolean,
	stdin: typeof process.stdin,
	write: WriteFn,
): Promise<PresenterAction> {
	const hasMatches = (report.matches?.length ?? 0) > 0

	const options: string[] = []
	if (hasMatches) {
		options.push(`${boldCyan('[v]')} View similar issue`)
		if (authAvailable) options.push(`${boldCyan('[r]')} React to issue`)
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
			const issue = report.matches?.[0]
			return issue
				? { type: 'view', issue }
				: await promptAction(report, draft, authAvailable, stdin, write)
		}
		case 'r': {
			const issue = report.matches?.[0]
			return issue
				? { type: 'react', issue }
				: await promptAction(report, draft, authAvailable, stdin, write)
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
			write(`\n${renderDetails(draft)}\n\n`)
			return await promptAction(report, draft, authAvailable, stdin, write)
		}
		default:
			return { type: 'cancel' }
	}
}
