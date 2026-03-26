import type { DraftPayload, ErrorReport, PresenterAction, ReporterConfig } from '../types.js'
import { renderDetails, renderPromptMessage, renderSummary } from './render.js'
import { boldCyan } from './style.js'

export async function promptUser(
	report: ErrorReport,
	draft: DraftPayload,
	config: ReporterConfig,
	authAvailable: boolean,
): Promise<PresenterAction | null> {
	const message = renderPromptMessage(config.prompt?.message, config.branding?.showName)
	process.stdout.write(`\n${message} `)

	const confirmed = await readYesNo()
	if (!confirmed) return null

	process.stdout.write(`\n${renderSummary(report, draft)}\n\n`)

	return await promptAction(report, draft, authAvailable)
}

async function promptAction(
	report: ErrorReport,
	draft: DraftPayload,
	authAvailable: boolean,
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

	process.stdout.write(`${options.join('  ')}\n`)

	const key = await readKey()

	switch (key) {
		case 'v': {
			const issue = report.matches?.[0]
			return issue ? { type: 'view', issue } : await promptAction(report, draft, authAvailable)
		}
		case 'r': {
			const issue = report.matches?.[0]
			return issue ? { type: 'react', issue } : await promptAction(report, draft, authAvailable)
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
			process.stdout.write(`\n${renderDetails(draft)}\n\n`)
			return await promptAction(report, draft, authAvailable)
		}
		default:
			return { type: 'cancel' }
	}
}

function readYesNo(): Promise<boolean> {
	return new Promise((resolve) => {
		if (!process.stdin.isTTY) {
			resolve(false)
			return
		}
		process.stdin.setRawMode(true)
		process.stdin.resume()
		process.stdin.once('data', (data) => {
			process.stdin.setRawMode(false)
			process.stdin.pause()
			const char = data.toString().trim().toLowerCase()
			process.stdout.write(char === 'n' ? 'n\n' : 'Y\n')
			resolve(char !== 'n')
		})
	})
}

function readKey(): Promise<string> {
	return new Promise((resolve) => {
		process.stdin.setRawMode(true)
		process.stdin.resume()
		process.stdin.once('data', (data) => {
			process.stdin.setRawMode(false)
			process.stdin.pause()
			const char = data.toString().trim().toLowerCase()
			process.stdout.write(`${char}\n`)
			resolve(char)
		})
	})
}
