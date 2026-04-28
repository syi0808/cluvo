import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DraftPayload, ReporterMode } from '../types.js'
import { checkGhAuth, checkGhInstalled, getGithubToken } from './auth.js'
import { buildBrowserUrl, openBrowser } from './browser.js'
import { saveReportFile } from './file-export.js'
import { ghCreate } from './gh-cli.js'
import { apiCreate } from './github-api.js'
import { renderTerminalDraft } from './terminal.js'

export interface PublishResult {
	method: 'browser' | 'gh' | 'api' | 'file' | 'terminal'
	issueUrl?: string
	filePath?: string
}

export interface PublishOptions {
	repo: string
	mode?: ReporterMode
	fallbackDir?: string
}

export async function publish(
	draft: DraftPayload,
	options: PublishOptions,
): Promise<PublishResult> {
	const chain = buildChain(options.mode ?? 'browser')

	for (const method of chain) {
		try {
			const result = await tryPublish(method, draft, options)
			if (result) return result
		} catch {
			// fall through to next
		}
	}

	// Final fallback: file + terminal (always succeeds)
	return await fileFallback(draft, options)
}

function buildChain(startMode: ReporterMode): ReporterMode[] {
	const all: ReporterMode[] = ['browser', 'gh', 'api', 'file']
	const startIndex = all.indexOf(startMode)
	return all.slice(startIndex)
}

async function tryPublish(
	method: ReporterMode,
	draft: DraftPayload,
	options: PublishOptions,
): Promise<PublishResult | null> {
	switch (method) {
		case 'browser': {
			const url = buildBrowserUrl(draft, options.repo)
			if (!url) return null
			await openBrowser(url)
			return { method: 'browser' }
		}
		case 'gh': {
			if (!(await checkGhInstalled()) || !(await checkGhAuth())) return null
			const issueUrl = await ghCreate(draft, options.repo)
			return { method: 'gh', issueUrl }
		}
		case 'api': {
			const token = getGithubToken()
			if (!token) return null
			const issueUrl = await apiCreate(draft, options.repo, token)
			return { method: 'api', issueUrl }
		}
		case 'file': {
			return await fileFallback(draft, options)
		}
	}
}

async function fileFallback(draft: DraftPayload, options: PublishOptions): Promise<PublishResult> {
	const filename = `cluvo-report-${Date.now()}.md`
	const dirs = [
		options.fallbackDir,
		join(process.env.HOME || '.', '.cluvo', 'drafts'),
		join(tmpdir(), 'cluvo-drafts'),
	].filter((dir, index, all): dir is string => !!dir && all.indexOf(dir) === index)

	let lastError: unknown
	for (const dir of dirs) {
		const filePath = join(dir, filename)
		try {
			await saveReportFile(draft, filePath)
			process.stderr.write(renderTerminalDraft(draft))
			return { method: 'file', filePath }
		} catch (error) {
			lastError = error
		}
	}

	throw lastError
}
