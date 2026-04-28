import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ErrorReport } from '../types.js'

const REPORTS_DIR = 'reports'

function encodeAppName(appName: string): string {
	return encodeURIComponent(appName)
}

function encodeReportId(id: string): string {
	return encodeURIComponent(id)
}

function decodeAppName(appName: string): string {
	try {
		return decodeURIComponent(appName)
	} catch {
		return appName
	}
}

function legacyScopedPathParts(appName: string): string[] | null {
	const parts = appName.split('/')
	if (parts.length !== 2 || !parts[0].startsWith('@')) return null
	if (
		parts.some((part) => part.length === 0 || part === '.' || part === '..' || part.includes('\\'))
	) {
		return null
	}
	return parts
}

export class Store {
	private baseDir: string
	private maxReports: number

	constructor(baseDir: string, maxReports = 100) {
		this.baseDir = baseDir
		this.maxReports = maxReports
	}

	private reportsDir(): string {
		return join(this.baseDir, REPORTS_DIR)
	}

	private appDir(appName: string): string {
		return join(this.reportsDir(), encodeAppName(appName))
	}

	private legacyAppDir(appName: string): string | null {
		const parts = legacyScopedPathParts(appName)
		return parts ? join(this.reportsDir(), ...parts) : null
	}

	private appDirs(appName: string): string[] {
		const dirs = [this.appDir(appName)]
		const legacy = this.legacyAppDir(appName)
		if (legacy && legacy !== dirs[0]) dirs.push(legacy)
		return dirs
	}

	private filePath(appName: string, id: string): string {
		return join(this.appDir(appName), `${encodeReportId(id)}.json`)
	}

	private candidateFilePaths(appName: string, id: string): string[] {
		return this.appDirs(appName).map((dir) => join(dir, `${encodeReportId(id)}.json`))
	}

	async save(report: ErrorReport): Promise<void> {
		const dir = this.appDir(report.app.name)
		await mkdir(dir, { recursive: true })
		await writeFile(this.filePath(report.app.name, report.id), JSON.stringify(report, null, 2))
		await this.evict(report.app.name)
	}

	async load(appName: string, id: string): Promise<ErrorReport | null> {
		const entry = await this.loadEntry(appName, id)
		return entry?.report ?? null
	}

	private async loadEntry(
		appName: string,
		id: string,
	): Promise<{ report: ErrorReport; path: string } | null> {
		for (const path of this.candidateFilePaths(appName, id)) {
			try {
				const content = await readFile(path, 'utf-8')
				return { report: JSON.parse(content), path }
			} catch {
				// Try the next storage layout.
			}
		}
		return null
	}

	async findById(id: string): Promise<ErrorReport | null> {
		const apps = await this.listApps()
		for (const app of apps) {
			const report = await this.load(app, id)
			if (report) return report
		}
		return null
	}

	async list(appName?: string, options?: { statusFilter?: string }): Promise<ErrorReport[]> {
		const apps = appName ? [appName] : await this.listApps()
		const reports: ErrorReport[] = []

		for (const app of apps) {
			const reportsById = new Map<string, ErrorReport>()
			for (const dir of this.appDirs(app)) {
				try {
					const files = await readdir(dir)
					for (const file of files) {
						if (!file.endsWith('.json')) continue
						let report: ErrorReport
						try {
							const content = await readFile(join(dir, file), 'utf-8')
							report = JSON.parse(content)
						} catch {
							continue
						}
						if (!options?.statusFilter || report.status === options.statusFilter) {
							if (!reportsById.has(report.id)) reportsById.set(report.id, report)
						}
					}
				} catch {
					// directory doesn't exist, skip
				}
			}
			reports.push(...reportsById.values())
		}

		return reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
	}

	async updateStatus(
		appName: string,
		id: string,
		status: 'pending' | 'submitted' | 'dismissed',
		issueUrl?: string,
	): Promise<void> {
		const entry = await this.loadEntry(appName, id)
		if (!entry) return
		entry.report.status = status
		if (issueUrl) entry.report.issueUrl = issueUrl
		if (status === 'submitted') entry.report.submittedAt = new Date().toISOString()
		await writeFile(entry.path, JSON.stringify(entry.report, null, 2))
	}

	async delete(appName: string, id: string): Promise<void> {
		for (const path of this.candidateFilePaths(appName, id)) {
			try {
				await unlink(path)
			} catch {
				// already deleted
			}
		}
	}

	async clean(appName?: string, olderThanMs?: number): Promise<void> {
		const reports = await this.list(appName)
		const now = Date.now()
		for (const report of reports) {
			const shouldClean = report.status === 'submitted' || report.status === 'dismissed'
			const isOld = olderThanMs ? now - new Date(report.createdAt).getTime() > olderThanMs : true
			if (shouldClean && isOld) {
				await this.delete(report.app.name, report.id)
			}
		}
	}

	private async evict(appName: string): Promise<void> {
		const reports = await this.list(appName)
		if (reports.length <= this.maxReports) return

		// Sort by eviction priority: submitted first, then dismissed, then pending
		// Within each group, oldest first
		const priorityOrder = { submitted: 0, dismissed: 1, pending: 2, prompted: 2 }
		const sorted = [...reports].sort((a, b) => {
			const pa = priorityOrder[a.status]
			const pb = priorityOrder[b.status]
			if (pa !== pb) return pa - pb
			return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
		})

		const toRemove = sorted.slice(0, reports.length - this.maxReports)

		const pendingEvicted = toRemove.filter((r) => r.status === 'pending' || r.status === 'prompted')
		if (pendingEvicted.length > 0) {
			process.stderr.write(
				`[cluvo] warning: evicting ${pendingEvicted.length} unreviewed pending report(s) for "${appName}" (limit: ${this.maxReports}). Use \`cluvo list\` to review reports before they are evicted.\n`,
			)
		}

		for (const report of toRemove) {
			await this.delete(appName, report.id)
		}
	}

	private async listApps(): Promise<string[]> {
		try {
			const apps = new Set<string>()
			const entries = await readdir(this.reportsDir(), { withFileTypes: true })
			for (const entry of entries) {
				if (!entry.isDirectory()) continue
				apps.add(decodeAppName(entry.name))

				if (!entry.name.startsWith('@')) continue
				try {
					const children = await readdir(join(this.reportsDir(), entry.name), {
						withFileTypes: true,
					})
					for (const child of children) {
						if (child.isDirectory()) apps.add(`${entry.name}/${child.name}`)
					}
				} catch {
					// legacy scoped directory disappeared, skip
				}
			}
			return [...apps]
		} catch {
			return []
		}
	}
}
