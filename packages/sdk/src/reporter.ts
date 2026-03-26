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
	type ExitHandlerOptions,
	formatBody,
	formatTitle,
	generateReportId,
	handleNonInteractive,
	installGlobalHandlers as installGlobalHandlersCore,
	isAuthAvailable,
	type MatchResult,
	match,
	type PresenterAdapter,
	type PublishResult,
	type ReporterConfig,
	Store,
	sanitize,
	type WrapOptions,
} from '@cluvo/core'
import { type InternalConfig, resolveConfig } from './config.js'
import { createExitHandler } from './exit-handler.js'
import { PRESETS } from './presets.js'
import { getRegistry } from './registry.js'
import { TerminalPresenter } from './terminal-presenter.js'

export interface Reporter {
	reportError(error: unknown, context?: ErrorContext): Promise<ErrorReport>
	reportAndPrompt(error: unknown, context?: ErrorContext): Promise<void>
	promptAndSubmit(report: ErrorReport): Promise<void>
	wrap(fn: () => Promise<void>, opts?: WrapOptions): Promise<void>
	wrapCommand(fn: () => Promise<void>, opts?: WrapOptions): Promise<void>
	installGlobalHandlers(): () => void
	installExitHandler(opts?: ExitHandlerOptions): () => void
	buildReport(error: unknown, context?: ErrorContext): ErrorReport
	sanitizeReport(report: ErrorReport): ErrorReport
	findMatches(report: ErrorReport): Promise<MatchResult>
	buildDraft(report: ErrorReport): DraftPayload
	publish(draft: DraftPayload): Promise<PublishResult>
	receiveChildReport(report: ErrorReport): Promise<void>
}

export function createReporter(userConfig: ReporterConfig | InternalConfig): Reporter {
	const config = resolveConfig(userConfig as InternalConfig)
	const store = new Store(config.storeDir, config.store?.maxReports)

	// --- Presenter resolution ---
	const presetName = config.preset ?? 'cli'
	let presenter: PresenterAdapter | null
	if (config.presenter !== undefined) {
		presenter = config.presenter
	} else if (config.interactive === 'never') {
		presenter = null
	} else {
		const presetPresenter = PRESETS[presetName]?.presenter
		presenter = presetPresenter === 'terminal' ? new TerminalPresenter() : null
	}

	// --- Registry integration ---
	const reporterId = config.app.name
	const registry = getRegistry()
	const registeredEntry = {
		id: reporterId,
		reporter: { receiveChildReport },
		childPolicy: config.childPolicy ?? 'passthrough',
	}
	registry.register(registeredEntry)

	// --- Error dedup ---
	const seenErrors = new WeakMap<object, ErrorReport>()

	// --- Prompt queue ---
	let promptQueue = Promise.resolve()
	function enqueuePrompt(fn: () => Promise<void>): Promise<void> {
		const task = promptQueue.then(fn, () => fn())
		promptQueue = task.catch(() => {})
		return task
	}

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
		// Dedup: return cached report for same error object (primitives bypass dedup — WeakMap constraint)
		if (typeof error === 'object' && error !== null && seenErrors.has(error)) {
			return seenErrors.get(error)!
		}

		try {
			const report = buildReport(error, context)
			const sanitized = sanitizeReport(report)

			if (config.store?.enabled !== false) {
				await store.save(sanitized)
			}

			// Cache for dedup
			if (typeof error === 'object' && error !== null) {
				seenErrors.set(error, sanitized)
			}

			return sanitized
		} catch {
			// Never throw -- return minimal report
			const minimal: ErrorReport = {
				id: generateReportId(),
				createdAt: new Date().toISOString(),
				app: { name: config.app.name, version: config.app.version, runtime: 'unknown' },
				error: { name: 'Error', message: String(error) },
				environment: { os: 'unknown', arch: 'unknown', runtimeVersion: 'unknown' },
				sanitizedFields: [],
				status: 'pending',
			}
			if (typeof error === 'object' && error !== null) {
				seenErrors.set(error, minimal)
			}
			return minimal
		}
	}

	async function promptAndSubmit(report: ErrorReport): Promise<void> {
		// Check parent's childPolicy
		const myEntry = registry.stack.find((e) => e.id === reporterId)
		if (myEntry) {
			const parent = registry.getParent(myEntry)
			if (parent) {
				switch (parent.childPolicy) {
					case 'absorb':
						// Forward to parent, don't prompt locally
						await parent.reporter.receiveChildReport(report)
						return
					case 'silent':
						// Store only, no prompt (already stored in reportError)
						return
					case 'passthrough':
						// Fall through to normal prompt
						break
				}
			}
		}

		// Dedupe check
		const matchResult =
			config.dedupe?.enabled !== false ? await findMatches(report) : { found: false, matches: [] }
		if (matchResult.found) {
			report = { ...report, matches: matchResult.matches }
		}

		const draft = buildDraft(report)

		// If no presenter, handle non-interactive
		if (!presenter) {
			const filePath =
				config.store?.enabled !== false
					? `${config.storeDir}/reports/${report.app.name}/${report.id}.json`
					: undefined
			handleNonInteractive(report, config.nonInteractive ?? 'save', filePath)
			return
		}

		// Use presenter adapter
		const authAvailable = await isAuthAvailable()
		try {
			const action = await presenter.prompt({
				report,
				draft,
				authAvailable,
				promptMessage: config.prompt?.message,
				branding: config.branding,
			})

			if (!action || action.type === 'cancel') {
				await store.updateStatus(report.app.name, report.id, 'dismissed')
				return
			}

			switch (action.type) {
				case 'view': {
					const { openBrowser } = await import('@cluvo/core')
					try {
						await openBrowser(action.issue.url)
					} catch {}
					break
				}
				case 'react':
					await addReaction(config.repo, action.issue.number)
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
					await store.updateStatus(report.app.name, report.id, 'dismissed')
					break
				}
			}
		} catch (err) {
			// Presenter crashed -- swallow to avoid crashing host
			if (process.env.CLUVO_DEBUG) {
				process.stderr.write(`[cluvo] presenter error: ${err}\n`)
			}
		}
	}

	async function reportAndPrompt(error: unknown, context?: ErrorContext): Promise<void> {
		const report = await reportError(error, context)
		await enqueuePrompt(() => promptAndSubmit(report))
	}

	async function wrap(fn: () => Promise<void>, opts?: WrapOptions): Promise<void> {
		try {
			await fn()
		} catch (error) {
			await reportAndPrompt(error)
			if (opts?.rethrow !== false) throw error
		}
	}

	async function wrapCommand(fn: () => Promise<void>, opts?: WrapOptions): Promise<void> {
		try {
			await fn()
		} catch (error) {
			const context: ErrorContext = {
				command: process.argv[2],
				subcommand: process.argv[3],
				argv: process.argv.slice(2),
			}
			const report = await reportError(error, context)
			await enqueuePrompt(() => promptAndSubmit(report))
			if (opts?.rethrow !== false) throw error
		}
	}

	function setupGlobalHandlers(): () => void {
		return installGlobalHandlersCore(async (payload, origin) => {
			const report = await reportError(payload, { metadata: { origin } })
			await promptAndSubmit(report)
		})
	}

	function installExitHandlerFn(opts?: ExitHandlerOptions): () => void {
		return createExitHandler({
			getPendingReports: async () => {
				const reports = await store.list(config.app.name)
				return reports.filter((r) => r.status === 'pending')
			},
			onPending: async (pending) => {
				for (const report of pending) {
					await promptAndSubmit(report)
				}
			},
			interceptProcessExit: opts?.interceptProcessExit,
			timeout: opts?.timeout,
		})
	}

	async function receiveChildReport(report: ErrorReport): Promise<void> {
		if (config.store?.enabled !== false) {
			await store.save(report)
		}
		await enqueuePrompt(() => promptAndSubmit(report))
	}

	return {
		reportError,
		reportAndPrompt,
		promptAndSubmit,
		wrap,
		wrapCommand,
		installGlobalHandlers: setupGlobalHandlers,
		installExitHandler: installExitHandlerFn,
		buildReport,
		sanitizeReport,
		findMatches,
		buildDraft,
		publish: publishDraft,
		receiveChildReport,
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
