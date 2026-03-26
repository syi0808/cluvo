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

/**
 * Check whether the first non-SDK caller frame is at module top-level.
 *
 * Top-level:  "at /path/file.ts:5"  or  "at \<anonymous\> (/path:5)"
 * Function:   "at namedFunction (/path:5)"
 */
function checkTopLevel(stack: string): boolean {
	const lines = stack.split('\n')

	for (const line of lines) {
		if (!line.includes('at ')) continue

		// Skip SDK-internal frames by path
		if (
			line.includes('@cluvo/') ||
			line.includes('/packages/sdk/src/') ||
			line.includes('/packages/core/src/')
		)
			continue
		// Skip runtime internals
		if (line.includes('(native:') || line.includes('node:') || line.includes('bun:')) continue

		// Parse: "    at functionName (file:line:col)" or "    at file:line:col"
		const match = line.match(/at\s+(.+)/)
		if (!match) continue
		const rest = match[1]

		// Skip constructor frame
		if (rest.startsWith('new Reporter ') || rest.startsWith('new Reporter (')) continue

		if (process.env.CLUVO_DEBUG) process.stderr.write(`[cluvo] top-level check: ${rest}\n`)

		// Top-level: path without function name, or anonymous wrapper
		if (rest.startsWith('/') || rest.startsWith('.') || /^[a-zA-Z]:/.test(rest)) return true
		if (rest.startsWith('<anonymous>') || rest.startsWith('Object.<anonymous>')) return true
		return false
	}
	return true // couldn't determine → assume top-level
}

const NOOP_REPORT: ErrorReport = {
	id: 'noop',
	createdAt: '',
	app: { name: 'noop', version: '0.0.0', runtime: 'unknown' },
	error: { name: 'Noop', message: '' },
	environment: { os: 'unknown', arch: 'unknown', runtimeVersion: 'unknown' },
	sanitizedFields: [],
	status: 'dismissed',
}

/**
 * Bug reporter for CLI/SDK applications.
 *
 * Must be instantiated at module top-level for correct nested hierarchy detection.
 * Bun applies tail-call optimization to regular function calls, dropping caller
 * frames from stack traces. Using `new` prevents this optimization.
 * See: https://github.com/oven-sh/bun/issues/24789
 *
 * If instantiated inside a named function, all methods silently become no-ops.
 *
 * @example
 * ```ts
 * import { Reporter } from '@cluvo/sdk'
 * const reporter = new Reporter({ repo: 'owner/repo', app: { name: 'my-cli', version: '1.0.0' } })
 * ```
 */
export class Reporter {
	reportError: (error: unknown, context?: ErrorContext) => Promise<ErrorReport>
	reportAndPrompt: (error: unknown, context?: ErrorContext) => Promise<void>
	promptAndSubmit: (report: ErrorReport) => Promise<void>
	wrap: (fn: () => Promise<void>, opts?: WrapOptions) => Promise<void>
	wrapCommand: (fn: () => Promise<void>, opts?: WrapOptions) => Promise<void>
	installGlobalHandlers: () => () => void
	installExitHandler: (opts?: ExitHandlerOptions) => () => void
	buildReport: (error: unknown, context?: ErrorContext) => ErrorReport
	sanitizeReport: (report: ErrorReport) => ErrorReport
	findMatches: (report: ErrorReport) => Promise<MatchResult>
	buildDraft: (report: ErrorReport) => DraftPayload
	publish: (draft: DraftPayload) => Promise<PublishResult>
	receiveChildReport: (report: ErrorReport) => Promise<void>

	constructor(userConfig: ReporterConfig | InternalConfig) {
		// Stack capture via throw/catch inside the constructor.
		// Bun preserves all caller frames for `new` calls (no TCO).
		const internalConfig = userConfig as InternalConfig
		let stack: string
		try {
			throw new Error()
		} catch (e: unknown) {
			stack = (e as Error).stack ?? ''
		}
		if (process.env.CLUVO_DEBUG) process.stderr.write(`[cluvo] raw stack:\n${stack}\n`)
		const callDepth = internalConfig._depth ?? stack.split('\n').length

		if (!internalConfig._skipTopLevelCheck && !checkTopLevel(stack)) {
			// Non-top-level: assign no-op implementations
			this.reportError = async () => NOOP_REPORT
			this.reportAndPrompt = async () => {}
			this.promptAndSubmit = async () => {}
			this.wrap = async (fn) => {
				await fn()
			}
			this.wrapCommand = async (fn) => {
				await fn()
			}
			this.installGlobalHandlers = () => () => {}
			this.installExitHandler = () => () => {}
			this.buildReport = () => NOOP_REPORT
			this.sanitizeReport = (r) => r
			this.findMatches = async () => ({ found: false, matches: [] })
			this.buildDraft = () => ({ title: '', body: '' })
			this.publish = async () => ({ method: 'terminal' as const })
			this.receiveChildReport = async () => {}
			return
		}

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
			depth: callDepth,
			reporter: { receiveChildReport: (report: ErrorReport) => this.receiveChildReport(report) },
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

		// --- Assign methods ---

		this.buildReport = (error: unknown, context?: ErrorContext): ErrorReport => {
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

		this.sanitizeReport = (report: ErrorReport): ErrorReport => {
			if (config.sanitize?.enabled === false) return report
			return sanitize(report, config.sanitize?.customRules)
		}

		this.findMatches = async (report: ErrorReport): Promise<MatchResult> => {
			return match(report, config)
		}

		this.buildDraft = (report: ErrorReport): DraftPayload => {
			const titleFormatter = config.issue?.title
			const title = formatTitle(report, titleFormatter)
			const body = formatBody(report, { sections: config.issue?.sections })
			return { title, body, labels: config.issue?.labels }
		}

		this.publish = async (draft: DraftPayload): Promise<PublishResult> => {
			return corePublish(draft, { repo: config.repo, mode: config.mode })
		}

		this.reportError = async (error: unknown, context?: ErrorContext): Promise<ErrorReport> => {
			if (typeof error === 'object' && error !== null && seenErrors.has(error)) {
				return seenErrors.get(error)!
			}

			try {
				const report = this.buildReport(error, context)
				const sanitized = this.sanitizeReport(report)

				if (config.store?.enabled !== false) {
					await store.save(sanitized)
				}

				if (typeof error === 'object' && error !== null) {
					seenErrors.set(error, sanitized)
				}

				return sanitized
			} catch {
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

		this.promptAndSubmit = async (report: ErrorReport): Promise<void> => {
			const myEntry = registry.stack.find((e) => e.id === reporterId)
			if (myEntry) {
				const parent = registry.getParent(myEntry)
				if (parent) {
					switch (parent.childPolicy) {
						case 'absorb':
							await parent.reporter.receiveChildReport(report)
							return
						case 'silent':
							return
						case 'passthrough':
							break
					}
				}
			}

			const matchResult =
				config.dedupe?.enabled !== false
					? await this.findMatches(report)
					: { found: false, matches: [] }
			if (matchResult.found) {
				report = { ...report, matches: matchResult.matches }
			}

			const draft = this.buildDraft(report)

			if (!presenter) {
				const filePath =
					config.store?.enabled !== false
						? `${config.storeDir}/reports/${report.app.name}/${report.id}.json`
						: undefined
				handleNonInteractive(report, config.nonInteractive ?? 'save', filePath)
				await store.updateStatus(report.app.name, report.id, 'dismissed')
				return
			}

			const authAvailable = await isAuthAvailable()
			try {
				const action = await presenter.prompt({
					report,
					draft,
					authAvailable,
					promptMessage: config.prompt?.message,
					promptSpacing: config.prompt?.spacing,
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
				if (process.env.CLUVO_DEBUG) {
					process.stderr.write(`[cluvo] presenter error: ${err}\n`)
				}
			}
		}

		this.reportAndPrompt = async (error: unknown, context?: ErrorContext): Promise<void> => {
			const report = await this.reportError(error, context)
			await enqueuePrompt(() => this.promptAndSubmit(report))
		}

		this.wrap = async (fn: () => Promise<void>, opts?: WrapOptions): Promise<void> => {
			try {
				await fn()
			} catch (error) {
				await this.reportAndPrompt(error)
				if (opts?.rethrow !== false) throw error
			}
		}

		this.wrapCommand = async (fn: () => Promise<void>, opts?: WrapOptions): Promise<void> => {
			try {
				await fn()
			} catch (error) {
				const context: ErrorContext = {
					command: process.argv[2],
					subcommand: process.argv[3],
					argv: process.argv.slice(2),
				}
				const report = await this.reportError(error, context)
				await enqueuePrompt(() => this.promptAndSubmit(report))
				if (opts?.rethrow !== false) throw error
			}
		}

		this.installGlobalHandlers = (): (() => void) => {
			return installGlobalHandlersCore(async (payload, origin) => {
				const report = await this.reportError(payload, { metadata: { origin } })
				await this.promptAndSubmit(report)
			})
		}

		this.installExitHandler = (opts?: ExitHandlerOptions): (() => void) => {
			return createExitHandler({
				getPendingReports: async () => {
					const reports = await store.list(config.app.name)
					return reports.filter((r) => r.status === 'pending')
				},
				onPending: async (pending) => {
					for (const report of pending) {
						await this.promptAndSubmit(report)
					}
				},
				interceptProcessExit: opts?.interceptProcessExit,
				timeout: opts?.timeout,
			})
		}

		this.receiveChildReport = async (report: ErrorReport): Promise<void> => {
			if (config.store?.enabled !== false) {
				await store.save(report)
			}
			await enqueuePrompt(() => this.promptAndSubmit(report))
		}
	}
}

/** @deprecated Use `new Reporter(config)` instead. Kept for test compatibility. */
export function createReporter(userConfig: ReporterConfig | InternalConfig): Reporter {
	return new Reporter(userConfig)
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
