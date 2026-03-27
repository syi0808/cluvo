import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ErrorReport } from '../types.js'

export class Store {
	private baseDir: string
	private maxReports: number

	constructor(baseDir: string, maxReports = 100) {
		this.baseDir = baseDir
		this.maxReports = maxReports
	}

	private appDir(appName: string): string {
		return join(this.baseDir, 'reports', appName)
	}

	private filePath(appName: string, id: string): string {
		return join(this.appDir(appName), `${id}.json`)
	}

	async save(report: ErrorReport): Promise<void> {
		const dir = this.appDir(report.app.name)
		await mkdir(dir, { recursive: true })
		await writeFile(this.filePath(report.app.name, report.id), JSON.stringify(report, null, 2))
		await this.evict(report.app.name)
	}

	async load(appName: string, id: string): Promise<ErrorReport | null> {
		try {
			const content = await readFile(this.filePath(appName, id), 'utf-8')
			return JSON.parse(content)
		} catch {
			return null
		}
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
			try {
				const dir = this.appDir(app)
				const files = await readdir(dir)
				for (const file of files) {
					if (!file.endsWith('.json')) continue
					const content = await readFile(join(dir, file), 'utf-8')
					const report: ErrorReport = JSON.parse(content)
					if (!options?.statusFilter || report.status === options.statusFilter) {
						reports.push(report)
					}
				}
			} catch {
				// directory doesn't exist, skip
			}
		}

		return reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
	}

	async updateStatus(
		appName: string,
		id: string,
		status: 'pending' | 'submitted' | 'dismissed',
		issueUrl?: string,
	): Promise<void> {
		const report = await this.load(appName, id)
		if (!report) return
		report.status = status
		if (issueUrl) report.issueUrl = issueUrl
		if (status === 'submitted') report.submittedAt = new Date().toISOString()
		await writeFile(this.filePath(appName, id), JSON.stringify(report, null, 2))
	}

	async delete(appName: string, id: string): Promise<void> {
		try {
			await unlink(this.filePath(appName, id))
		} catch {
			// already deleted
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

		const pendingEvicted = toRemove.filter(
			(r) => r.status === 'pending' || r.status === 'prompted',
		)
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
			const reportsDir = join(this.baseDir, 'reports')
			return await readdir(reportsDir)
		} catch {
			return []
		}
	}
}
