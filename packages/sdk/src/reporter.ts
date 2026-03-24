import {
	captureError,
	collectApp,
	collectCommand,
	collectDiagnostic,
	collectEnvironment,
	publish as corePublish,
	type DraftPayload,
	type ErrorContext,
	type ErrorReport,
	formatBody,
	formatTitle,
	generateReportId,
	handleNonInteractive,
	installGlobalHandlers as installGlobalHandlersCore,
	isAuthAvailable,
	type MatchResult,
	match,
	type PublishResult,
	promptUser,
	type ReporterConfig,
	Store,
	sanitize,
} from '@cluvo/core'
import { type InternalConfig, resolveConfig } from './config.js'

export interface Reporter {
	reportError(error: unknown, context?: ErrorContext): Promise<ErrorReport>
	promptAndSubmit(report: ErrorReport): Promise<void>
	installGlobalHandlers(): () => void
	wrapCommand(fn: () => Promise<void>): Promise<void>

	// Low-level API
	buildReport(error: unknown, context?: ErrorContext): ErrorReport
	sanitizeReport(report: ErrorReport): ErrorReport
	findMatches(report: ErrorReport): Promise<MatchResult>
	buildDraft(report: ErrorReport): DraftPayload
	publish(draft: DraftPayload): Promise<PublishResult>
}

export function createReporter(userConfig: ReporterConfig | InternalConfig): Reporter {
	const config = resolveConfig(userConfig as InternalConfig)
	const store = new Store(config.storeDir, config.store?.maxReports)

	function buildReport(error: unknown, context?: ErrorContext): ErrorReport {
		const errorPayload = captureError(error)
		const environment = collectEnvironment()
		const app = collectApp(config.app)

		const command = context
			? { command: context.command, subcommand: context.subcommand, argv: context.argv }
			: config.collect?.argv !== false
				? collectCommand()
				: undefined

		const diagnostic = config.collect?.diagnosticReport ? collectDiagnostic() : undefined

		return {
			id: generateReportId(),
			createdAt: new Date().toISOString(),
			app,
			error: errorPayload,
			environment,
			command,
			diagnostic,
			sanitizedFields: [],
			metadata: context?.metadata,
			status: 'pending',
		}
	}

	function sanitizeReport(report: ErrorReport): ErrorReport {
		if (config.sanitize?.enabled === false) return report
		return sanitize(report, config.sanitize?.customRules)
	}

	async function findMatches(report: ErrorReport): Promise<MatchResult> {
		return match(report, config)
	}

	function buildDraft(report: ErrorReport): DraftPayload {
		const titleFormatter = config.issue?.title
		const title = formatTitle(report, titleFormatter)
		const body = formatBody(report, { sections: config.issue?.sections })
		return {
			title,
			body,
			labels: config.issue?.labels,
		}
	}

	async function publishDraft(draft: DraftPayload): Promise<PublishResult> {
		return corePublish(draft, {
			repo: config.repo,
			mode: config.mode,
		})
	}

	async function reportError(error: unknown, context?: ErrorContext): Promise<ErrorReport> {
		try {
			const report = buildReport(error, context)
			const sanitized = sanitizeReport(report)

			if (config.store?.enabled !== false) {
				await store.save(sanitized)
			}

			return sanitized
		} catch {
			// Never throw — return minimal report
			return {
				id: generateReportId(),
				createdAt: new Date().toISOString(),
				app: { name: config.app.name, version: config.app.version, runtime: 'unknown' },
				error: { name: 'Error', message: String(error) },
				environment: { os: 'unknown', arch: 'unknown', runtimeVersion: 'unknown' },
				sanitizedFields: [],
				status: 'pending',
			}
		}
	}

	async function promptAndSubmit(report: ErrorReport): Promise<void> {
		const isInteractive = config.interactive === 'auto' ? !!process.stdout.isTTY : false

		const matchResult = await findMatches(report)
		if (matchResult.found) {
			report = { ...report, matches: matchResult.matches }
		}

		const draft = buildDraft(report)

		if (!isInteractive) {
			const filePath =
				config.store?.enabled !== false
					? `${config.storeDir}/reports/${report.app.name}/${report.id}.json`
					: undefined
			handleNonInteractive(report, config.nonInteractive ?? 'save', filePath)
			return
		}

		const authAvailable = await isAuthAvailable()
		const action = await promptUser(report, draft, config, authAvailable)

		if (!action || action.type === 'cancel') return

		switch (action.type) {
			case 'view':
				if (action.issue?.url) {
					const { openBrowser } = await import('@cluvo/core')
					try {
						await openBrowser(action.issue.url)
					} catch {}
				}
				break
			case 'react':
				if (action.issue) {
					await addReaction(config.repo, action.issue.number)
				}
				break
			case 'open':
				await corePublish(draft, { repo: config.repo, mode: 'browser' })
				await store.updateStatus(report.app.name, report.id, 'submitted')
				break
			case 'gh':
				await corePublish(draft, { repo: config.repo, mode: 'gh' })
				await store.updateStatus(report.app.name, report.id, 'submitted')
				break
			case 'save': {
				const { saveReportFile } = await import('@cluvo/core')
				const path = `${config.storeDir}/drafts/cluvo-report-${Date.now()}.md`
				await saveReportFile(draft, path)
				process.stdout.write(`Saved to ${path}\n`)
				break
			}
		}
	}

	function setupGlobalHandlers(): () => void {
		return installGlobalHandlersCore(async (payload, origin) => {
			const report = await reportError(payload, { metadata: { origin } })
			await promptAndSubmit(report)
		})
	}

	async function wrapCommand(fn: () => Promise<void>): Promise<void> {
		try {
			await fn()
		} catch (error) {
			const context: ErrorContext = {
				command: process.argv[2],
				subcommand: process.argv[3],
				argv: process.argv.slice(2),
			}
			const report = await reportError(error, context)
			await promptAndSubmit(report)
			throw error
		}
	}

	return {
		reportError,
		promptAndSubmit,
		installGlobalHandlers: setupGlobalHandlers,
		wrapCommand,
		buildReport,
		sanitizeReport,
		findMatches,
		buildDraft,
		publish: publishDraft,
	}
}

async function addReaction(repo: string, issueNumber: number): Promise<void> {
	const { checkGhAuth, getGithubToken } = await import('@cluvo/core')

	if (await checkGhAuth()) {
		const { execFile } = await import('node:child_process')
		await new Promise<void>((resolve) => {
			execFile(
				'gh',
				['api', `repos/${repo}/issues/${issueNumber}/reactions`, '-f', 'content=+1'],
				() => resolve(),
			)
		})
		return
	}

	const token = getGithubToken()
	if (token) {
		await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}/reactions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.v3+json',
				'Content-Type': 'application/json',
				'User-Agent': 'cluvo',
			},
			body: JSON.stringify({ content: '+1' }),
		})
	}
}
